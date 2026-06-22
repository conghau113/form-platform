import { CURRENT_FORM_VERSION, type FormSchema, migrate } from "@org/form-schema";
import {
  CURRENT_WORKFLOW_VERSION,
  migrateWorkflow,
  type WorkflowDefinition,
} from "@org/workflow-schema";
import { ZodError } from "zod";

/**
 * Pure normalization helpers behind the MCP `create_*` tools. They take an
 * agent-authored DRAFT and return a contract-valid document or structured
 * errors — the "output guaranteed valid (Zod), safe to run (no-eval)" promise.
 * Kept free of the MCP SDK so they are unit-testable on their own.
 */

export type NormalizeResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Flatten any thrown error (ZodError or otherwise) into human-readable lines. */
function toErrors(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}

/** Stamp the current version onto a draft that omits it, so an agent can author
 *  the body and let the contract own versioning. Non-objects pass through to let
 *  the migrate step report a precise error. */
function withVersion(draft: unknown, key: string, version: number): unknown {
  if (draft !== null && typeof draft === "object" && !Array.isArray(draft)) {
    const obj = draft as Record<string, unknown>;
    if (typeof obj[key] !== "number") return { ...obj, [key]: version };
  }
  return draft;
}

/** Validate & normalize a form draft into a guaranteed-valid `FormSchema`. */
export function normalizeForm(draft: unknown): NormalizeResult<FormSchema> {
  try {
    return { ok: true, value: migrate(withVersion(draft, "formVersion", CURRENT_FORM_VERSION)) };
  } catch (error) {
    return { ok: false, errors: toErrors(error) };
  }
}

/** Validate & normalize a workflow draft into a guaranteed-valid `WorkflowDefinition`. */
export function normalizeWorkflow(draft: unknown): NormalizeResult<WorkflowDefinition> {
  try {
    return {
      ok: true,
      value: migrateWorkflow(withVersion(draft, "workflowVersion", CURRENT_WORKFLOW_VERSION)),
    };
  } catch (error) {
    return { ok: false, errors: toErrors(error) };
  }
}
