import { IsOptional, IsString } from "class-validator";

/** Body for `PATCH /forms/:id/move`. `folderId: null` (or absent) moves the form to the project
 *  root; otherwise it must be a folder id string. This is workspace placement, not form content —
 *  the form contract itself is validated by `migrate()` on `POST /forms`. */
export class MoveFormDto {
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
