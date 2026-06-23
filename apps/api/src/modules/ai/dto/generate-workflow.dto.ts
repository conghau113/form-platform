import { IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

/** Body for `POST /ai/workflows/generate`. The generated workflow is validated
 *  against the contract (Zod) AND checked for graph well-formedness by the
 *  pipeline before it is returned — this DTO only validates the request envelope. */
export class GenerateWorkflowDto {
  /** Natural-language description of the process to model. */
  @IsString()
  prompt!: string;

  /** Extra system guidance appended to the base instructions (e.g. house style). */
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

/** Body for `POST /ai/workflows/refine`. The model EDITS `currentWorkflow` per
 *  `instruction`; the result is re-validated (Zod + graph) by the pipeline before
 *  it is returned. `currentWorkflow` is passed to the model as plain-text context
 *  only — never eval'd — so this DTO only checks it is an object. */
export class RefineWorkflowDto {
  /** The workflow to edit, as a JSON object (the current editor definition). */
  @IsObject()
  currentWorkflow!: Record<string, unknown>;

  /** Natural-language description of the change to apply. */
  @IsString()
  instruction!: string;

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
