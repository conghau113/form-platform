import { Injectable } from "@nestjs/common";
import type { Project } from "@prisma/client";
import {
  type ProjectCreateInput,
  type ProjectRecord,
  ProjectRepo,
  type ProjectUpdateInput,
} from "../repositories/project.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Slug of the default landing project that adopts forms with no explicit project (W0). */
export const UNFILED_SLUG = "unfiled";

function toRecord(p: Project): ProjectRecord {
  return {
    id: p.id,
    ownerId: p.ownerId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class PrismaProjectRepo extends ProjectRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ensureUnfiled(ownerId: string): Promise<ProjectRecord> {
    const project = await this.prisma.project.upsert({
      where: { ownerId_slug: { ownerId, slug: UNFILED_SLUG } },
      update: {},
      create: { ownerId, slug: UNFILED_SLUG, name: "Unfiled" },
    });
    return toRecord(project);
  }

  async create(input: ProjectCreateInput): Promise<ProjectRecord> {
    const project = await this.prisma.project.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
      },
    });
    return toRecord(project);
  }

  async list(ownerId: string): Promise<ProjectRecord[]> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    });
    return projects.map(toRecord);
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    return project ? toRecord(project) : null;
  }

  async findByIds(ids: string[]): Promise<ProjectRecord[]> {
    if (ids.length === 0) return [];
    const projects = await this.prisma.project.findMany({ where: { id: { in: ids } } });
    return projects.map(toRecord);
  }

  async update(id: string, patch: ProjectUpdateInput): Promise<ProjectRecord> {
    const project = await this.prisma.project.update({
      where: { id },
      data: { name: patch.name, description: patch.description },
    });
    return toRecord(project);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.project.delete({ where: { id } });
  }
}
