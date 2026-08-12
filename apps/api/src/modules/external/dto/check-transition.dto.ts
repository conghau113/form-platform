import { Type } from "class-transformer";
import {
  Allow,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** One role assignment on the ticket: which role, and who holds it. */
export class TicketRoleDto {
  @IsString()
  @MaxLength(100)
  roleCode!: string;

  @IsString()
  @MaxLength(100)
  userCode!: string;
}

/**
 * Body of `POST /external/check-transition` (EVN §12.C).
 *
 * ⚠️ The global pipe runs `whitelist: true` without `forbidNonWhitelisted` (`main.ts:26-32`), so
 * anything not declared here is stripped SILENTLY. Two consequences worth knowing before editing:
 *  - `ticketData` and `information` are free-form by contract, so they carry `@Allow()`. Without a
 *    decorator they would arrive as `undefined` and every guard reading them would pass vacuously —
 *    the fail-open this whole surface is shaped to avoid. Their nested contents survive because
 *    nothing here declares `@ValidateNested` on them, so the pipe does not recurse.
 *  - `definitionVersion`, `actionHistory` and `participants` from the design sketch are NOT declared
 *    and therefore never reach the service. That is still correct through P4c, which decides none of
 *    them — but P4d must add them here first rather than assuming they arrived.
 */
export class CheckTransitionDto {
  /** EVN's ticket id. Echoed nowhere and used for nothing yet; required because their spec sends it
   *  and accepting a body without it would let a caller believe C was told which ticket it is. */
  @IsInt()
  ticketId!: number;

  /** The caller's own vocabulary, e.g. `PCT`. */
  @IsString()
  @MaxLength(100)
  ticketTypeCode!: string;

  @IsString()
  @MaxLength(100)
  currentStatusCode!: string;

  @IsString()
  @MaxLength(100)
  actionCode!: string;

  @IsString()
  @MaxLength(100)
  executorUserCode!: string;

  /**
   * Every role assigned on the ticket, whoever holds it — NOT filtered to the active ones, and not
   * filtered to this executor (the service derives that subset itself).
   *
   * Optional, because §12.C as EVN specified it does not carry it. Without it C cannot resolve the
   * three actions that carry two rows, and answers `ambiguousNext` instead of guessing (B1).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketRoleDto)
  ticketRoles?: TicketRoleDto[];

  /**
   * Ticket item values, keyed by item code. Free-form; accepted and preserved whole.
   *
   * Read from P4c onwards: `requiredFields` is decided from it (`required-content.ts`). Each value
   * must be an array of rows, or the `{ data: [...] }` object those rows came out of — anything else
   * is a 422, because EVN's own checker cannot read it either.
   *
   * ⚠️ Absent and `null` both mean "we were not told" and evaluate nothing. `@IsOptional()` skips
   * validation for `null` as well as `undefined`, so `null` genuinely arrives here.
   */
  @IsOptional()
  @IsObject()
  @Allow()
  ticketData?: Record<string, unknown> | null;

  /**
   * Action payload (attendance lists, videos…).
   *
   * ⚠️ Accepted but STILL UNREAD as of P4c — `checkContentFinished` reads ticket items, not the
   * action payload, so nothing in this slice consults it. Declared so the pipe does not strip it
   * silently once a guard needs it (P5/P6 primitives P5/7a/7e).
   */
  @IsOptional()
  @IsObject()
  @Allow()
  information?: Record<string, unknown>;
}
