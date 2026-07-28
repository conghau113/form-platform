import { IsOptional, IsString } from "class-validator";

/** Body for `POST /projects`. The service still trims/normalises and assigns the slug; this
 *  only rejects wrong-typed payloads at the edge (400) before any work happens. */
export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** Target tenant (B4). Omitted → the caller's personal tenant. The service authorises:
   *  the caller needs an editor-level role in the tenant (404 when not a member at all). */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** Placement in the tenant's org tree (C3). Omitted → unplaced. Must live in the target tenant. */
  @IsOptional()
  @IsString()
  orgUnitId?: string;
}
