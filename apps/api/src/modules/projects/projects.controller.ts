import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ActiveTenant } from "../../auth/active-tenant.decorator.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { ProjectRecord } from "../../persistence/repositories/project.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ActorRolesService } from "./actor-roles.service.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { CreateProjectDto } from "./dto/create-project.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { UpdateProjectDto } from "./dto/update-project.dto.js";
import type { ProjectTree } from "./projects.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly actorRoles: ActorRolesService,
  ) {}

  /** Creates into the caller's active workspace unless `dto.tenantId` names another one. */
  @Post()
  create(
    @CurrentOwner() ownerId: string,
    @Body() dto: CreateProjectDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<ProjectRecord> {
    return this.projects.create(ownerId, dto, activeTenantId);
  }

  /** Projects visible in the caller's active workspace (plus anything shared with them directly). */
  @Get()
  list(
    @CurrentOwner() ownerId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<ProjectRecord[]> {
    return this.projects.list(ownerId, activeTenantId);
  }

  @Get(":id")
  findOne(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<ProjectRecord> {
    return this.projects.getOne(ownerId, id);
  }

  /**
   * The domain roles the SERVER says the caller acts in on this project (Phase E3c).
   *
   * Read-only, and it grants nothing: the runtimes derive these roles for themselves on every
   * request. It exists so a renderer can HIDE the fields the server is going to mask/strip anyway —
   * without it the UI happily accepts typing into a `viewRoles`-gated box whose value the server
   * then silently drops. `requireAccess` first, so someone who cannot open the project gets the
   * same 404 as one that does not exist rather than a list of role names.
   */
  @Get(":id/my-roles")
  async myRoles(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
  ): Promise<{ roles: string[] }> {
    await this.projects.requireAccess(ownerId, id, "viewer");
    return { roles: await this.actorRoles.forProject(ownerId, id) };
  }

  /** Folders + form summaries for the whole project — the client builds the tree. */
  @Get(":id/tree")
  tree(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<ProjectTree> {
    return this.projects.getTree(ownerId, id);
  }

  @Patch(":id")
  update(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectRecord> {
    return this.projects.update(ownerId, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<void> {
    return this.projects.remove(ownerId, id);
  }
}
