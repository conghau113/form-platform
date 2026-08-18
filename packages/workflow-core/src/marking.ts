import {
  ROOT_SCOPE,
  type WorkflowInstance,
  type WorkflowScope,
  type WorkflowToken,
} from "@org/workflow-schema";

/** Re-exported so a reader of a marking gets the sentinel from the same place as the reader itself.
 *  It is defined in the CONTRACT, not here, because `workflowInstanceSchema` enforces it: a `scopes`
 *  that gives the outermost scope an entry does not parse. See its JSDoc there. */
export { ROOT_SCOPE };

/**
 * Id of the single token synthesized for a case that predates the marking.
 *
 * Fixed rather than generated, so `readMarking` is pure — two calls on the same instance describe
 * the same token. A real token id must never collide with it, which is why this is not the obvious
 * `"t0"`: a generator numbering tokens `t0, t1, …` would hand out that exact string on its first
 * call, and the collision would only show up once real markings and synthesized ones met.
 */
export const LEGACY_TOKEN_ID = "legacy-token";

/** Every place a case currently stands, plus the fork runs those places belong to. */
export interface Marking {
  tokens: WorkflowToken[];
  /**
   * Fork-created scopes, keyed by scope id.
   *
   * ⚠️ Deliberately typed as possibly-`undefined` per key. A token at the outermost level has no
   * entry here (see {@link ROOT_SCOPE}), and this repo does not compile with
   * `noUncheckedIndexedAccess` — without this annotation `scopes[token.scope].expected` would
   * type-check and then crash on every root-level token.
   */
  scopes: Record<string, WorkflowScope | undefined>;
}

/**
 * E2 — read where a case stands, whether or not it was written by a build that knows about tokens.
 *
 * PURE: no clock, no I/O, no mutation of the input; the same instance always yields the same
 * marking. Both the editor and the backend call it.
 *
 * The reader landed a phase before the writer on purpose. Since E3a the engine writes `current` and
 * `tokens` together on every case it creates or advances, and callers that already read through here
 * needed no change and no migration — but a case untouched since then still has only `current`, and
 * always will. This is the one place that decides which of the two to believe:
 *
 *   - `tokens` ABSENT — the case was written by a build that had no marking. Report the single token
 *     parked at `current`. This invents nothing: `current` is a required field that every writer has
 *     always set, and one token is exactly what a case without forks has. A `scopes` stored on such
 *     a case is dropped, because the synthesized token belongs to none of those runs and a `Marking`
 *     has nowhere to put an orphan scope — NOT because we can tell that no fork ran. We cannot: a
 *     writer old enough to omit `tokens` does not know `scopes` either, so that combination, like
 *     `tokens: []` below, can only have come from a marking-aware writer. Read it as a corruption
 *     signal, not as ordinary data.
 *   - `tokens` PRESENT — it is the truth, and `current` is only its representative. This includes an
 *     EMPTY array, which is reported as empty. Empty is out of contract (`tokens` is `.min(1)`), and
 *     it can only come from a writer that knows about markings — i.e. from one that dropped a token.
 *     Quietly reading `current` there would turn a lost branch into a plausible-looking single-token
 *     case, permanently. A reader's job is to report what is stored, not to make it look healthy.
 *
 * The instance's own arrays are never handed back: the returned tokens and scopes are copies, so a
 * caller that pushes onto the marking (which is what an engine does) cannot reach through and edit
 * the stored case. Both records are flat, so a one-level copy is a complete one.
 *
 * It takes no definition and does not check that a token's `at` names a node that still exists —
 * that question already has an answer elsewhere (`advance` reports `unknown-state`, `nodeProgress`
 * simply leaves nothing active), and answering it a third way here would be a third definition of
 * "valid" to keep in sync.
 */
export function readMarking(instance: WorkflowInstance): Marking {
  if (instance.tokens === undefined) {
    return {
      tokens: [{ id: LEGACY_TOKEN_ID, at: instance.current, scope: ROOT_SCOPE }],
      scopes: {},
    };
  }
  const scopes: Record<string, WorkflowScope | undefined> = {};
  for (const [id, scope] of Object.entries(instance.scopes ?? {})) {
    scopes[id] = { ...scope };
  }
  return { tokens: instance.tokens.map((token) => ({ ...token })), scopes };
}
