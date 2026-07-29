import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { ActiveTenant } from "../../auth/active-tenant.decorator.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import { RequireFunction } from "../../auth/require-function.decorator.js";
import type { FunctionRecord, TenantUserRecord } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AddMemberDto } from "./dto/add-member.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { SetRoleDataScopesDto } from "./dto/set-role-data-scopes.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { SetRoleFunctionsDto } from "./dto/set-role-functions.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { SetUserRolesDto } from "./dto/set-user-roles.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { UpsertRoleDto } from "./dto/upsert-role.dto.js";
import type { RoleWithFunctions } from "./rbac.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { RbacService } from "./rbac.service.js";

/**
 * RBAC admin API (product-roadmap Phase C). Role/assignment endpoints are function-gated by
 * {@link FunctionGuard} (`role.admin` / `user.admin`); `me/functions` is open to any authenticated
 * caller (it returns only their own permissions — the seam that drives nav gating, §6.7). Existing
 * owner-scoped routes are untouched in this slice; RBAC enforcement lands here first.
 *
 * Every route reads {@link ActiveTenant}, so administration targets the workspace the caller has
 * selected rather than always their personal tenant.
 */
@Controller("rbac")
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  /** The caller's own effective function codes (drives client-side nav gating). */
  @Get("me/functions")
  myFunctions(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<string[]> {
    return this.rbac.myFunctions(userId, activeTenantId);
  }

  /** The platform function catalog (for the role editor). */
  @Get("functions")
  @RequireFunction("role.admin")
  listFunctions(): Promise<FunctionRecord[]> {
    return this.rbac.listFunctions();
  }

  /** Any-of gate: the user admin also needs the tenant's roles (names) to display/assign them. */
  @Get("roles")
  @RequireFunction("role.admin", "user.admin")
  listRoles(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<RoleWithFunctions[]> {
    return this.rbac.listRoles(userId, activeTenantId);
  }

  @Post("roles")
  @RequireFunction("role.admin")
  createRole(
    @CurrentOwner() userId: string,
    @Body() dto: UpsertRoleDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    return this.rbac.createRole(userId, dto, activeTenantId);
  }

  @Patch("roles/:id")
  @RequireFunction("role.admin")
  updateRole(
    @CurrentOwner() userId: string,
    @Param("id") id: string,
    @Body() dto: UpsertRoleDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    return this.rbac.updateRole(userId, id, dto, activeTenantId);
  }

  @Delete("roles/:id")
  @RequireFunction("role.admin")
  @HttpCode(204)
  deleteRole(
    @CurrentOwner() userId: string,
    @Param("id") id: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<void> {
    return this.rbac.deleteRole(userId, id, activeTenantId);
  }

  /** Replace a role's granted function codes. */
  @Put("roles/:id/functions")
  @RequireFunction("role.admin")
  setRoleFunctions(
    @CurrentOwner() userId: string,
    @Param("id") id: string,
    @Body() dto: SetRoleFunctionsDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    return this.rbac.setRoleFunctions(userId, id, dto, activeTenantId);
  }

  /** Replace a role's data-scope org units (C3); empty clears the scope (tenant-wide). */
  @Put("roles/:id/data-scopes")
  @RequireFunction("role.admin")
  setRoleDataScopes(
    @CurrentOwner() userId: string,
    @Param("id") id: string,
    @Body() dto: SetRoleDataScopesDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    return this.rbac.setRoleDataScopes(userId, id, dto, activeTenantId);
  }

  /** The tenant's members with the roles each holds (drives the admin user list). */
  @Get("users")
  @RequireFunction("user.admin")
  listUsers(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<TenantUserRecord[]> {
    return this.rbac.listUsers(userId, activeTenantId);
  }

  /** Add an existing user (by email) to the caller's tenant; returns the refreshed member list. */
  @Post("users")
  @RequireFunction("user.admin")
  addMember(
    @CurrentOwner() userId: string,
    @Body() dto: AddMemberDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<TenantUserRecord[]> {
    return this.rbac.addMember(userId, dto, activeTenantId);
  }

  @Get("users/:userId/roles")
  @RequireFunction("user.admin")
  getUserRoles(
    @CurrentOwner() userId: string,
    @Param("userId") targetUserId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<string[]> {
    return this.rbac.getUserRoles(userId, targetUserId, activeTenantId);
  }

  /** Replace a user's assigned roles (all roles must live in the caller's tenant). */
  @Put("users/:userId/roles")
  @RequireFunction("user.admin")
  setUserRoles(
    @CurrentOwner() userId: string,
    @Param("userId") targetUserId: string,
    @Body() dto: SetUserRolesDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<string[]> {
    return this.rbac.setUserRoles(userId, targetUserId, dto, activeTenantId);
  }
}
