import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowTransition,
} from "@org/workflow-schema";
import jsonLogic from "json-logic-js";

/** Inputs an advance is evaluated against. */
export interface AdvanceContext {
  /** Case data merged over the instance's stored data for guard evaluation + persistence. */
  data?: Record<string, unknown>;
  /** Roles the actor holds; checked against a transition's required `role`. */
  roles?: string[];
  /** Who is firing the action (a user id) — recorded on the history entry (Phase E work-order).
   *  Omitted ⇒ the entry is written exactly as before, so existing callers are unaffected. */
  actor?: string;
}

export type AdvanceFailure = "unknown-state" | "no-transition" | "guard-failed" | "role-denied";

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
  };
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
 * Fire `action` from the instance's current state. Multiple transitions may share
 * an action — the first whose role AND guard pass wins (guard-based branching).
 * Failure precedence when none fire: role-denied > guard-failed > no-transition.
 */
export function advance(
  def: WorkflowDefinition,
  instance: WorkflowInstance,
  action: string,
  ctx: AdvanceContext = {},
): AdvanceResult {
  const node = def.nodes.find((n) => n.id === instance.current);
  if (!node) return { ok: false, reason: "unknown-state" };

  const candidates = availableTransitions(def, instance.current).filter((t) => t.action === action);
  if (candidates.length === 0) return { ok: false, reason: "no-transition" };

  const roles = ctx.roles ?? [];
  const data = { ...instance.data, ...(ctx.data ?? {}) };

  let sawRoleDenied = false;
  let sawGuardFailed = false;
  for (const transition of candidates) {
    if (!roleAllowed(transition, roles)) {
      sawRoleDenied = true;
      continue;
    }
    if (!guardPasses(transition, data)) {
      sawGuardFailed = true;
      continue;
    }
    const instanceOut: WorkflowInstance = {
      ...instance,
      current: transition.to,
      data,
      history: [
        ...instance.history,
        {
          from: transition.from,
          to: transition.to,
          action: transition.action,
          at: new Date().toISOString(),
          // Only present when the caller identified the actor — keeps entries byte-identical for
          // callers that don't (and keeps `actor` genuinely optional in the contract).
          ...(ctx.actor ? { actor: ctx.actor } : {}),
        },
      ],
    };
    return { ok: true, instance: instanceOut, transition };
  }

  if (sawRoleDenied) return { ok: false, reason: "role-denied" };
  if (sawGuardFailed) return { ok: false, reason: "guard-failed" };
  return { ok: false, reason: "no-transition" };
}
