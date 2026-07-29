import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** Sortable columns. `label` is deliberately absent — it is often null, so ordering by it reads as
 *  broken; sort by recency or state instead. */
export const WORK_ORDER_SORTS = ["updatedAt", "createdAt", "current"] as const;
export type WorkOrderSort = (typeof WORK_ORDER_SORTS)[number];

/** Hard ceiling on a page: a work-order list is a screen, not an export. */
export const MAX_PAGE_SIZE = 100;

const toInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
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
