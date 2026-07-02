import type { FormSchema, FormVersion } from "@org/form-schema";
import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../workspace/config";
import type { FormVersionSummary } from "../workspace/types";

/**
 * Thin client for the form-version api (FB1: `/forms/:id/publish`, `/forms/:id/versions`,
 * `/forms/:id/versions/:v`, `/forms/:id/active-version`, `/forms/:id/versions/:v/clone-draft`).
 * Mirrors the error handling of `submissions/client.ts`. The server is authoritative: it re-migrates
 * the draft on publish and owns the immutable, numbered version history.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const id = (s: string): string => encodeURIComponent(s);

/** Freeze the current saved draft into a new immutable published version (returns its summary). */
export async function publishForm(formId: string): Promise<FormVersionSummary> {
  const res = await apiFetch(`${API_BASE}/forms/${id(formId)}/publish`, {
    method: "POST",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Publish failed: ${await readError(res)}`);
  return (await res.json()) as FormVersionSummary;
}

/** List a form's published versions (summaries, no body), newest first. */
export async function listVersions(formId: string): Promise<FormVersionSummary[]> {
  const res = await apiFetch(`${API_BASE}/forms/${id(formId)}/versions`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`List versions failed: ${await readError(res)}`);
  return (await res.json()) as FormVersionSummary[];
}

/** Load one published version (with its frozen body) by sequence number. */
export async function getVersion(formId: string, version: number): Promise<FormVersion> {
  const res = await apiFetch(`${API_BASE}/forms/${id(formId)}/versions/${version}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load version failed: ${await readError(res)}`);
  return (await res.json()) as FormVersion;
}

/** The form's active published version (with body), or `null` when it was never published. The
 *  server returns an empty body for "never published" (a normal state), so an empty/204 read maps
 *  to `null` rather than an error. */
export async function getActiveVersion(formId: string): Promise<FormVersion | null> {
  const res = await apiFetch(`${API_BASE}/forms/${id(formId)}/active-version`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load active version failed: ${await readError(res)}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as FormVersion) : null;
}

/** Roll a past version back into the editable draft (returns the new draft). */
export async function cloneDraft(formId: string, version: number): Promise<FormSchema> {
  const res = await apiFetch(`${API_BASE}/forms/${id(formId)}/versions/${version}/clone-draft`, {
    method: "POST",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Rollback failed: ${await readError(res)}`);
  return (await res.json()) as FormSchema;
}
