import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../workspace/config";

/**
 * Thin client for the RBAC admin api (`/rbac/*`, product-roadmap Phase D1). Mirrors the error
 * handling of `versions/client.ts`. The server is authoritative and function-gated
 * (`role.admin` / `user.admin`); this UI only renders what those endpoints return.
 */

/** A platform permission code from the catalog (the `*` sentinel is never listed). */
export interface FunctionRecord {
  code: string;
  name: string;
  parentCode: string | null;
  system: boolean;
}

/** A tenant role plus the function codes it grants and its data-scope org units (C3). `dataScopes`
 *  empty = tenant-wide. */
export interface RoleWithFunctions {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  system: boolean;
  createdAt: string;
  functions: string[];
  dataScopes: string[];
}

/** A tenant member with the role ids they hold in this tenant. */
export interface TenantUser {
  id: string;
  email: string;
  displayName: string | null;
  roleIds: string[];
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

export async function listFunctions(): Promise<FunctionRecord[]> {
  const res = await apiFetch(`${API_BASE}/rbac/functions`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load function catalog failed: ${await readError(res)}`);
  return (await res.json()) as FunctionRecord[];
}

export async function listRoles(): Promise<RoleWithFunctions[]> {
  const res = await apiFetch(`${API_BASE}/rbac/roles`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load roles failed: ${await readError(res)}`);
  return (await res.json()) as RoleWithFunctions[];
}

export async function createRole(name: string, description?: string): Promise<RoleWithFunctions> {
  const res = await apiFetch(`${API_BASE}/rbac/roles`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as RoleWithFunctions;
}

export async function updateRole(
  roleId: string,
  patch: { name?: string; description?: string },
): Promise<RoleWithFunctions> {
  const res = await apiFetch(`${API_BASE}/rbac/roles/${id(roleId)}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as RoleWithFunctions;
}

export async function deleteRole(roleId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/rbac/roles/${id(roleId)}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(await readError(res));
}

/** Replace the full set of function codes a role grants. */
export async function setRoleFunctions(
  roleId: string,
  functions: string[],
): Promise<RoleWithFunctions> {
  const res = await apiFetch(`${API_BASE}/rbac/roles/${id(roleId)}/functions`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ functions }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as RoleWithFunctions;
}

/** Replace the full set of org-unit ids a role is data-scoped to (empty = tenant-wide, C3). */
export async function setRoleDataScopes(
  roleId: string,
  orgUnitIds: string[],
): Promise<RoleWithFunctions> {
  const res = await apiFetch(`${API_BASE}/rbac/roles/${id(roleId)}/data-scopes`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ orgUnitIds }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as RoleWithFunctions;
}

export async function listUsers(): Promise<TenantUser[]> {
  const res = await apiFetch(`${API_BASE}/rbac/users`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load members failed: ${await readError(res)}`);
  return (await res.json()) as TenantUser[];
}

/** Add an existing account to the tenant by email; returns the refreshed member list. */
export async function addMember(email: string): Promise<TenantUser[]> {
  const res = await apiFetch(`${API_BASE}/rbac/users`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as TenantUser[];
}

/** Replace the full set of role ids a member holds in this tenant. */
export async function setUserRoles(userId: string, roleIds: string[]): Promise<string[]> {
  const res = await apiFetch(`${API_BASE}/rbac/users/${id(userId)}/roles`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ roleIds }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as string[];
}

// --- Tenant-wide admin catalog (D2–D4) --------------------------------------
// Read-only lists across every project in the caller's tenant, function-gated server-side
// (`form.admin` / `workflow.admin`). Dates arrive as ISO strings over JSON.

/** A form in the tenant + its project's name (D2). */
export interface AdminFormRow {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: string;
  projectName: string;
}

/** A workflow in the tenant + its project's name (D3). */
export interface AdminWorkflowRow {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: string;
  projectName: string;
}

/** A published form version + its parent form/project names (D4). */
export interface AdminFormVersionRow {
  id: string;
  formId: string;
  projectId: string;
  version: number;
  formVersion: number;
  publishedBy: string;
  publishedAt: string;
  formTitle: string;
  projectName: string;
}

/** A running workflow case + its parent workflow/project names (D4). */
export interface AdminWorkflowInstanceRow {
  id: string;
  workflowId: string;
  projectId: string;
  current: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  workflowTitle: string;
  projectName: string;
}

export async function listAdminForms(): Promise<AdminFormRow[]> {
  const res = await apiFetch(`${API_BASE}/admin/forms`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load forms failed: ${await readError(res)}`);
  return (await res.json()) as AdminFormRow[];
}

export async function listAdminWorkflows(): Promise<AdminWorkflowRow[]> {
  const res = await apiFetch(`${API_BASE}/admin/workflows`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load workflows failed: ${await readError(res)}`);
  return (await res.json()) as AdminWorkflowRow[];
}

export async function listAdminFormVersions(): Promise<AdminFormVersionRow[]> {
  const res = await apiFetch(`${API_BASE}/admin/form-versions`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load versions failed: ${await readError(res)}`);
  return (await res.json()) as AdminFormVersionRow[];
}

export async function listAdminInstances(): Promise<AdminWorkflowInstanceRow[]> {
  const res = await apiFetch(`${API_BASE}/admin/workflow-instances`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Load cases failed: ${await readError(res)}`);
  return (await res.json()) as AdminWorkflowInstanceRow[];
}
