import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { StatusCatalogController } from "./status-catalog.controller.js";
import { StatusCatalogService } from "./status-catalog.service.js";

/**
 * Feature module: workflow status-catalog CRUD endpoints + their service (persists via
 * StatusCatalogRepo). Imports ProjectsModule so project-scoped statuses gate on project role
 * (shared project library, mirroring PresetsModule).
 */
@Module({
  imports: [ProjectsModule],
  controllers: [StatusCatalogController],
  providers: [StatusCatalogService],
})
export class StatusCatalogModule {}
