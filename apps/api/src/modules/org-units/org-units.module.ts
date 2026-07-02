import { Module } from "@nestjs/common";
import { OrgUnitsController } from "./org-units.controller.js";
import { OrgUnitsService } from "./org-units.service.js";

/**
 * Feature module: tenant-scoped org-unit CRUD (Phase B2). Persists via the global repo interfaces
 * (`OrgUnitRepo`, `TenantRepo`); the caller's tenant is resolved from their membership in the service.
 */
@Module({
  controllers: [OrgUnitsController],
  providers: [OrgUnitsService],
})
export class OrgUnitsModule {}
