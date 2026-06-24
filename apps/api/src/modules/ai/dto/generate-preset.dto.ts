import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Body for `POST /ai/presets/generate`. The generated preset is validated against the
 *  contract by the pipeline (it must build a valid field) before it is returned — this DTO
 *  only validates the request envelope, not the preset. */
export class GeneratePresetDto {
  @IsString()
  prompt!: string;

  /** Optional hint constraining the field type (e.g. `"text"`, `"select"`). */
  @IsOptional()
  @IsString()
  fieldType?: string;

  @IsOptional()
  @IsString()
  guidance?: string;

  /** Repair rounds after the first attempt (0–5; pipeline default is 3). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRepairs?: number;
}
