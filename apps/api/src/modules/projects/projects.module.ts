import { Module } from "@nestjs/common";
import { MembersController } from "./members.controller.js";
import { MembersService } from "./members.service.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";

/**
 * Feature module: project CRUD + `/projects/:id/tree` + sharing (`/projects/:id/members`, W5).
 * Persists via the global repo interfaces. `ProjectsService` is exported so the folders/forms
 * modules can reuse its role-based access gate (`requireAccess` / `getOne`).
 */
@Module({
  controllers: [ProjectsController, MembersController],
  providers: [ProjectsService, MembersService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
