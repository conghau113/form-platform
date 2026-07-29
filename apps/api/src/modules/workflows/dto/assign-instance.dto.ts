import { IsString, ValidateIf } from "class-validator";

/**
 * Body for `POST /workflow-instances/:instanceId/assign` (product-roadmap Phase E). An explicit
 * `null` clears the assignment; anything else must be a user id.
 *
 * Deliberately NOT `@IsOptional()`: that skips every validator for `undefined` too, so a missing or
 * misspelled key would sail through as `undefined` — a silent no-op that still wrote an audit entry.
 * `@ValidateIf` lets `null` past while a missing value still reaches `@IsString()` and 400s.
 */
export class AssignInstanceDto {
  /** The tenant member to make responsible for the case, or `null` to leave it unassigned. */
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  assigneeId!: string | null;
}
