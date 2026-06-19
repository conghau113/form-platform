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
}
