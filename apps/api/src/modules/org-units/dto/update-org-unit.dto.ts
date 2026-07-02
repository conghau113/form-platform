import { IsInt, IsOptional, IsString } from "class-validator";

/** Body for `PATCH /org-units/:id` — rename / move (`parentId`) / reorder / relabel (`kind`). A move is
 *  detected by the PRESENCE of `parentId` (including explicit `null` → root), matching the folder DTO. */
export class UpdateOrgUnitDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  kind?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}
