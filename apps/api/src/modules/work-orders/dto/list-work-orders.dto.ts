import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { WORK_ORDER_PRIORITIES } from "../../../common/work-order-priority.js";

/** Sortable columns. `label` is deliberately absent — it is often null, so ordering by it reads as
 *  broken; sort by recency, state, deadline or urgency instead. (`dueAt` IS sortable despite being
 *  nullable: the repo pins its NULLs last, so undated cases sink instead of leading.) */
export const WORK_ORDER_SORTS = ["updatedAt", "createdAt", "current", "dueAt", "priority"] as const;
export type WorkOrderSort = (typeof WORK_ORDER_SORTS)[number];

/** Hard ceiling on a page: a work-order list is a screen, not an export. */
export const MAX_PAGE_SIZE = 100;

const toInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
};

/** A query string carries no booleans — only the literal `true` opts in; anything else 400s. */
const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === "true") return true;
  if (value === "false") return false;
  return typeof value === "string" && value.trim() === "" ? undefined : value;
};

/**
 * Query for `GET /work-orders` (product-roadmap Phase E). Everything is optional; the service
 * applies the defaults. Filters are AND-ed. `assignee` accepts a user id or the sentinels `me`
 * (the caller) and `none` (unassigned).
 */
export class ListWorkOrdersDto {
  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsString()
  current?: string;

  @IsOptional()
  @IsIn(["start", "normal", "end"])
  statusKind?: string;

  @IsOptional()
  @IsString()
  assignee?: string;

  /** Case-insensitive substring of the case label. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Exact urgency (Phase E2): 1 = low, 2 = normal, 3 = high. */
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @IsIn(WORK_ORDER_PRIORITIES)
  priority?: number;

  /** `true` keeps only cases past their deadline and not yet finished (Phase E2). */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsIn(WORK_ORDER_SORTS)
  sort?: WorkOrderSort;

  @IsOptional()
  @IsIn(["asc", "desc"])
  dir?: "asc" | "desc";
}
