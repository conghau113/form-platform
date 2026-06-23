import { type AiMessage, type AiProvider, runValidationLoop } from "@org/ai-core";
import { WORKFLOW_JSON_SCHEMA, type WorkflowDefinition } from "@org/workflow-schema";
import { normalizeWorkflowDraft } from "./normalize.js";
import {
  buildWorkflowGenerationMessages,
  buildWorkflowRefineMessages,
  buildWorkflowRepairMessage,
  type GenerateWorkflowInput,
  type RefineWorkflowInput,
} from "./prompt.js";

/**
 * P3 / C1 — the guaranteed-valid workflow generation pipeline (the moat).
 *
 * Reuses the shared `@org/ai-core` loop and supplies the workflow-specific
 * pieces: the prompts, the workflow JSON Schema, and `normalizeWorkflowDraft`
 * (migrate + Zod + `validateGraph`). The model is never trusted: every round its
 * output is re-validated for BOTH contract shape and graph well-formedness, and
 * the errors are fed back for a bounded number of repair rounds. The result is
 * either a `WorkflowDefinition` that is parse-valid and graph-valid, or
 * structured errors — no eval, guards stay JSONLogic.
 */

/** Low temperature keeps generation faithful/deterministic. */
const DEFAULT_TEMPERATURE = 0.3;
/** Generous cap so a multi-state workflow is never truncated mid-JSON. */
const DEFAULT_MAX_TOKENS = 8192;

export interface GenerateWorkflowOptions {
  /** Repair rounds AFTER the first attempt (default 3 ⇒ up to 4 model calls). */
  maxRepairs?: number;
  temperature?: number;
  maxTokens?: number;
  /** Pass the workflow JSON Schema to the provider for structured output (default true). */
  useJsonSchema?: boolean;
}

export interface GenerateWorkflowSuccess {
  ok: true;
  workflow: WorkflowDefinition;
  /** How many model calls it took (1 = valid on first try). */
  attempts: number;
  /** Raw text of the accepted response. */
  raw: string;
}

export interface GenerateWorkflowFailure {
  ok: false;
  errors: string[];
  attempts: number;
  raw?: string;
}

export type GenerateWorkflowResult = GenerateWorkflowSuccess | GenerateWorkflowFailure;

/** Drive the shared loop with the workflow normalizer and map to the public shape. */
async function runWorkflowLoop(
  provider: AiProvider,
  messages: AiMessage[],
  options: GenerateWorkflowOptions,
): Promise<GenerateWorkflowResult> {
  const result = await runValidationLoop<WorkflowDefinition>(
    provider,
    messages,
    normalizeWorkflowDraft,
    {
      maxRepairs: options.maxRepairs,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      jsonSchema: options.useJsonSchema === false ? undefined : WORKFLOW_JSON_SCHEMA,
      buildRepairMessage: buildWorkflowRepairMessage,
    },
  );
  return result.ok
    ? { ok: true, workflow: result.value, attempts: result.attempts, raw: result.raw }
    : { ok: false, errors: result.errors, attempts: result.attempts, raw: result.raw };
}

/** Generate a contract- and graph-valid workflow from a prompt. */
export async function generateWorkflow(
  provider: AiProvider,
  input: GenerateWorkflowInput,
  options: GenerateWorkflowOptions = {},
): Promise<GenerateWorkflowResult> {
  return runWorkflowLoop(provider, buildWorkflowGenerationMessages(input), options);
}

/** Apply a natural-language edit to an existing workflow, returning a valid result. */
export async function refineWorkflow(
  provider: AiProvider,
  input: RefineWorkflowInput,
  options: GenerateWorkflowOptions = {},
): Promise<GenerateWorkflowResult> {
  return runWorkflowLoop(provider, buildWorkflowRefineMessages(input), options);
}
