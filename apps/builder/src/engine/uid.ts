let uidCounter = 0;

/** Monotonic, collision-free id for designer nodes, dnd and React keys.
 *  NEVER persisted — the transformer regenerates uids on every schema load. */
export function makeUid(): string {
  uidCounter += 1;
  return `f${uidCounter}`;
}
