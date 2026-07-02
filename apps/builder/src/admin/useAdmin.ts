import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { FunctionRecord, RoleWithFunctions, TenantUser } from "./client";
import * as api from "./client";

/**
 * RBAC admin data hooks (D1), react-query like {@link useVersions}. The server owns all rules;
 * mutations just `invalidateQueries` and the next read reflects it. Everything also invalidates
 * `qk.myFunctions` — a role/assignment edit can change the caller's own permissions, and the nav
 * gate must follow. `fetch` lives only in `client.ts`.
 */

export function useRbacFunctions(enabled: boolean): {
  functions: FunctionRecord[];
  loading: boolean;
} {
  const query = useQuery({ queryKey: qk.rbacFunctions, queryFn: api.listFunctions, enabled });
  return { functions: query.data ?? [], loading: enabled && query.isPending };
}

export function useRbacRoles(enabled: boolean): { roles: RoleWithFunctions[]; loading: boolean } {
  const query = useQuery({ queryKey: qk.rbacRoles, queryFn: api.listRoles, enabled });
  return { roles: query.data ?? [], loading: enabled && query.isPending };
}

export function useTenantUsers(enabled: boolean): { users: TenantUser[]; loading: boolean } {
  const query = useQuery({ queryKey: qk.rbacUsers, queryFn: api.listUsers, enabled });
  return { users: query.data ?? [], loading: enabled && query.isPending };
}

/** Invalidate every RBAC read + the caller's own permission probe after a mutation. */
function useInvalidateRbac(): () => void {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.rbacRoles });
    qc.invalidateQueries({ queryKey: qk.rbacUsers });
    qc.invalidateQueries({ queryKey: qk.myFunctions });
  };
}

export function useRoleMutations(): {
  create: (name: string, description?: string) => Promise<RoleWithFunctions>;
  update: (roleId: string, patch: { name?: string; description?: string }) => Promise<unknown>;
  remove: (roleId: string) => Promise<void>;
  setFunctions: (roleId: string, functions: string[]) => Promise<unknown>;
} {
  const invalidate = useInvalidateRbac();
  const create = useMutation({
    mutationFn: (v: { name: string; description?: string }) =>
      api.createRole(v.name, v.description),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (v: { roleId: string; patch: { name?: string; description?: string } }) =>
      api.updateRole(v.roleId, v.patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: api.deleteRole, onSuccess: invalidate });
  const setFunctions = useMutation({
    mutationFn: (v: { roleId: string; functions: string[] }) =>
      api.setRoleFunctions(v.roleId, v.functions),
    onSuccess: invalidate,
  });
  return {
    create: (name, description) => create.mutateAsync({ name, description }),
    update: (roleId, patch) => update.mutateAsync({ roleId, patch }),
    remove: (roleId) => remove.mutateAsync(roleId),
    setFunctions: (roleId, functions) => setFunctions.mutateAsync({ roleId, functions }),
  };
}

export function useMemberMutations(): {
  add: (email: string) => Promise<unknown>;
  setRoles: (userId: string, roleIds: string[]) => Promise<unknown>;
} {
  const invalidate = useInvalidateRbac();
  const add = useMutation({ mutationFn: api.addMember, onSuccess: invalidate });
  const setRoles = useMutation({
    mutationFn: (v: { userId: string; roleIds: string[] }) => api.setUserRoles(v.userId, v.roleIds),
    onSuccess: invalidate,
  });
  return {
    add: (email) => add.mutateAsync(email),
    setRoles: (userId, roleIds) => setRoles.mutateAsync({ userId, roleIds }),
  };
}
