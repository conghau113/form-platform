import type { Preset } from "@org/form-schema";
import { API_BASE } from "./config";

/**
 * Thin client for the `@app/api` preset store (`/presets`). Mirrors the error handling of
 * the inline form/theme fetches in App.tsx: a non-OK response throws with the server's
 * message when present. The server is the source of truth — it validates every save.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

/** GET /presets — all saved user presets (built-in presets live in the builder). */
export async function listPresets(): Promise<Preset[]> {
  const res = await fetch(`${API_BASE}/presets`);
  if (!res.ok) throw new Error(`List presets failed: ${await readError(res)}`);
  return (await res.json()) as Preset[];
}

/** POST /presets — create or update a preset; returns the normalized preset. */
export async function savePreset(preset: Preset): Promise<Preset> {
  const res = await fetch(`${API_BASE}/presets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preset),
  });
  if (!res.ok) throw new Error(`Save preset failed: ${await readError(res)}`);
  return (await res.json()) as Preset;
}

/** DELETE /presets/:id — remove a saved preset. */
export async function deletePreset(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete preset failed: ${await readError(res)}`);
}
