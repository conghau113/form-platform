import { IsObject, IsOptional, IsString } from "class-validator";

/**
 * Body for `POST /workflows/:workflowId/instances`. Only the request envelope is validated here;
 * the instance itself is produced by the pure engine (`createInstance`) against the migrated
 * definition, so it is contract-valid by construction.
 */
export class StartInstanceDto {
  /** Optional explicit instance id (else the engine derives one from the definition id + time). */
  @IsOptional()
  @IsString()
  id?: string;

  /** Optional seed case data carried into the new instance. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
