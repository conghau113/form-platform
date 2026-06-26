import { IsArray, IsObject, IsOptional, IsString } from "class-validator";

/**
 * Body for `POST /workflow-instances/:instanceId/advance`. The action + optional case data are
 * fed to the pure engine (`advance`), which evaluates guards/roles server-side. `roles` lets a
 * caller declare the actor's workflow roles; the service also adds the actor's project role.
 */
export class AdvanceInstanceDto {
  /** The transition action to fire from the instance's current state. */
  @IsString()
  action!: string;

  /** Case data merged over the instance's stored data for guard evaluation + persistence. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  /** Workflow roles the actor declares they hold (checked against a transition's required role). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}
