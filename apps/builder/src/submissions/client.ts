import type { Submission } from "@org/form-schema";
import { API_BASE, ownerHeaders } from "../workspace/config";
import type { SubmissionSummary } from "../workspace/types";

/**
 * Thin client for the submissions api (FS1: `/forms/:id/submissions`, `/submissions/:id`). Mirrors
 * the error handling of `workspace/client.ts`. The server re-validates each answer with
 * `@org/form-core` and owns the data; a 422 surfaces its message (the failing fields).
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const jsonHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  ...ownerHeaders(),
});

/** Record a submission against a form (server re-validates `data`; invalid → throws). */
export async function submitForm(
  formId: string,
  data: Record<string, unknown>,
): Promise<Submission> {
  const res = await fetch(`${API_BASE}/forms/${encodeURIComponent(formId)}/submissions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Submission;
}

/** List a form's submissions (summaries, no body). */
export async function listSubmissions(formId: string): Promise<SubmissionSummary[]> {
  const res = await fetch(`${API_BASE}/forms/${encodeURIComponent(formId)}/submissions`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`List submissions failed: ${await readError(res)}`);
  return (await res.json()) as SubmissionSummary[];
}

/** Load a single submission (incl. its pinned schema snapshot + data). */
export async function getSubmission(id: string): Promise<Submission> {
  const res = await fetch(`${API_BASE}/submissions/${encodeURIComponent(id)}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load submission failed: ${await readError(res)}`);
  return (await res.json()) as Submission;
}
