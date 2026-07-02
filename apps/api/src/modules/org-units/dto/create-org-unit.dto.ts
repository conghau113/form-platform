import { IsOptional, IsString } from "class-validator";

/** Body for `POST /org-units`. The unit is created in the caller's tenant (resolved server-side); this
 *  rejects wrong-typed payloads at the edge. `parentId` must belong to the same tenant (service check). */
export class CreateOrgUnitDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  kind?: string | null;
}
