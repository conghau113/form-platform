import { Module } from "@nestjs/common";
import { AdminCatalogController } from "./admin-catalog.controller.js";
import { AdminCatalogService } from "./admin-catalog.service.js";

/**
 * Feature module: tenant-wide admin catalog (product-roadmap D2–D4 — form/workflow/version/instance
 * management). Function-gated read endpoints; persists via the global `AdminCatalogRepo` + `TenantRepo`.
 */
@Module({
  controllers: [AdminCatalogController],
  providers: [AdminCatalogService],
})
export class AdminCatalogModule {}
