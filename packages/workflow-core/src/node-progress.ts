import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
import { readMarking } from "./marking.js";

/** Where a node stands for one running case. */
export type NodeProgressStatus = "pending" | "active" | "done";

/**
 * One node's execution trace, projected from an instance's history.
 *
 * A discriminated union rather than one shape with optional keys, because `at` and `action` are
 * never independently absent: they arrive together, on `done` and only on `done`. Stating that in
 * the type means a caller cannot write a branch guarding for a combination that cannot occur (and
 * then have no way to test it).
 */
export type NodeProgress =
  | { status: "pending" | "active" }
  | {
      status: "done";
      /** When this node was LEFT — never when it was entered. See the note below. */
      at: string;
      /** The action that left this node. */
      action: string;
      /** Who fired it, when the history recorded someone. */
      actor?: string;
    };

/**
 * E1 — project a case's execution trace onto the definition's nodes. PURE: no clock, no I/O, no
 * mutation of its inputs; the same (def, instance) always yields the same result. Both the editor's
 * Run view and the backend can call it.
 *
 * `history` is keyed by TRANSITION, not by node — this is the projection that turns one into the
 * other. Three states:
 *
 *   - `active`  the case is sitting here — ANY of its tokens is (E3a)
 *   - `done`    not active, and the case has left this node at least once
 *   - `pending` neither
 *
 * "Where the case is" is read through `readMarking`, so a forked case shows every branch it is
 * standing on rather than the one `current` happens to name. For a case with a single token — every
 * case written before markings existed, and every graph without gateways — that is the same node
 * `current` gives, so nothing about an ordinary case changes.
 *
 * ⚠️ THE META IS ONLY ON `done`, ON PURPOSE. A history entry's `at` is the moment the case LEFT the
 * node (the engine writes it when the transition fires), not the moment it arrived. On a loop the
 * case can re-enter a node it already left; attaching that older departure to the node it is
 * standing on right now would read as "finished at 10:04" about work still in progress. `pending`
 * has nothing to report. On a loop, `done` reports the LAST departure.
 *
 * Nodes are keyed by id. The editor's `validateGraph` rejects duplicate ids, but the schema itself
 * does not enforce uniqueness, so a definition that never went through the editor could still carry
 * two nodes with one id — the last one wins HERE. (Only here: a caller rendering one row per node
 * still has two nodes sharing a key, which is its problem to handle, not this function's.)
 * A token standing on a node `def` does not have (the definition changed under a running case)
 * simply leaves that node out of the result, mirroring how `advance` answers `unknown-state`
 * instead of throwing.
 * History referencing nodes the definition no longer has is likewise ignored: the result describes
 * `def.nodes` and nothing else.
 *
 * "Active" here means WHERE THE CASE IS, not whether the case is finished. A case parked on a
 * terminal node is still `active` by this projection — deciding what to CALL that is the reader's
 * job (the Run view labels it "Kết thúc"), and unifying the several notions of "done" that already
 * exist in this repo is E5's job, not this function's.
 */
export function nodeProgress(
  def: WorkflowDefinition,
  instance: WorkflowInstance,
): Record<string, NodeProgress> {
  // Last departure per node. Scanning forward and overwriting keeps the LAST entry for a node the
  // case left more than once (a loop).
  const lastExit = new Map<string, NodeProgress>();
  for (const entry of instance.history) {
    lastExit.set(entry.from, {
      status: "done",
      at: entry.at,
      action: entry.action,
      // Entries written before `actor` existed (or by an anonymous caller) have none — never invent
      // one, exactly as the engine never writes one it wasn't given.
      ...(entry.actor ? { actor: entry.actor } : {}),
    });
  }

  const standing = new Set(readMarking(instance).tokens.map((t) => t.at));

  const out: Record<string, NodeProgress> = {};
  for (const node of def.nodes) {
    if (standing.has(node.id)) {
      out[node.id] = { status: "active" };
      continue;
    }
    out[node.id] = lastExit.get(node.id) ?? { status: "pending" };
  }
  return out;
}
