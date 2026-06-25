import type { StatusCatalogEntry } from "@org/workflow-schema";
import { API_BASE, ownerHeaders } from "../../workspace/config";

/**
 * Thin client for the `@app/api` status-catalog store (`/status-catalog`, WE4). Mirrors the
 * workflow/preset clients: `fetch` lives ONLY here, a non-OK response throws with the server's
 * message, and every request carries the `x-owner-id` owner header. The library a project sees is
 * `global ∪ thisProject`; the server validates every save.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const jsonHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  ...ownerHeaders(),
});

/** GET /status-catalog — the owner's global statuses, plus `projectId`'s statuses when given. */
export async function listStatusCatalog(projectId?: string): Promise<StatusCatalogEntry[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await fetch(`${API_BASE}/status-catalog${query}`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List status catalog failed: ${await readError(res)}`);
  return (await res.json()) as StatusCatalogEntry[];
}

/** POST /status-catalog — create or update a status entry; returns the normalized entry. */
export async function saveStatusEntry(entry: StatusCatalogEntry): Promise<StatusCatalogEntry> {
  const res = await fetch(`${API_BASE}/status-catalog`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Save status failed: ${await readError(res)}`);
  return (await res.json()) as StatusCatalogEntry;
}

/** POST /status-catalog/:code/promote — make a project status global; returns the promoted entry. */
export async function promoteStatusEntry(code: string): Promise<StatusCatalogEntry> {
  const res = await fetch(`${API_BASE}/status-catalog/${encodeURIComponent(code)}/promote`, {
    method: "POST",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Promote status failed: ${await readError(res)}`);
  return (await res.json()) as StatusCatalogEntry;
}

/** DELETE /status-catalog/:code — remove a saved status entry. */
export async function deleteStatusEntry(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/status-catalog/${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Delete status failed: ${await readError(res)}`);
}
