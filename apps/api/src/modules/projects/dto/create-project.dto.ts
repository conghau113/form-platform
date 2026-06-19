import { IsOptional, IsString } from "class-validator";

/** Body for `POST /projects`. The service still trims/normalises and assigns the slug; this
 *  only rejects wrong-typed payloads at the edge (400) before any work happens. */
export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
