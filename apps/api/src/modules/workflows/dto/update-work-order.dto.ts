import { IsIn, IsInt, IsOptional, Matches } from "class-validator";
import { WORK_ORDER_PRIORITIES } from "../../../common/work-order-priority.js";

/**
 * An ISO-8601 instant that carries an explicit timezone — `Z` or `±hh:mm`.
 *
 * Deliberately NOT `@IsISO8601()`, which is both too loose and too vague for a deadline:
 * - it accepts forms `new Date()` cannot parse (`20260815`, `2026-W33-1`), which would reach Prisma
 *   as an Invalid Date and surface as a 500 rather than a 400;
 * - it accepts offset-less values (`2026-08-15T09:00`, `2026-08-15`), which `new Date()` reads in
 *   the SERVER's local timezone — so the same request would store a different instant depending on
 *   where the api happens to run, and the overdue filter compares against that instant.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Body for `PATCH /workflow-instances/:instanceId/work-order` (product-roadmap Phase E2): the case's
 * deadline and urgency. A PARTIAL patch — an absent key leaves that attribute alone, and an explicit
 * `dueAt: null` clears the deadline.
 *
 * Unlike {@link AssignInstanceDto} this one does use `@IsOptional()`, because "leave it alone" is a
 * meaningful input here. That reopens the risk `AssignInstanceDto`'s comment warns about — a
 * misspelled key arriving as `undefined` — which is why the service rejects a patch where BOTH keys
 * are absent with a 400 instead of writing an empty audit entry.
 */
export class UpdateWorkOrderDto {
  /**
   * The deadline as an ISO-8601 instant WITH a timezone, or `null` to clear it. `@IsOptional()`
   * skips both `undefined` ("unchanged") and `null` ("clear"); anything else must match
   * {@link ISO_INSTANT}.
   */
  @IsOptional()
  @Matches(ISO_INSTANT, {
    message:
      "dueAt must be an ISO-8601 instant with an explicit timezone (e.g. 2026-08-15T09:00:00Z)",
  })
  dueAt?: string | null;

  /** Urgency: 1 = low, 2 = normal, 3 = high. */
  @IsOptional()
  @IsInt()
  @IsIn(WORK_ORDER_PRIORITIES)
  priority?: number;
}
