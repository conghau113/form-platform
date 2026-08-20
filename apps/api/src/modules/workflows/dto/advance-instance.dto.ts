import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body for `POST /workflow-instances/:instanceId/advance`. The action + optional case data are fed
 * to the pure engine (`advance`), which evaluates guards and roles server-side.
 *
 * There is deliberately NO `roles` field (removed in Phase E3a). It used to let a caller declare the
 * roles they were acting in, which the engine then trusted — so anyone with run access could satisfy
 * a `transition.role` guard and unmask every `viewRoles`-gated field by naming the role. The acting
 * roles now come from `CaseActorRolesService`. The global `ValidationPipe` runs with
 * `whitelist: true`, so an old client still sending `roles` has it stripped, not honoured.
 */
export class AdvanceInstanceDto {
  /** The transition action to fire from the instance's current state. */
  @IsString()
  action!: string;

  /** Case data merged over the instance's stored data for guard evaluation + persistence. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  /**
   * E3c (parallel track) — WHICH branch moves, when the case stands in more than one place at once.
   *
   * Send it only for a case whose marking has MORE than one token. A case standing in one place is
   * unambiguous by construction, and naming its token buys nothing while exposing the caller to
   * `unknown-token`: the engine matches this against the marking AFTER gateways settle, so an id
   * read from a stored case parked on a gateway can already have been consumed (`engine.ts` on
   * `AdvanceContext.token`). Omitted, the engine moves the only token that CAN fire the action, and
   * refuses with `ambiguous-token` rather than guessing when two could.
   *
   * Not validated against the case here on purpose — the engine owns that check (`unknown-token`),
   * and a token id that is not in the live marking is refused there, so this is never treated as a
   * position. `@MaxLength` is hygiene against an unbounded string, not a claim about the id's shape.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  token?: string;
}
