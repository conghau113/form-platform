import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ActiveTenant } from "../../auth/active-tenant.decorator.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { OrgUnitRecord } from "../../persistence/repositories/org-unit.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { CreateOrgUnitDto } from "./dto/create-org-unit.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { UpdateOrgUnitDto } from "./dto/update-org-unit.dto.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { OrgUnitsService } from "./org-units.service.js";

@Controller("org-units")
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  /** Flat list of the caller's active-tenant org units (client builds the tree). */
  @Get()
  list(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<OrgUnitRecord[]> {
    return this.orgUnits.list(userId, activeTenantId);
  }

  @Post()
  create(
    @CurrentOwner() userId: string,
    @Body() dto: CreateOrgUnitDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<OrgUnitRecord> {
    return this.orgUnits.create(userId, dto, activeTenantId);
  }

  /** Rename / move (`parentId`) / reorder / relabel. A move that would loop the tree → 409. */
  @Patch(":id")
  update(
    @CurrentOwner() userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateOrgUnitDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<OrgUnitRecord> {
    return this.orgUnits.update(userId, id, dto, activeTenantId);
  }

  /** Delete; non-empty → 409 unless `?cascade=true` (sub-units cascade, members fall off via SetNull). */
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentOwner() userId: string,
    @Param("id") id: string,
    @Query("cascade") cascade?: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<void> {
    return this.orgUnits.remove(userId, id, cascade === "true", activeTenantId);
  }
}
