import {
  type HistoryEntry,
  ROOT_SCOPE,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowScope,
  type WorkflowToken,
  type WorkflowTransition,
} from "@org/workflow-schema";
import jsonLogic from "json-logic-js";
import { readMarking } from "./marking.js";

/** Inputs an advance is evaluated against. */
export interface AdvanceContext {
  /** Case data merged over the instance's stored data for guard evaluation + persistence. */
  data?: Record<string, unknown>;
  /** Roles the actor holds; checked against a transition's required `role`. */
  roles?: string[];
  /** Who is firing the action (a user id) — recorded on the history entry (Phase E work-order).
   *  Omitted ⇒ the entry is written exactly as before, so existing callers are unaffected. */
  actor?: string;
  /**
   * E3a — WHICH token to move, when the case stands in more than one place.
   *
   * Omitted, the engine considers every token and moves the only one that CAN fire the action;
   * if two could, it refuses with `ambiguous-token` rather than guessing. That refusal is not a
   * corner case: the textbook use of a fork is two people approving in parallel with the same
   * action, so a parallel case is ambiguous by construction.
   *
   * ⚠️ Matched against the marking AFTER gateways have settled, which is the marking the case is
   * really in — not the one it was stored in. A case stored while parked on a gateway therefore
   * hands out token ids that are consumed before the next advance matches, so a caller echoing back
   * an id it legitimately read can still get `unknown-token`. (Reachable only via a definition whose
   * `start` is a fork; the static rule that rejects one belongs to E4.)
   *
   * ⚠️ SECURITY: this is matched against the live marking and nothing else. A token id that is not
   * currently in the marking is refused (`unknown-token`) — the engine never treats a caller's
   * string as a position, or someone able to run a case could fire a transition from any node in
   * the graph and walk straight past the guards and roles attached to where the case actually is.
   */
  token?: string;
}

export type AdvanceFailure =
  | "unknown-state"
  | "no-transition"
  | "guard-failed"
  | "role-denied"
  /** E3a — the caller named a token that is not in the case's current marking. */
  | "unknown-token"
  /** E3a — no token was named and more than one could fire the action. */
  | "ambiguous-token"
  /**
   * E3a — a gateway in the definition cannot be executed as written: a `fork` with fewer than two
   * outgoing transitions, a `join` without exactly one, a fork whose outgoing edges carry a `guard`
   * or a `role` (the engine traverses those edges structurally and would silently ignore the gate),
   * or a NON-ROOT token whose fork run is missing from `scopes` (a root-scoped one has no run to be
   * missing, and walks through).
   *
   * Reported at RUN time rather than thrown, because a definition can be edited under a running
   * case: `validateGraph` only gates saving, starting and the AI repair loop, so a case can reach a
   * gateway that was fine when it started. E4 adds the STATIC twins of these rules — they are two
   * views of one rule set, and must be kept in step.
   *
   * Refusing here does not strand the case: the API loads the LATEST definition on every advance,
   * so fixing the graph makes the case runnable again.
   */
  | "invalid-gateway"
  /** E3a — settling gateways did not reach a resting state (a fork cycle). Bounded rather than
   *  trusted: the settle loop is synchronous, so an unbounded one would hang the whole API. */
  | "gateway-overflow";

export type AdvanceResult =
  | { ok: true; instance: WorkflowInstance; transition: WorkflowTransition }
  | { ok: false; reason: AdvanceFailure };

/**
 * Pure workflow engine. Identical behavior on the frontend and a NestJS backend:
 * no React, no DOM, no I/O. Given (definition, instance, action, context) it
 * evaluates guards (SAFE JSONLogic — never eval) and roles and returns a NEW
 * instance; it never mutates its inputs.
 */

/**
 * Start a fresh instance at the definition's `start` node, pinning the version.
 *
 * A generated id is `<definition>-<millis>-<random>`. The random part is NOT decoration: the
 * timestamp alone repeats for two cases started on the same workflow within the same millisecond,
 * and a store that writes by id (the API upserts) would then silently overwrite one case with the
 * other. `crypto.randomUUID` is available in every runtime this package targets (browsers and
 * Node >= 18).
 */
export function createInstance(
  def: WorkflowDefinition,
  opts: { id?: string; data?: Record<string, unknown> } = {},
): WorkflowInstance {
  return {
    id: opts.id ?? `${def.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    definitionId: def.id,
    definitionVersion: def.workflowVersion,
    current: def.start,
    data: { ...(opts.data ?? {}) },
    history: [],
    // E3a — a fresh case is written WITH its marking, not left for `readMarking` to synthesize.
    // Synthesis exists for cases stored before markings did; letting new cases fall into it would
    // stamp every one of them with `LEGACY_TOKEN_ID`, making that name a lie about its own contents.
    tokens: [{ id: INITIAL_TOKEN_ID, at: def.start, scope: ROOT_SCOPE }],
    scopes: {},
  };
}

/**
 * Id of the token a fresh case starts with.
 *
 * Fixed, not generated: a new case has exactly one place it can be, so there is nothing to tell
 * apart. It cannot collide with the ids handed out later — those are all derived from a scope id,
 * which is always prefixed `s-` (see {@link forkScopeId}) — nor with `LEGACY_TOKEN_ID`.
 */
export const INITIAL_TOKEN_ID = "root-0";

/** A fork run's id. The `s-` prefix is load-bearing twice over: it keeps a generated scope from ever
 *  equalling {@link ROOT_SCOPE} (which `workflowInstanceSchema` refuses as a key) and it keeps the
 *  token ids derived from it out of the way of {@link INITIAL_TOKEN_ID}. */
function forkScopeId(): string {
  return `s-${crypto.randomUUID().slice(0, 8)}`;
}

/** A marking plus the history the engine wrote getting it there, or why it could not. */
type SettleResult =
  | {
      ok: true;
      tokens: WorkflowToken[];
      scopes: Record<string, WorkflowScope>;
      history: HistoryEntry[];
    }
  | { ok: false; reason: "invalid-gateway" | "gateway-overflow" };

/**
 * Run every gateway that is ready to run, until the marking rests.
 *
 * Gateways are traversed BY THE ENGINE, not fired by a person: a fork splits the moment a token
 * lands on it, and a join releases the moment its last sibling arrives. So neither is ever a place
 * a case can be found standing — settling is what makes that true, and it is why this runs both
 * before token selection and after the move (a case whose `start` IS a fork has a token sitting on
 * a gateway before anyone has done anything).
 *
 * No clock (the caller passes `at`), no I/O, no mutation of its inputs, and idempotent: settling an
 * already-settled marking changes nothing. NOT pure, though — a fork mints a scope id, so settling
 * a marking that still has a fork to run twice yields two different ids for the same run.
 *
 * ⚠️ A fork's outgoing edges are STRUCTURE, not choices — every one of them is taken, so their
 * `guard` and `role` are not consulted. That is what "parallel" means (a fork that asked a guard
 * would just be the branching the engine already had), but it also means such an edge would be a
 * gate that silently stops nobody, so a fork carrying one is refused outright rather than executed.
 * Their `action` is still recorded, so history says how each branch was entered.
 */
function settle(
  def: WorkflowDefinition,
  tokensIn: readonly WorkflowToken[],
  scopesIn: Record<string, WorkflowScope | undefined>,
  at: string,
  actor?: string,
): SettleResult {
  const tokens = [...tokensIn];
  const scopes: Record<string, WorkflowScope> = {};
  for (const [id, scope] of Object.entries(scopesIn)) {
    if (scope) scopes[id] = scope;
  }
  const history: HistoryEntry[] = [];
  const entry = (t: WorkflowTransition, token: string): HistoryEntry => ({
    from: t.from,
    to: t.to,
    action: t.action,
    at,
    ...(actor ? { actor } : {}),
    token,
  });

  // Counted per token-through-gateway, NOT per sweep of the marking. A fork feeding a fork doubles
  // the token set every sweep, so a sweep-based bound would be reached only after the token array
  // had already exhausted memory. One traversal always consumes one token, so this bound is hit
  // long before the array can grow. Linear in the graph (not quadratic) for the same reason: the
  // loop is synchronous, and a bound big enough to matter would block the API before it tripped.
  const maxSteps = 4 * (def.nodes.length + def.transitions.length) + 16;
  let steps = 0;

  for (;;) {
    let moved = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // A token standing on a node the definition no longer has is left exactly where it is, for
      // `advance` to report as `unknown-state`. Reading `.gateway` off the missing node here would
      // throw, turning a case that merely outlived an edit into a 500 instead of a 422.
      const node = def.nodes.find((n) => n.id === token.at);
      if (!node?.gateway) continue;
      const outs = def.transitions.filter((t) => t.from === node.id);

      if (node.gateway === "fork") {
        if (outs.length < 2) return { ok: false, reason: "invalid-gateway" };
        if (outs.some((t) => t.role !== undefined || t.guard !== undefined)) {
          return { ok: false, reason: "invalid-gateway" };
        }
        const scopeId = forkScopeId();
        // ⚠️ Deliberately asymmetric with the join below, which refuses a scope it cannot find: a
        // fork records the consumed token's scope as `parent` WITHOUT checking that run still
        // exists. Refusing here would strand a token on the fork itself, with no action anyone
        // could fire to move it; the join is where a dangling parent is caught, and it is caught
        // there for the whole subtree at once.
        //
        // ⚠️ A fork run is only retired by the join that closes it, so a graph that loops back into
        // a fork without ever reaching its join accumulates one scope per lap, and the case body
        // grows with it. Bounding that needs the STATIC reachability rule E4 adds — the settle cap
        // below only bounds one call.
        scopes[scopeId] = {
          forkNode: node.id,
          expected: outs.length,
          // The outermost scope is IMPLICIT — it has no entry — so it is recorded as `null` here
          // rather than by name; see ROOT_SCOPE's contract note.
          parent: token.scope === ROOT_SCOPE ? null : token.scope,
        };
        const spawned = outs.map((t, index) => ({
          id: `${scopeId}-${index}`,
          at: t.to,
          scope: scopeId,
        }));
        // Spliced in place of the consumed token so the branches land where their parent was: the
        // order of `tokens` decides the representative `current`, and a case must not appear to
        // jump around because a fork appended instead of replacing.
        tokens.splice(i, 1, ...spawned);
        for (const [index, t] of outs.entries()) history.push(entry(t, spawned[index].id));
        moved = true;
        break;
      }

      // join
      if (outs.length !== 1) return { ok: false, reason: "invalid-gateway" };
      const run = scopes[token.scope];
      // A token at the outermost level belongs to no fork run, so it has no siblings to wait for
      // and passes straight through. Reached by a case stored before markings (its synthesized
      // token is root-scoped) and by a loop back into a join whose run has already settled.
      // ⚠️ Deliberately NOT extended to any missing scope: a fork-created run that has already been
      // deleted also reads as missing, and treating THAT as "nothing to wait for" would let a
      // straggler walk through a join a second time and run everything past it twice, in silence.
      if (!run && token.scope !== ROOT_SCOPE) return { ok: false, reason: "invalid-gateway" };
      const expected = run?.expected ?? 1;
      const siblings = tokens.filter((t) => t.at === node.id && t.scope === token.scope);
      // `>=` rather than `===`: reaching this with more tokens than the fork spawned should be
      // impossible, and if it ever happens, releasing is recoverable where waiting for a count that
      // has already been passed is a case parked forever.
      if (siblings.length < expected) continue;
      // Passing through takes ONE token with it, not every root-scoped token that happens to be
      // parked here — those are unrelated arrivals, and consuming them while emitting a single
      // replacement would quietly delete branches. A fork run is different: its whole point is that
      // its siblings merge into one.
      const arrived = run ? siblings : [token];

      const out = outs[0];
      const merged: WorkflowToken = run
        ? { id: `${token.scope}-j`, at: out.to, scope: run.parent ?? ROOT_SCOPE }
        : { id: token.id, at: out.to, scope: ROOT_SCOPE };
      // The merged token takes the place of the FIRST sibling to have arrived, rather than being
      // appended: `current` is read off the head of this array, so a case would otherwise appear to
      // jump backwards to some unrelated branch the moment a join released.
      //
      // The index survives the removal unchanged. Everything before the first consumed token is, by
      // definition of "first", not one of the tokens being removed.
      const firstAt = tokens.indexOf(arrived[0]);
      const kept = tokens.filter((t) => !arrived.includes(t));
      kept.splice(firstAt, 0, merged);
      tokens.length = 0;
      tokens.push(...kept);
      if (run) delete scopes[token.scope];
      history.push(entry(out, merged.id));
      moved = true;
      break;
    }
    if (!moved) break;
    steps++;
    if (steps > maxSteps) return { ok: false, reason: "gateway-overflow" };
  }

  return { ok: true, tokens, scopes, history };
}

/** Transitions leaving `current`, in definition order. */
export function availableTransitions(
  def: WorkflowDefinition,
  current: string,
): WorkflowTransition[] {
  return def.transitions.filter((t) => t.from === current);
}

function roleAllowed(transition: WorkflowTransition, roles: string[]): boolean {
  if (!transition.role) return true;
  return roles.includes(transition.role);
}

function guardPasses(transition: WorkflowTransition, data: Record<string, unknown>): boolean {
  if (!transition.guard?.rule) return true;
  return Boolean(jsonLogic.apply(transition.guard.rule, data));
}

/**
 * Fire `action` against a running case. Multiple transitions may share an action — the first whose
 * role AND guard pass wins (guard-based branching).
 *
 * E3a — a case can stand in several places at once, so the engine works from the MARKING
 * (`readMarking`) rather than from `current`. With one token — every case written before markings
 * existed, and every case on a graph without gateways — this is the same walk it always was, and
 * every failure reason is the same one it always returned.
 *
 * WHICH token moves: the one `ctx.token` names, or, when nothing is named, the only one that can
 * fire the action. Two that can ⇒ `ambiguous-token`, because picking one would silently advance
 * somebody else's branch.
 *
 * ⚠️ A token is judged by whether it CAN fire — role and guard included — not merely by standing
 * somewhere the action exists. So two people parked in front of the same action are not ambiguous
 * when only one of them passes its guard; the case still moves. The flip side is that editing a
 * guard can change which token an untargeted advance picks, which is precisely why `ctx.token`
 * exists for callers that care.
 *
 * Failure precedence when nothing fires: role-denied > guard-failed > unknown-state >
 * no-transition. `unknown-state` sits low deliberately: it is now a per-token observation, and
 * ranking it first would let one token left behind by an edited definition mask the real answer for
 * every other token on the case — for every action — until someone fixed the graph.
 *
 * The returned `transition` is the one a PERSON fired. Gateways the engine walked through on the
 * way are in the instance's history, not here.
 */
export function advance(
  def: WorkflowDefinition,
  instance: WorkflowInstance,
  action: string,
  ctx: AdvanceContext = {},
): AdvanceResult {
  const at = new Date().toISOString();
  const marking = readMarking(instance);

  // Before choosing, not only after: a case can already be sitting on a gateway — `createInstance`
  // parks its first token on `def.start`, which may itself be a fork — and a token stuck on a
  // gateway has no action anyone could fire to get it off.
  const pre = settle(def, marking.tokens, marking.scopes, at, ctx.actor);
  if (!pre.ok) return { ok: false, reason: pre.reason };

  let considered = pre.tokens;
  if (ctx.token !== undefined) {
    const named = pre.tokens.find((t) => t.id === ctx.token);
    // Matched against the live marking, never trusted as a position. See AdvanceContext.token.
    if (!named) return { ok: false, reason: "unknown-token" };
    considered = [named];
  }

  const roles = ctx.roles ?? [];
  const data = { ...instance.data, ...(ctx.data ?? {}) };

  let sawUnknownState = false;
  let sawRoleDenied = false;
  let sawGuardFailed = false;
  const fired: Array<{ token: WorkflowToken; transition: WorkflowTransition }> = [];

  for (const token of considered) {
    if (!def.nodes.some((n) => n.id === token.at)) {
      sawUnknownState = true;
      continue;
    }
    for (const transition of availableTransitions(def, token.at)) {
      if (transition.action !== action) continue;
      if (!roleAllowed(transition, roles)) {
        sawRoleDenied = true;
        continue;
      }
      if (!guardPasses(transition, data)) {
        sawGuardFailed = true;
        continue;
      }
      fired.push({ token, transition });
      break;
    }
  }

  if (fired.length === 0) {
    if (sawRoleDenied) return { ok: false, reason: "role-denied" };
    if (sawGuardFailed) return { ok: false, reason: "guard-failed" };
    if (sawUnknownState) return { ok: false, reason: "unknown-state" };
    return { ok: false, reason: "no-transition" };
  }
  if (fired.length > 1) return { ok: false, reason: "ambiguous-token" };

  const { token, transition } = fired[0];
  const moved = pre.tokens.map((t) => (t.id === token.id ? { ...t, at: transition.to } : t));
  const post = settle(def, moved, pre.scopes, at, ctx.actor);
  if (!post.ok) return { ok: false, reason: post.reason };

  const instanceOut: WorkflowInstance = {
    ...instance,
    // The REPRESENTATIVE place, not the whole truth once a fork has run — `tokens` below is. Kept
    // written so a build that predates markings keeps reading a case this one has advanced.
    current: post.tokens[0].at,
    data,
    history: [
      ...instance.history,
      ...pre.history,
      {
        from: transition.from,
        to: transition.to,
        action: transition.action,
        at,
        // Only present when the caller identified the actor — keeps entries byte-identical for
        // callers that don't (and keeps `actor` genuinely optional in the contract).
        ...(ctx.actor ? { actor: ctx.actor } : {}),
        token: token.id,
      },
      ...post.history,
    ],
    tokens: post.tokens,
    // Written unconditionally, empty included: the output is spread from `instance`, so omitting it
    // when nothing is left would carry the case's OLD scopes — including runs a join has since
    // closed — straight into what gets stored.
    scopes: post.scopes,
  };
  return { ok: true, instance: instanceOut, transition };
}
