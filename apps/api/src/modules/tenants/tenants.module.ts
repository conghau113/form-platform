import { Module } from "@nestjs/common";
import { TenantsController } from "./tenants.controller.js";
import { TenantsService } from "./tenants.service.js";

/**
 * Feature module: the caller's tenant memberships (Phase B4 — `GET /tenants` for the workspace
 * picker). Persists via the global repo interfaces (`TenantRepo`, `RbacRepo`).
 */
@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
