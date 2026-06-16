import { Injectable } from "@nestjs/common";
import { type ProjectRecord, ProjectRepo } from "../repositories/project.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Slug of the default landing project that adopts forms with no explicit project (W0). */
export const UNFILED_SLUG = "unfiled";

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
    return { id: project.id, ownerId: project.ownerId, name: project.name, slug: project.slug };
  }
}
