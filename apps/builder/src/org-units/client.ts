import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../workspace/config";

/**
 * Thin client for the org-unit api (`/org-units`, product-roadmap Phase B2/C3). Mirrors the error
 * handling of `admin/client.ts`. The server scopes every op to the caller's tenant and is
 * authoritative; this UI only renders the flat list and posts edits.
 */

/** A node in the tenant's org tree (flat; the client builds the hierarchy). */
export interface OrgUnit {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  kind: string | null;
  order: number;
  createdAt: string;
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const jsonHeaders = (): Record<string, string> => ({
  ...ownerHeaders(),
  "content-type": "application/json",
});

const id = (s: string): string => encodeURIComponent(s);

export async function listOrgUnits(): Promise<OrgUnit[]> {
  const res = await apiFetch(`${API_BASE}/org-units`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Tải đơn vị thất bại: ${await readError(res)}`);
  return (await res.json()) as OrgUnit[];
}

export async function createOrgUnit(input: {
  name: string;
  parentId?: string | null;
}): Promise<OrgUnit> {
  const res = await apiFetch(`${API_BASE}/org-units`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as OrgUnit;
}

export async function renameOrgUnit(unitId: string, name: string): Promise<OrgUnit> {
  const res = await apiFetch(`${API_BASE}/org-units/${id(unitId)}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as OrgUnit;
}

/** Delete a unit; `cascade` removes sub-units too (members fall off, projects unplace via SetNull). */
export async function deleteOrgUnit(unitId: string, cascade = false): Promise<void> {
  const suffix = cascade ? "?cascade=true" : "";
  const res = await apiFetch(`${API_BASE}/org-units/${id(unitId)}${suffix}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(await readError(res));
}
