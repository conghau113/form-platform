import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { ProjectRecord } from "../../persistence/repositories/project.repo.js";
import type { CreateProjectDto, ProjectTree } from "./projects.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ProjectsService } from "./projects.service.js";

interface UpdateProjectDto {
  name?: string;
  description?: string | null;
}

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentOwner() ownerId: string, @Body() dto: CreateProjectDto): Promise<ProjectRecord> {
    return this.projects.create(ownerId, dto);
  }

  @Get()
  list(@CurrentOwner() ownerId: string): Promise<ProjectRecord[]> {
    return this.projects.list(ownerId);
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
