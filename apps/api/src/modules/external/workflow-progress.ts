import { EVN_PCT_WORKFLOW_NODES, type EvnWorkflowNodeDef } from "./evn-workflow-nodes.js";

/**
 * Where the ticket stands in EVN's PCT workflow (QĐ-2), projected from state EVN ALREADY STORED.
 *
 * ⚠️ This is a PROJECTION, never a simulation, and the difference is the whole design (QĐ-5). EVN
 * decides node state event-by-event in `checkConditionMethod` (`workflow.service.ts:2428-2473`) and
 * writes the result to a ticket item; re-deriving it here would make us a SECOND source of truth for
 * one flow — the disease this integration exists to avoid, and the reason endpoint A is recommended
 * against. So we read what they stored and say what it means, nothing more. It follows that
 * `progress` describes the ticket BEFORE the action being checked, which is what a pre-check is for.
 *
 * ⚠️ It is therefore also possible for `progress` to be perfectly readable and the transition still
 * refused, or the reverse: the two answer different questions from different tables.
 */

/** The ticket item EVN stores node state under (`form.enum.ts:508`). */
export const EVN_WORKFLOW_NODES_ITEM = "WORKFLOW_NODES";

/**
 * A node's state.
 *
 * The first three are EVN's own `EWorkflowNodeEdgeStatus` (`workflow.enum.ts:1-5`), copied through
 * unchanged. `NOT_REACHED` is OURS, for a node absent from the stored map — EVN has no such member,
 * and borrowing one of theirs for it would put a word in their mouth.
 */
export type EvnWorkflowNodeState = "ADDED" | "PROCESSING" | "COMPLETED" | "NOT_REACHED";

const EVN_NODE_STATUSES: readonly string[] = ["ADDED", "PROCESSING", "COMPLETED"];

export interface WorkflowNodeProgress {
  readonly nodeCode: string;
  readonly order: number;
  readonly state: EvnWorkflowNodeState;
  readonly completedBy: readonly string[];
  readonly completedByNode?: string;
}

export interface WorkflowProgress {
  /** Every node of the definition, in flow order — including the ones not reached. */
  readonly nodes: readonly WorkflowNodeProgress[];
  readonly completed: number;
  readonly total: number;
  /**
   * Node codes present in `ticketData` that our definition does not know.
   *
   * Definition drift, not an error: EVN adding a node is exactly what `definitionVersion` exists to
   * make visible, and refusing the whole projection over it would be the wrong severity.
   */
  readonly unknownNodes: readonly string[];
}

/** Why we could not project. Mirrors the `unverifiedFields` vocabulary P4c established. */
export type WorkflowUnverifiedReason =
  | "TICKET_DATA_ABSENT"
  | "ITEM_ABSENT"
  | "ITEM_UNREADABLE"
  | "NODE_UNREADABLE"
  | "STATUS_NOT_MODELLED";

export interface UnverifiedWorkflow {
  readonly itemCode: string;
  readonly reason: WorkflowUnverifiedReason;
}

export interface WorkflowProjection {
  /**
   * `null` when we could not read the stored state — NEVER an empty or zeroed projection.
   *
   * A `completed: 0` for "you did not tell us" reads as "we looked, the ticket has not moved": the
   * strongest possible claim from the least knowledge, and the exact failure `unverifiedFields` was
   * invented for in P4c. `null` is also PRESENCE-STABLE, which a dropped key would not be — see the
   * note on `requiredFields` in `check-transition.ts` about fields that appear and disappear with an
   * unrelated input.
   */
  readonly progress: WorkflowProgress | null;
  /** Empty exactly when {@link progress} is non-null. */
  readonly unverified: readonly UnverifiedWorkflow[];
}

/**
 * The stored node map, out of either shape a caller might reasonably send.
 *
 * EVN stores `value = { data: Record<nodeCode, node> }` (`workflow.service.ts:1114-1118`) and reads
 * it back as `value?.data` (`:901`, `:1131`), so both the wrapper and the bare map are things a
 * caller can honestly believe is "the item". `rowsOf` in `required-content.ts` accepts both shapes
 * for the same reason; accepting one shape here and two there would be a contract nobody can guess.
 *
 * ⚠️ NOT `rowsOf` itself, and this is load-bearing: that function requires the payload to be an
 * ARRAY of rows and returns `"unusable"` for anything else. Every node map is an OBJECT keyed by
 * node code, so routing this item through `rowsOf` turns a perfectly valid request into a 422.
 * `WORKFLOW_NODES` never reaches it today only because it is absent from
 * `EVN_PCT_REQUIRED_CONTENT` — an accident of which items have content guards, not a rule.
 */
function nodeMapOf(raw: unknown, known: ReadonlySet<string>): Record<string, unknown> | "unusable" {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "unusable";

  const record = raw as Record<string, unknown>;
  const wrapped = record.data;
  const unwrap = wrapped !== null && typeof wrapped === "object" && !Array.isArray(wrapped);
  // Unwrapping while the OUTER record also holds node codes would silently discard them — measured
  // on a payload carrying `{ data: {} }` next to two real nodes, which projected as "nothing has
  // happened yet" rather than as a shape we could not read.
  if (unwrap && Object.keys(record).some((key) => known.has(key))) return "unusable";
  // Same family: an EMPTY wrapper beside other keys. Those keys are not node codes (the line above
  // ruled that out) and they are not the wrapper, so the payload is something else wearing a `data`
  // key — a whole `ticket_items` row, say. Unwrapping it would discard the evidence and report a
  // ticket that has not started.
  if (unwrap && Object.keys(wrapped as object).length === 0) {
    if (Object.keys(record).some((key) => key !== "data")) return "unusable";
  }
  const map = unwrap ? (wrapped as Record<string, unknown>) : record;

  // A node literally named `data` would make the two shapes indistinguishable. Every measured code
  // is `PCT_WORKFLOW_NODE__*`, so this cannot happen today; the gate is here for the day it can,
  // because the alternative is guessing which shape we were handed.
  //
  // ⚠️ Also where `{ data: null }` lands: it does not unwrap, so `map` is the outer record and this
  // line catches it. EVN's own readers would take `value?.data || {}` as an empty map, and we are
  // deliberately stricter — they are reading something they wrote, we are reading something we were
  // sent, and "the wrapper is present but empty" is not a claim we can make on their behalf.
  if (Object.hasOwn(map, "data")) return "unusable";

  // 🔴 The gate that keeps this from fail-open. A map with keys but NOT ONE recognisable node code
  // is not "a ticket that has not started" — it is a shape we did not understand, and reporting
  // `completed: 0` for it is the strongest possible claim from the least knowledge. Measured, all
  // of these previously projected 0/15 with an empty `unverified`: the whole `ticket_items` row
  // (`{id, code, ticketId, value}`), a `{value: {data: …}}` wrapper, a mistyped `{datas: …}`, and
  // plain garbage.
  //
  // ⚠️ An EMPTY map is exempt and stays a real projection — but NOT because EVN stores `{}`. It does
  // not: the reset at `workflow.service.ts:389-390` mutates the in-memory item only, and
  // `saveWorkflowNodes` early-returns on an empty map (`:1107-1109`), so a stored row is always
  // non-empty and a ticket with no row has no item at all. The real reason is that EVN's own readers
  // spell it `?.value?.data || {}` (`:901`, `:1131`), so a caller assembling `ticketData` the same
  // way sends `{}` for a ticket that has not started — and for that caller, 0 of 15 is the truth.
  const keys = Object.keys(map);
  if (keys.length > 0 && !keys.some((key) => known.has(key))) return "unusable";
  return map;
}

/** One stored node's status, or `null` if it is not a status we model. */
function statusOf(stored: unknown): EvnWorkflowNodeState | null {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return null;
  const status = (stored as Record<string, unknown>).status;
  return typeof status === "string" && EVN_NODE_STATUSES.includes(status)
    ? (status as EvnWorkflowNodeState)
    : null;
}

/**
 * Project `ticketData` onto the workflow definition.
 *
 * ⚠️ ONE unreadable node fails the WHOLE projection rather than degrading that node to
 * `NOT_REACHED`. Degrading would report "has not got there yet" for something we simply could not
 * read — a wrong answer dressed as a real one, where `null` is merely an absent one.
 *
 * ⚠️ Known limit, published rather than hidden: `status` is written by EVN's own code, not typed by
 * the caller, so a NEW `EWorkflowNodeEdgeStatus` member would take `progress` to `null` for every
 * ticket at once. No test here can see that coming, and `definitionVersion` will not move for it
 * either — we hash their tables, not their enums.
 *
 * @param ticketData the request's `ticketData`, exactly as it arrived (QĐ-5: before the action).
 * @param definition injectable so the tests can prove the projection is driven by the table rather
 * than by anything hard-coded here.
 */
export function projectWorkflow(
  ticketData: Record<string, unknown> | null | undefined,
  definition: readonly EvnWorkflowNodeDef[] = EVN_PCT_WORKFLOW_NODES,
): WorkflowProjection {
  const unverified = (reason: WorkflowUnverifiedReason): WorkflowProjection => ({
    progress: null,
    unverified: [{ itemCode: EVN_WORKFLOW_NODES_ITEM, reason }],
  });

  if (ticketData === null || ticketData === undefined) return unverified("TICKET_DATA_ABSENT");
  if (!Object.hasOwn(ticketData, EVN_WORKFLOW_NODES_ITEM)) return unverified("ITEM_ABSENT");

  const raw = ticketData[EVN_WORKFLOW_NODES_ITEM];
  // `null` here is the caller saying "this item is empty", which we cannot tell apart from "not
  // sent" — same answer as an absent key rather than a projection of nothing.
  if (raw === null || raw === undefined) return unverified("ITEM_ABSENT");

  const known = new Set(definition.map((node) => node.nodeCode));
  const map = nodeMapOf(raw, known);
  if (map === "unusable") return unverified("ITEM_UNREADABLE");

  const nodes: WorkflowNodeProgress[] = [];
  for (const node of definition) {
    if (!Object.hasOwn(map, node.nodeCode)) {
      nodes.push({
        nodeCode: node.nodeCode,
        order: node.order,
        state: "NOT_REACHED",
        completedBy: node.completedBy,
        ...(node.completedByNode === undefined ? {} : { completedByNode: node.completedByNode }),
      });
      continue;
    }

    const stored = map[node.nodeCode];
    if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
      return unverified("NODE_UNREADABLE");
    }
    const state = statusOf(stored);
    if (state === null) return unverified("STATUS_NOT_MODELLED");

    nodes.push({
      nodeCode: node.nodeCode,
      order: node.order,
      state,
      completedBy: node.completedBy,
      ...(node.completedByNode === undefined ? {} : { completedByNode: node.completedByNode }),
    });
  }

  const unknownNodes = Object.keys(map).filter((code) => !known.has(code));

  return {
    progress: {
      nodes,
      completed: nodes.filter((node) => node.state === "COMPLETED").length,
      total: nodes.length,
      unknownNodes,
    },
    unverified: [],
  };
}
