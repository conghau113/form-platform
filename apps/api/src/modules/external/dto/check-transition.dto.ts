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
 *    and therefore never reach the service. That is correct for P4b, which decides none of them —
 *    but P4c/P4d must add them here first rather than assuming they arrived.
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
   * Ticket item values. Free-form; accepted and preserved whole.
   *
   * ⚠️ P4b decides nothing from it — `requiredFields` is P4c's. It is accepted now so the request
   * shape is settled before the guard that reads it exists, and because a field silently stripped
   * by the pipe is far harder to notice later than one that arrives unused.
   */
  @IsOptional()
  @IsObject()
  @Allow()
  ticketData?: Record<string, unknown>;

  /** Action payload (attendance lists, videos…). Same story as `ticketData`: P4c reads it. */
  @IsOptional()
  @IsObject()
  @Allow()
  information?: Record<string, unknown>;
}
