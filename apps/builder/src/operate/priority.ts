/**
 * How a case's urgency (Phase E2) is spelled for a human. The api only ever deals in the numbers
 * 1..3 (they sort server-side); this module is the ONE place that knows what they are called and
 * what colour they wear, so a label never drifts between the table, the filters and the run view.
 */

export const PRIORITY_LOW = 1;
export const PRIORITY_NORMAL = 2;
export const PRIORITY_HIGH = 3;

/** Highest first — the order a work queue wants to read them in. */
export const PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: PRIORITY_HIGH, label: "Cao" },
  { value: PRIORITY_NORMAL, label: "Bình thường" },
  { value: PRIORITY_LOW, label: "Thấp" },
];

/** antd `Tag`/`Text` colour per level. "Bình thường" stays neutral: colouring the default would
 *  make every row shout and leave nothing for the urgent ones. */
export const PRIORITY_COLOR: Record<number, string | undefined> = {
  [PRIORITY_HIGH]: "red",
  [PRIORITY_NORMAL]: undefined,
  [PRIORITY_LOW]: "default",
};

/** Human label for a level; an unknown number (a newer api) degrades to the raw value. */
export function priorityLabel(value: number): string {
  return PRIORITY_OPTIONS.find((o) => o.value === value)?.label ?? String(value);
}

/**
 * Is this case past its deadline and still open? The server answers the same question for the
 * `overdue` FILTER; this is the row-level version, for showing the date in red.
 *
 * A finished case is never overdue — its deadline stopped mattering when it closed.
 */
export function isOverdue(
  dueAt: string | null,
  statusKind: string | null,
  now: Date = new Date(),
): boolean {
  if (!dueAt || statusKind === "end") return false;
  return new Date(dueAt).getTime() < now.getTime();
}
