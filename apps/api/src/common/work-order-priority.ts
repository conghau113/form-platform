/**
 * How urgent a work-order case is (Phase E2). Stored as a small INT on
 * `WorkflowInstanceRecord.priority` so the list can sort on it server-side — see the schema
 * doc-comment for why a string enum would sort wrong.
 *
 * Lives in `common/` rather than in either feature's DTO folder because BOTH `modules/workflows`
 * (writing it) and `modules/work-orders` (filtering by it) validate against this list, and coupling
 * two feature modules through one's DTO file would be the wrong dependency.
 *
 * The human labels are the UI's business (`apps/builder/src/operate/priority.ts`); the api only ever
 * deals in the numbers.
 */
export const WORK_ORDER_PRIORITIES = [1, 2, 3] as const;

/** Default for every case: "normal". Matches the column's `@default(2)`. */
export const DEFAULT_WORK_ORDER_PRIORITY = 2;
