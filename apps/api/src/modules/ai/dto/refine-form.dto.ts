import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { AiImageDto, IMAGE_STRATEGIES, type ImageStrategyDto } from "./generate-form.dto.js";

/** Body for `POST /ai/forms/refine`. The model EDITS `baseForm` per `instruction`;
 *  the result is re-validated against the contract (Zod) by the pipeline before it
 *  is returned. `baseForm` is passed to the model as plain-text context only — it is
 *  never eval'd — so this DTO only checks it is an object, not that it is a valid form. */
export class RefineFormDto {
  /** The form to edit, as a JSON object (the current canvas form). */
  @IsObject()
  baseForm!: Record<string, unknown>;

  /** Natural-language description of the change to apply. */
  @IsString()
  instruction!: string;

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

  /** Image handling: `"single"` (default) or `"two-pass"`. */
  @IsOptional()
  @IsIn(IMAGE_STRATEGIES)
  imageStrategy?: ImageStrategyDto;
}
