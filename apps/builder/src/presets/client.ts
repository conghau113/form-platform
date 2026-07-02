import type { Preset } from "@org/form-schema";
import { apiFetch } from "../lib/apiFetch";
import { ownerHeaders } from "../workspace/config";
import { API_BASE } from "./config";

/**
 * Thin client for the `@app/api` preset store (`/presets`). Mirrors the error handling of
 * the inline form/theme fetches in App.tsx: a non-OK response throws with the server's
 * message when present. The server is the source of truth — it validates every save.
 *
 * Every request carries the `x-owner-id` owner header ({@link ownerHeaders}, the W5-auth
 * seam) so presets are scoped to the same owner as the rest of the workspace.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

/**
 * GET /presets — the owner's global presets, plus `projectId`'s presets when given.
 * Built-in presets live in the builder, not here.
 */
export async function listPresets(projectId?: string): Promise<Preset[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await apiFetch(`${API_BASE}/presets${query}`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List presets failed: ${await readError(res)}`);
  return (await res.json()) as Preset[];
}

/** POST /presets — create or update a preset; returns the normalized preset. */
export async function savePreset(preset: Preset): Promise<Preset> {
  const res = await apiFetch(`${API_BASE}/presets`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ownerHeaders() },
    body: JSON.stringify(preset),
  });
  if (!res.ok) throw new Error(`Save preset failed: ${await readError(res)}`);
  return (await res.json()) as Preset;
}

/** POST /presets/:id/promote — make a project preset global; returns the promoted preset. */
export async function promotePreset(id: string): Promise<Preset> {
  const res = await apiFetch(`${API_BASE}/presets/${encodeURIComponent(id)}/promote`, {
    method: "POST",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Promote preset failed: ${await readError(res)}`);
  return (await res.json()) as Preset;
}

/** DELETE /presets/:id — remove a saved preset. */
export async function deletePreset(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Delete preset failed: ${await readError(res)}`);
}
