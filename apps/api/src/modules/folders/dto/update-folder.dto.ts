import { IsInt, IsOptional, IsString } from "class-validator";

/** Body for `PATCH /folders/:id` — rename / move / reorder. A move is detected by the PRESENCE of
 *  `parentId` (including an explicit `null` → root), so the global ValidationPipe runs with
 *  `exposeUnsetFields: false` to keep an absent `parentId` absent (a plain rename must not move). */
export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}
