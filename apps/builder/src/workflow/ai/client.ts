import type { WorkflowDefinition } from "@org/workflow-schema";
import { type AiCreds, aiHeaders } from "../../ai/creds";
import { apiFetch } from "../../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../../workspace/config";

/**
 * Thin client for the headless workflow-AI endpoints (`POST /ai/workflows/{generate,refine}`).
 * Mirrors the form client (`src/ai/client.ts`): the only place a `fetch` for workflow generation
 * is allowed, BYOK credentials ride as `x-ai-*` headers, and the server returns a definition that
 * is already contract- AND graph-valid (it never trusts the model). A non-OK response throws with
 * the server's message, including the structured `errors` list on a 422.
 */

export interface GenerateWorkflowInput {
  /** Natural-language description of the process to model. */
  prompt: string;
  /** Optional house-style guidance appended to the system prompt. */
  guidance?: string;
  /** Repair rounds after the first attempt (0–5; server default 3). */
  maxRepairs?: number;
}

export interface RefineWorkflowInput {
  /** The workflow being edited (the current canvas definition). */
  currentWorkflow: WorkflowDefinition;
  /** What to change, in natural language. */
  instruction: string;
  guidance?: string;
  maxRepairs?: number;
}

export interface GenerateWorkflowResult {
  /** A definition that is parse-valid AND graph-valid (reachable, no dangling edges). */
  workflow: WorkflowDefinition;
  /** Model calls it took (1 = valid on the first try). */
  attempts: number;
}

interface ErrorBody {
  message?: string;
  errors?: string[];
}

/** POST a request envelope to a workflow-AI endpoint, throwing the server's reason on failure. */
async function postAi(
  path: string,
  body: unknown,
  creds: AiCreds,
  fallback: string,
): Promise<GenerateWorkflowResult> {
  const res = await apiFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ownerHeaders(), ...aiHeaders(creds) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ErrorBody;
    const detail = data.errors?.length ? `: ${data.errors.join("; ")}` : "";
    throw new Error(`${data.message ?? `${fallback} (${res.status})`}${detail}`);
  }
  return (await res.json()) as GenerateWorkflowResult;
}

export function generateWorkflow(
  input: GenerateWorkflowInput,
  creds: AiCreds,
): Promise<GenerateWorkflowResult> {
  return postAi("/ai/workflows/generate", input, creds, "Generation failed");
}

export function refineWorkflow(
  input: RefineWorkflowInput,
  creds: AiCreds,
): Promise<GenerateWorkflowResult> {
  return postAi("/ai/workflows/refine", input, creds, "Refine failed");
}
