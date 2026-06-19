import { IsOptional, IsString } from "class-validator";

/** Body for `POST /folders`. The service asserts project access + parent placement and trims the
 *  name; this rejects wrong-typed payloads at the edge. */
export class CreateFolderDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsString()
  name!: string;
}
