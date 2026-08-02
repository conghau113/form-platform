import { Injectable } from "@nestjs/common";
import type { Role } from "@prisma/client";
import {
  ADMIN_ROLE_NAME,
  type FunctionRecord,
  type FunctionSeed,
  RbacRepo,
  type RoleCreateInput,
  type RoleRecord,
  type RoleUpdateInput,
  type ScopedGrant,
  type TenantUserRecord,
  WILDCARD_FUNCTION,
} from "../repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

function toRole(r: Role): RoleRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    description: r.description,
    system: r.system,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class PrismaRbacRepo extends RbacRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async seedFunctions(functions: FunctionSeed[]): Promise<void> {
    // Upsert each so re-seeding at every boot is a no-op; never deletes client data.
    await this.prisma.$transaction(
      functions.map((f) =>
        this.prisma.function.upsert({
          where: { code: f.code },
          create: { code: f.code, name: f.name, parentCode: f.parentCode ?? null, system: true },
          update: { name: f.name, parentCode: f.parentCode ?? null },
        }),
      ),
    );
  }

  async listFunctions(): Promise<FunctionRecord[]> {
    // Exclude the `*` superadmin sentinel — it exists only to satisfy the FK for the admin role's
    // grant; it is never an editor-selectable / client-grantable function.
    const rows = await this.prisma.function.findMany({
      where: { code: { not: WILDCARD_FUNCTION } },
      orderBy: { code: "asc" },
    });
    return rows.map((f) => ({
      code: f.code,
      name: f.name,
      parentCode: f.parentCode,
      system: f.system,
    }));
  }

  async createRole(input: RoleCreateInput): Promise<RoleRecord> {
    const role = await this.prisma.role.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description ?? null,
        system: input.system ?? false,
      },
    });
    return toRole(role);
  }

  async listRoles(tenantId: string): Promise<RoleRecord[]> {
    const rows = await this.prisma.role.findMany({
      where: { tenantId },
      orderBy: [{ system: "desc" }, { name: "asc" }],
    });
    return rows.map(toRole);
  }

  async findRoleById(id: string): Promise<RoleRecord | null> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    return role ? toRole(role) : null;
  }

  async updateRole(id: string, patch: RoleUpdateInput): Promise<RoleRecord> {
    const role = await this.prisma.role.update({
      where: { id },
      data: { name: patch.name, description: patch.description },
    });
    return toRole(role);
  }

  async deleteRole(id: string): Promise<void> {
    await this.prisma.role.delete({ where: { id } });
  }

  async setRoleFunctions(roleId: string, functionCodes: string[]): Promise<void> {
    const codes = [...new Set(functionCodes)];
    await this.prisma.$transaction([
      this.prisma.roleFunction.deleteMany({ where: { roleId } }),
      this.prisma.roleFunction.createMany({
        data: codes.map((functionCode) => ({ roleId, functionCode })),
        skipDuplicates: true,
      }),
    ]);
  }

  async listRoleFunctions(roleId: string): Promise<string[]> {
    const rows = await this.prisma.roleFunction.findMany({
      where: { roleId },
      select: { functionCode: true },
    });
    return rows.map((r) => r.functionCode);
  }

  async setRoleDataScopes(roleId: string, orgUnitIds: string[]): Promise<void> {
    const ids = [...new Set(orgUnitIds)];
    await this.prisma.$transaction([
      this.prisma.dataScope.deleteMany({ where: { roleId } }),
      this.prisma.dataScope.createMany({
        data: ids.map((orgUnitId) => ({ roleId, orgUnitId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async listRoleDataScopes(roleId: string): Promise<string[]> {
    const rows = await this.prisma.dataScope.findMany({
      where: { roleId },
      select: { orgUnitId: true },
    });
    return rows.map((r) => r.orgUnitId);
  }

  async listTenantUsers(tenantId: string): Promise<TenantUserRecord[]> {
    // Members come from Membership (the tenant↔user link); each user's roles are filtered to this
    // tenant so cross-tenant assignments never leak. One query with nested includes (no N+1).
    const members = await this.prisma.membership.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            roles: { where: { role: { tenantId } }, select: { roleId: true } },
          },
        },
      },
    });
    return members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      displayName: m.user.displayName,
      roleIds: m.user.roles.map((r) => r.roleId),
    }));
  }

  async setUserRoles(userId: string, tenantId: string, roleIds: string[]): Promise<void> {
    const ids = [...new Set(roleIds)];
    await this.prisma.$transaction([
      // Scope the wipe to this tenant so assignments in the user's other tenants are untouched.
      this.prisma.userRole.deleteMany({ where: { userId, role: { tenantId } } }),
      this.prisma.userRole.createMany({
        data: ids.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async listUserRoleIds(userId: string, tenantId?: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId, ...(tenantId ? { role: { tenantId } } : {}) },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  }

  async listUserRoleNames(userId: string, tenantId: string): Promise<string[]> {
    const rows = await this.prisma.role.findMany({
      where: { tenantId, users: { some: { userId } } },
      select: { name: true },
    });
    return [...new Set(rows.map((r) => r.name))];
  }

  async resolveFunctions(userId: string, tenantId: string): Promise<string[]> {
    const grants = await this.prisma.roleFunction.findMany({
      where: { role: { tenantId, users: { some: { userId } } } },
      select: { functionCode: true },
    });
    return [...new Set(grants.map((g) => g.functionCode))];
  }

  async resolveScopedGrants(userId: string, tenantId: string): Promise<ScopedGrant[]> {
    const roles = await this.prisma.role.findMany({
      where: { tenantId, users: { some: { userId } } },
      select: {
        functions: { select: { functionCode: true } },
        dataScopes: { select: { orgUnitId: true } },
      },
    });
    return roles.map((r) => ({
      functions: r.functions.map((f) => f.functionCode),
      scopeOrgUnitIds: r.dataScopes.map((d) => d.orgUnitId),
    }));
  }

  async ensureTenantAdmin(userId: string, tenantId: string): Promise<void> {
    // Idempotent: reuse the tenant's admin role if present, else create it; ensure it holds `*`
    // and that the user is assigned it. Keyed by (tenantId, name) — the schema's unique constraint.
    // The `*` sentinel must exist in the Function table to satisfy the RoleFunction FK (it is hidden
    // from the catalog listing so clients can't grant it themselves).
    await this.prisma.function.upsert({
      where: { code: WILDCARD_FUNCTION },
      create: { code: WILDCARD_FUNCTION, name: "All permissions", system: true },
      update: {},
    });
    const role = await this.prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: ADMIN_ROLE_NAME } },
      create: { tenantId, name: ADMIN_ROLE_NAME, description: "Full access", system: true },
      update: {},
    });
    await this.prisma.roleFunction.upsert({
      where: { roleId_functionCode: { roleId: role.id, functionCode: WILDCARD_FUNCTION } },
      create: { roleId: role.id, functionCode: WILDCARD_FUNCTION },
      update: {},
    });
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
  }
}
