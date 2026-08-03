import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { MAX_NOTIFICATION_LIMIT } from "../notifications.service.js";

/** A query string carries only strings; mirror `ListWorkOrdersDto`'s coercion. */
const toInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
};

/**
 * Query for `GET /notifications` (product-roadmap Phase E3b). Only a page size — the feed is short
 * and ordered by recency, so there is no paging, filtering or sorting to expose. The ceiling is
 * enforced twice on purpose: 400 here for an obviously bogus request, and clamped again in the
 * service, which is what a non-HTTP caller would go through.
 */
export class ListNotificationsDto {
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(MAX_NOTIFICATION_LIMIT)
  limit?: number;
}
