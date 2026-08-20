import { readMarking } from "@org/workflow-core";
import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";

/**
 * One place a case currently stands (E3c, parallel track). A case that has been through a fork
 * stands in several at once, and the Run view operates ONE of them at a time.
 */
export interface Branch {
  /** The engine token id — what an advance names to move THIS branch and not another. */
  tokenId: string;
  /** The node id the branch is parked on. */
  at: string;
  /**
   * Index into `def.nodes`, or `-1` when the node is gone.
   *
   * An index rather than the node itself, and rather than a finished label: the caller renders from
   * the LOCALIZED clone of the definition, and `localizeWorkflow` overwrites any attribute named in
   * a node's `i18n` map — `id` included — so looking the node up by id over there can silently miss.
   * Resolving the label in the caller is also what keeps the branch picker and the status Tag saying
   * the same words: the Tag runs the node through the status catalog, which is allowed to override
   * the node's own `status` text, and a label computed here would not know about that.
   */
  nodeIndex: number;
  /**
   * The gateway this branch is parked ON, if any — and WHICH kind, because the two mean opposite
   * things to whoever is looking at the case.
   *
   * `join`: the branch arrived before its siblings and is waiting for them. An ordinary stored
   * position, not a corruption.
   * `fork`: nobody is waiting for anything here. Reached without any editing whenever `def.start` is
   * itself a fork — `createInstance` parks the first token on `def.start` and does NOT settle
   * (`engine.ts` on `createInstance`, and the `settle`-before-choosing comment in `advance`) — and
   * also when a node holding a token is edited into a gateway under a running case.
   *
   * Neither may be offered action buttons: firing a gateway's outgoing transition by hand moves that
   * one token as a normal step — leaving the fork run in `scopes` and the siblings unconsumed, so
   * whichever branch arrives next waits for a count that can never be reached again, or skipping the
   * spawn a fork exists to do. Refusing this in the ENGINE is E4; until then, not offering it is
   * what keeps a case out of that state.
   */
  gateway: "fork" | "join" | undefined;
  /** Another branch is parked on the SAME node, so a label naming only the node cannot tell them
   *  apart. Two tokens at one node is legal and deliberately not deduped by the engine. */
  ambiguousLabel: boolean;
}

/**
 * Where a case stands, one entry per token, in marking order (so `branches[0]` is the one
 * `instance.current` names — the engine writes `current` from the head of `tokens`).
 *
 * Reads through `readMarking`, so a case written before markings existed yields exactly one branch.
 * An EMPTY result is possible and is passed through as empty: `readMarking` reports a stored
 * `tokens: []` as empty on purpose, because that can only come from a writer that dropped a branch,
 * and quietly substituting `current` there would turn a lost branch into a healthy-looking case.
 *
 * Identity comes from `def`, never from a localized clone (see {@link Branch.nodeIndex}).
 */
export function caseBranches(def: WorkflowDefinition, instance: WorkflowInstance): Branch[] {
  const tokens = readMarking(instance).tokens;
  const perNode = new Map<string, number>();
  for (const token of tokens) perNode.set(token.at, (perNode.get(token.at) ?? 0) + 1);

  return tokens.map((token) => {
    const nodeIndex = def.nodes.findIndex((n) => n.id === token.at);
    return {
      tokenId: token.id,
      at: token.at,
      nodeIndex,
      gateway: nodeIndex === -1 ? undefined : def.nodes[nodeIndex].gateway,
      ambiguousLabel: (perNode.get(token.at) ?? 0) > 1,
    };
  });
}

/**
 * The branch a stored selection points at, falling back to the first one.
 *
 * The fallback is not defensive padding: a join CONSUMES the tokens it merges and emits a new id, so
 * a selection made before a join released names a token that genuinely no longer exists. (An
 * ordinary move does NOT do this — the engine carries a token's id with it — so this is reachable
 * only through a join, or through someone else advancing the case underneath us.) Falling back to
 * the head of the marking says the same thing `instance.current` does, which is the state every
 * other part of the view already describes.
 *
 * Returns `undefined` only for an empty marking, which the caller must render as the damage it is.
 */
export function selectBranch(branches: Branch[], selectedId: string | null): Branch | undefined {
  return branches.find((b) => b.tokenId === selectedId) ?? branches[0];
}
