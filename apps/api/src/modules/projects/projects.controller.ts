import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ActiveTenant } from "../../auth/active-tenant.decorator.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { ProjectRecord } from "../../persistence/repositories/project.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { CreateProjectDto } from "./dto/create-project.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { UpdateProjectDto } from "./dto/update-project.dto.js";
import type { ProjectTree } from "./projects.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

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
