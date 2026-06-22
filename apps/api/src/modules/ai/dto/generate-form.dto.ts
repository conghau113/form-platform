import { Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

/** A reference image for vision-capable providers (URL or base64). */
export class AiImageDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  base64?: string;

  @IsOptional()
  @IsString()
  mediaType?: string;
}

/** Body for `POST /ai/forms/generate`. The generated form is validated against the
 *  contract by the pipeline (Zod) before it is returned — this DTO only validates
 *  the request envelope, not the form. */
export class GenerateFormDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  guidance?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiImageDto)
  images?: AiImageDto[];

  /** Repair rounds after the first attempt (0–5; pipeline default is 3). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRepairs?: number;
}
