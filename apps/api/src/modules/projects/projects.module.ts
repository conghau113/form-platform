import { Module } from "@nestjs/common";
import { ActorRolesService } from "./actor-roles.service.js";
import { MembersController } from "./members.controller.js";
import { MembersService } from "./members.service.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";

/**
 * Feature module: project CRUD + `/projects/:id/tree` + sharing (`/projects/:id/members`, W5).
 * Persists via the global repo interfaces. `ProjectsService` is exported so the folders/forms
 * modules can reuse its role-based access gate (`requireAccess` / `getOne`), and
 * {@link ActorRolesService} so the workflow/submission runtimes derive a caller's domain roles from
 * the server instead of trusting the request body (Phase E3a).
 */
@Module({
  controllers: [ProjectsController, MembersController],
  providers: [ProjectsService, MembersService, ActorRolesService],
  exports: [ProjectsService, ActorRolesService],
})
export class ProjectsModule {}
