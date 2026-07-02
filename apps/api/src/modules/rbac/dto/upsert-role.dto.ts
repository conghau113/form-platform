import { IsOptional, IsString } from "class-validator";

/** Body for `POST /rbac/roles` and `PATCH /rbac/roles/:id`. The role is created in the caller's
 *  tenant (resolved server-side); this rejects wrong-typed payloads at the edge. */
export class UpsertRoleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
