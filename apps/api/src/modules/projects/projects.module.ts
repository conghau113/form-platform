import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";

/**
 * Feature module: owner-scoped project CRUD + `/projects/:id/tree`. Persists via the global
 * repo interfaces. `ProjectsService` is exported so the folders module can reuse its ownership
 * gate (`getOne`).
 */
@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
