import { IsOptional, IsString } from "class-validator";

/** Body for `PATCH /workflows/:id/move`. `folderId: null` (or absent) moves the workflow to the
 *  project root; otherwise it must be a folder id string. This is workspace placement, not
 *  workflow content — the contract itself is validated by `migrateWorkflow()` on `POST /workflows`. */
export class MoveWorkflowDto {
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
