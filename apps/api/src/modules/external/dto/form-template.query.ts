import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

/**
 * A query string carries no numbers; hand anything unparseable straight to `@IsInt()` so it 400s.
 *
 * Only an absent or blank `?version=` becomes `undefined` (= "use the active version"). A repeated
 * `?version=1&version=2` arrives as an array and is passed through *unchanged* so `@IsInt()` rejects
 * it — mapping it to `undefined` would silently serve the active version to a caller who plainly
 * asked for a specific one.
 */
const toInt = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return value;
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
};

/** Query for `GET /external/form-template` (EVN §12.B). */
export class FormTemplateQueryDto {
  /** The caller's own vocabulary, e.g. `PCT`. Resolved against their tenant's bindings. */
  @IsString()
  @MaxLength(100)
  ticketTypeCode!: string;

  /** Publish sequence number. Omitted → the form's currently-active published version. */
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  version?: number;
}
