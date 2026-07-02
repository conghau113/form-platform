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

/** A tenant role plus the function codes it grants. */
export interface RoleWithFunctions {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  system: boolean;
  createdAt: string;
  functions: string[];
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
