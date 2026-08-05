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

/**
 * A blank `?formCode=` means "not specified", the same way a blank `?version=` does. Anything else
 * — including a repeated `?formCode=a&formCode=b`, which arrives as an array — is passed through
 * for `@IsString()` to reject, rather than being quietly treated as absent.
 *
 * Surrounding whitespace is trimmed rather than merely tested for, because `?formCode=%20CPCT`
 * would otherwise miss the binding and come back as the same opaque 404 as a wrong code.
 */
const trimToUndefined = ({ value }: { value: unknown }): unknown => {
  // `null` explicitly, matching `toInt`: `@IsOptional()` skips validation on null, so it would
  // otherwise reach the query as `externalFormCode: null` against a NOT NULL column.
  if (value === null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Both codes are trimmed, because the argument for trimming one applies verbatim to the other:
 *  a stray space turns a correct request into the endpoint's opaque 404. Required, so blank stays
 *  blank and `@IsString()` speaks for it. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

/** Query for `GET /external/form-template` (EVN §12.B). */
export class FormTemplateQueryDto {
  /** The caller's own vocabulary, e.g. `PCT`. Resolved against their tenant's bindings. */
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  ticketTypeCode!: string;

  /**
   * Which template of that ticket type, in the caller's own vocabulary (e.g. `CPCT`). Optional
   * only because most ticket types have a single template bound; where a tenant binds more than
   * one, omitting it is a 404 rather than a guess (P2-0).
   */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(100)
  formCode?: string;

  /** Publish sequence number. Omitted → the form's currently-active published version. */
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  version?: number;
}
