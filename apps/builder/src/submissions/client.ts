import type { Submission } from "@org/form-schema";
import { apiFetch } from "../lib/apiFetch";
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

/** Record a submission against a form (server re-validates `data`; invalid → throws). `roles` are
 *  the submitter's declared domain roles (FS2) — the server strips fields they can't view. */
export async function submitForm(
  formId: string,
  data: Record<string, unknown>,
  roles?: string[],
): Promise<Submission> {
  const res = await apiFetch(`${API_BASE}/forms/${encodeURIComponent(formId)}/submissions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ data, roles }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Submission;
}

/** List a form's submissions (summaries, no body). */
export async function listSubmissions(formId: string): Promise<SubmissionSummary[]> {
  const res = await apiFetch(`${API_BASE}/forms/${encodeURIComponent(formId)}/submissions`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`List submissions failed: ${await readError(res)}`);
  return (await res.json()) as SubmissionSummary[];
}

/** Load a single submission (incl. its pinned schema snapshot + data). `roles` are the reader's
 *  declared domain roles (FS2) — fields they can't view are masked out of `data` server-side. */
export async function getSubmission(id: string, roles?: string[]): Promise<Submission> {
  const query = roles && roles.length > 0 ? `?roles=${encodeURIComponent(roles.join(","))}` : "";
  const res = await apiFetch(`${API_BASE}/submissions/${encodeURIComponent(id)}${query}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load submission failed: ${await readError(res)}`);
  return (await res.json()) as Submission;
}
