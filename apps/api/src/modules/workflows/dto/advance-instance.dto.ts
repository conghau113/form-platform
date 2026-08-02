import { IsObject, IsOptional, IsString } from "class-validator";

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
}
