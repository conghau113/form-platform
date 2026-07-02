import type { FormSchema } from "@org/form-schema";
import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "./config";
import type {
  FolderRecord,
  FormSummary,
  MemberRole,
  ProjectMember,
  ProjectMembersView,
  ProjectRecord,
  ProjectTree,
} from "./types";

/**
 * Thin client for the workspace api (Track W: `/projects`, `/folders`, `/forms`). Mirrors the
 * error handling of `presets/client.ts` — a non-OK response throws with the server's message when
 * present. Every request carries the `x-owner-id` owner header ({@link ownerHeaders}); the server
 * validates and owns the data.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const jsonHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  ...ownerHeaders(),
});

// --- Projects ---------------------------------------------------------------

export async function listProjects(): Promise<ProjectRecord[]> {
  const res = await apiFetch(`${API_BASE}/projects`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List projects failed: ${await readError(res)}`);
  return (await res.json()) as ProjectRecord[];
}

export async function createProject(input: {
  name: string;
  description?: string | null;
}): Promise<ProjectRecord> {
  const res = await apiFetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Create project failed: ${await readError(res)}`);
  return (await res.json()) as ProjectRecord;
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<ProjectRecord> {
  const res = await apiFetch(`${API_BASE}/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update project failed: ${await readError(res)}`);
  return (await res.json()) as ProjectRecord;
}

export async function deleteProject(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Delete project failed: ${await readError(res)}`);
}

export async function getProjectTree(id: string): Promise<ProjectTree> {
  const res = await apiFetch(`${API_BASE}/projects/${encodeURIComponent(id)}/tree`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load project failed: ${await readError(res)}`);
  return (await res.json()) as ProjectTree;
}

// --- Folders ----------------------------------------------------------------

export async function createFolder(input: {
  projectId: string;
  parentId?: string | null;
  name: string;
}): Promise<FolderRecord> {
  const res = await apiFetch(`${API_BASE}/folders`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${await readError(res)}`);
  return (await res.json()) as FolderRecord;
}

/** Rename, move (`parentId`) and/or reorder a folder via one PATCH. Cycle → 409. */
export async function updateFolder(
  id: string,
  patch: { name?: string; parentId?: string | null; order?: number },
): Promise<FolderRecord> {
  const res = await apiFetch(`${API_BASE}/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update folder failed: ${await readError(res)}`);
  return (await res.json()) as FolderRecord;
}

/** Delete a folder; non-empty → 409 unless `cascade` (sub-folders cascade, forms fall to root). */
export async function deleteFolder(id: string, cascade = false): Promise<void> {
  const url = `${API_BASE}/folders/${encodeURIComponent(id)}${cascade ? "?cascade=true" : ""}`;
  const res = await apiFetch(url, { method: "DELETE", headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Delete folder failed: ${await readError(res)}`);
}

// --- Forms ------------------------------------------------------------------

export async function listForms(projectId: string, folderId?: string): Promise<FormSummary[]> {
  const params = new URLSearchParams({ projectId });
  if (folderId) params.set("folderId", folderId);
  const res = await apiFetch(`${API_BASE}/forms?${params}`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List forms failed: ${await readError(res)}`);
  return (await res.json()) as FormSummary[];
}

export async function loadForm(id: string): Promise<FormSchema> {
  const res = await apiFetch(`${API_BASE}/forms/${encodeURIComponent(id)}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load form failed: ${await readError(res)}`);
  return (await res.json()) as FormSchema;
}

/** Upsert a form contract, optionally placing it in a project/folder. */
export async function saveForm(
  body: FormSchema,
  placement?: { projectId?: string; folderId?: string | null },
): Promise<FormSchema> {
  const params = new URLSearchParams();
  if (placement?.projectId) params.set("projectId", placement.projectId);
  if (placement?.folderId) params.set("folderId", placement.folderId);
  const query = params.toString();
  const res = await apiFetch(`${API_BASE}/forms${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Save form failed: ${await readError(res)}`);
  return (await res.json()) as FormSchema;
}

/** Move a form to another folder (`folderId: null` → project root). */
export async function moveForm(id: string, folderId: string | null): Promise<FormSummary> {
  const res = await apiFetch(`${API_BASE}/forms/${encodeURIComponent(id)}/move`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ folderId }),
  });
  if (!res.ok) throw new Error(`Move form failed: ${await readError(res)}`);
  return (await res.json()) as FormSummary;
}

export async function deleteForm(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/forms/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Delete form failed: ${await readError(res)}`);
}

// --- Sharing / members (W5) -------------------------------------------------

function membersUrl(projectId: string, userId?: string): string {
  const base = `${API_BASE}/projects/${encodeURIComponent(projectId)}/members`;
  return userId ? `${base}/${encodeURIComponent(userId)}` : base;
}

export async function listMembers(projectId: string): Promise<ProjectMembersView> {
  const res = await apiFetch(membersUrl(projectId), { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List members failed: ${await readError(res)}`);
  return (await res.json()) as ProjectMembersView;
}

/** Share with a collaborator (or re-grant a new role to an existing one). Owner only. */
export async function grantMember(
  projectId: string,
  userId: string,
  role: MemberRole,
): Promise<ProjectMember> {
  const res = await apiFetch(membersUrl(projectId), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ userId, role }),
  });
  if (!res.ok) throw new Error(`Share failed: ${await readError(res)}`);
  return (await res.json()) as ProjectMember;
}

/** Change an existing collaborator's role. Owner only. */
export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: MemberRole,
): Promise<ProjectMember> {
  const res = await apiFetch(membersUrl(projectId, userId), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Update role failed: ${await readError(res)}`);
  return (await res.json()) as ProjectMember;
}

/** Revoke a collaborator's access. Owner only. */
export async function revokeMember(projectId: string, userId: string): Promise<void> {
  const res = await apiFetch(membersUrl(projectId, userId), {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Revoke failed: ${await readError(res)}`);
}
