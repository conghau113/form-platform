import { IsOptional, IsString } from "class-validator";

/** Body for `PATCH /projects/:id` — rename / re-describe. All fields optional; the service
 *  applies only what is present. */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** Move the project in the tenant's org tree (C3). Omitted → unchanged; `null` → unplace; a string
   *  → place under that unit (must live in the project's tenant). `@IsOptional` skips validation on
   *  `null` so unplacing is accepted. */
  @IsOptional()
  @IsString()
  orgUnitId?: string | null;
}
