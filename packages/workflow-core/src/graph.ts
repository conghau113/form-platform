import type { WorkflowDefinition } from "@org/workflow-schema";

export type GraphErrorCode =
  | "duplicate-node"
  | "start-missing"
  | "dangling-transition"
  | "unreachable"
  /** E4 — `start` names a `fork`. The case is STORED parked on the fork (`createInstance` does not
   *  settle), which the engine itself copes with — it settles before choosing a token — but the
   *  product does not: the stored token id has already been consumed by that settle, so a client
   *  echoing it back gets `unknown-token`, and the Run view offers no action for a branch parked on
   *  a gateway. A product-level dead end, not an engine one. No runtime twin. */
  | "start-is-fork"
  /** E4 — a `fork` with fewer than two ways out. Runtime twin: `invalid-gateway` in `advance`. */
  | "fork-single-outgoing"
  /** E4 — an edge leaving a `fork` carries a `guard` or a `role` the engine never evaluates.
   *  Runtime twin: `invalid-gateway` in `advance`. */
  | "fork-edge-gated"
  /** E4 — a `join` without exactly one way out. Runtime twin: `invalid-gateway` in `advance`. */
  | "join-not-one-outgoing"
  /** E4 — a `join`'s single way out carries a `guard` or a `role`. The engine follows that edge the
   *  moment the last sibling arrives, without consulting either. Runtime twin: `invalid-gateway`. */
  | "join-edge-gated";

export interface GraphError {
  code: GraphErrorCode;
  message: string;
  /** The offending node or transition id, when applicable. */
  ref?: string;
}

/**
 * A gateway's outgoing edges are STRUCTURE, not choices — the engine follows them itself (every edge
 * out of a fork, the single edge out of a join once its last sibling arrives) and never consults
 * their `guard` or `role`. One placed there is a gate that stops nobody while reading, to whoever
 * drew it, exactly like a gate that works.
 *
 * `ref` is the GATEWAY, not the edge: the editor routes a ref to its edge highlight only for
 * `dangling-transition` and looks every other one up among NODE ids, so a transition id here would
 * highlight nothing — or a same-named node. The edge is named in the message instead.
 */
function gatedEdges(
  node: WorkflowDefinition["nodes"][number],
  outs: WorkflowDefinition["transitions"],
  errors: GraphError[],
): void {
  // Both derived from the node rather than passed in: the code and the wording are not free choices,
  // they are two spellings of `node.gateway`, and taking them as parameters would let a caller pair
  // a fork with the join message.
  const label = node.gateway === "fork" ? "fork" : "join";
  const code = node.gateway === "fork" ? "fork-edge-gated" : "join-edge-gated";
  for (const t of outs) {
    if (t.guard === undefined && t.role === undefined) continue;
    errors.push({
      code,
      message: `Transition "${t.id}" leaves ${label} "${node.id}" carrying a ${
        t.guard !== undefined ? "guard" : "role"
      }, which a ${label} never evaluates.`,
      ref: node.id,
    });
  }
}

/**
 * Structural validation of a workflow definition. Returns [] when the graph is
 * sound. Checks: unique node ids, a single existing `start` node, every
 * transition references existing nodes, and every node is reachable from `start`
 * (BFS over transitions). Used by the editor before export.
 *
 * E4 adds the gateway rules below. Every one of them is keyed off `node.gateway`, so a definition
 * that uses no gateway can satisfy none of them — this function's answer for every graph written
 * before parallel flow existed is byte-for-byte the answer it gave before. That property is not a
 * nicety: these codes join a list that gates saving in the editor, starting a case (422) and the AI
 * repair loop, so a rule that fired on an old graph would break all three at once.
 */
export function validateGraph(def: WorkflowDefinition): GraphError[] {
  const errors: GraphError[] = [];

  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const node of def.nodes) {
    if (seen.has(node.id)) {
      errors.push({
        code: "duplicate-node",
        message: `Duplicate node id "${node.id}".`,
        ref: node.id,
      });
    }
    seen.add(node.id);
    ids.add(node.id);
  }

  if (!ids.has(def.start)) {
    errors.push({
      code: "start-missing",
      message: `Start node "${def.start}" does not exist.`,
      ref: def.start,
    });
  }

  for (const t of def.transitions) {
    if (!ids.has(t.from) || !ids.has(t.to)) {
      errors.push({
        code: "dangling-transition",
        message: `Transition "${t.id}" references a missing node (${t.from} → ${t.to}).`,
        ref: t.id,
      });
    }
  }

  // Reachability is only meaningful once `start` is real.
  if (ids.has(def.start)) {
    const adjacency = new Map<string, string[]>();
    for (const t of def.transitions) {
      if (ids.has(t.from) && ids.has(t.to)) {
        (adjacency.get(t.from) ?? adjacency.set(t.from, []).get(t.from)!).push(t.to);
      }
    }
    const reachable = new Set<string>([def.start]);
    const queue = [def.start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of def.nodes) {
      if (!reachable.has(node.id)) {
        errors.push({
          code: "unreachable",
          message: `Node "${node.id}" is not reachable from start "${def.start}".`,
          ref: node.id,
        });
      }
    }
  }

  // E4 — the STATIC twins of the `invalid-gateway` refusals in `advance`. They are two views of one
  // rule set and must be kept in step: a graph the engine will refuse to run should not be saveable
  // in the first place. The one runtime refusal with NO twin here is a token whose fork run is
  // missing from `scopes` — that is a property of a running case, not of a definition, so it cannot
  // be read off the graph at all. Do not go looking for it.
  for (const node of def.nodes) {
    if (!node.gateway) continue;
    const outs = def.transitions.filter((t) => t.from === node.id);

    if (node.gateway === "fork") {
      if (outs.length < 2) {
        errors.push({
          code: "fork-single-outgoing",
          message: `Fork "${node.id}" has ${outs.length} outgoing transition(s); a fork needs at least 2.`,
          ref: node.id,
        });
      }
      gatedEdges(node, outs, errors);
    } else if (node.gateway === "join") {
      if (outs.length !== 1) {
        errors.push({
          code: "join-not-one-outgoing",
          message: `Join "${node.id}" has ${outs.length} outgoing transition(s); a join needs exactly 1.`,
          ref: node.id,
        });
      }
      gatedEdges(node, outs, errors);
    }
  }

  // Only a FORK, and not because the engine cannot run it — it can. `createInstance` parks the first
  // token on `def.start` without settling, but `advance` settles BEFORE choosing a token, so the
  // fork explodes on the first action (see `engine.test.ts`, "settles a case whose START is a fork").
  // What breaks is the PRODUCT around it: the token id the case was stored with is consumed by that
  // settle, so a client echoing it back gets `unknown-token`, and the Run view offers no action at
  // all for a branch parked on a gateway. A start JOIN has neither problem — its token is
  // root-scoped, with no siblings to wait for, so it merely passes through.
  const startNode = def.nodes.find((n) => n.id === def.start);
  if (startNode?.gateway === "fork") {
    errors.push({
      code: "start-is-fork",
      message: `Start node "${def.start}" is a fork; a case would be stored already parked on it, with a token id the next advance has already consumed.`,
      ref: def.start,
    });
  }

  return errors;
}

/** Advisory (non-blocking) lint codes. Unlike {@link GraphErrorCode}, these never gate save or the
 *  AI normalize/repair loop — they flag a graph that parses and runs but is probably a mistake. */
export type GraphWarningCode = "dead-end" | "end-has-outgoing";

export interface GraphWarning {
  code: GraphWarningCode;
  message: string;
  /** The offending node id. */
  ref?: string;
}

/**
 * Advisory structural checks, kept SEPARATE from {@link validateGraph} on purpose: the editor's save
 * gate and the AI moat (`normalizeWorkflowDraft` → repair loop) treat every `validateGraph` error as
 * fatal, so these "suspicious but runnable" findings must NOT live there. Returns [] for a clean
 * graph. Uses the WE4 `kind` snapshot (start/normal/end); old definitions without `kind` are left
 * alone so a kind-less terminal never gets nagged.
 *
 *   - `dead-end`: a node expected to continue (the start node, or `kind` start/normal) has no
 *     outgoing transition. Suppressed for a single-node draft (nothing to flag yet).
 *   - `end-has-outgoing`: a `kind: "end"` node still has an outgoing transition.
 */
export function lintGraph(def: WorkflowDefinition): GraphWarning[] {
  const warnings: GraphWarning[] = [];
  // A trivial one-node draft is incomplete by construction — don't nag.
  if (def.nodes.length <= 1) return warnings;

  const hasOutgoing = new Set(def.transitions.map((t) => t.from));

  for (const node of def.nodes) {
    const out = hasOutgoing.has(node.id);

    // dead-end: expected to continue but goes nowhere.
    const expectedToContinue =
      node.id === def.start || node.kind === "start" || node.kind === "normal";
    if (!out && expectedToContinue) {
      warnings.push({
        code: "dead-end",
        message: `Node "${node.id}" has no outgoing transition, so the workflow cannot continue past it.`,
        ref: node.id,
      });
    }

    // end-has-outgoing: a terminal state that still leads somewhere.
    if (out && node.kind === "end") {
      warnings.push({
        code: "end-has-outgoing",
        message: `End node "${node.id}" still has an outgoing transition.`,
        ref: node.id,
      });
    }
  }

  return warnings;
}
