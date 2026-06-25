import { Injectable } from "@nestjs/common";
import type { StatusCatalogEntry, StatusCatalogScope, StatusKind } from "@org/workflow-schema";
import type { Prisma } from "@prisma/client";
import {
  type StatusCatalogMeta,
  type StatusCatalogProjectScope,
  StatusCatalogRepo,
} from "../repositories/status-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Default scope for an entry that arrives without one. */
const SCOPE_GLOBAL: StatusCatalogScope = "global";

/** Map a DB row back to the `StatusCatalogEntry` shape (omit nullable `color`/`projectId`). */
function toEntry(row: {
  code: string;
  scope: string;
  projectId: string | null;
  label: string;
  kind: string;
  color: string | null;
}): StatusCatalogEntry {
  return {
    code: row.code,
    label: row.label,
    kind: row.kind as StatusKind,
    scope: row.scope as StatusCatalogScope,
    ...(row.color ? { color: row.color } : {}),
    ...(row.projectId ? { projectId: row.projectId } : {}),
  };
}

@Injectable()
export class PrismaStatusCatalogRepo extends StatusCatalogRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * The user's own global entries, unioned with a project's *shared* entries when given. Global
   * rows are the user's (`ownerId: userId`); project rows belong to the project owner so every
   * collaborator sees the same project catalog.
   */
  async list(userId: string, project?: StatusCatalogProjectScope): Promise<StatusCatalogEntry[]> {
    const where: Prisma.StatusCatalogEntryWhereInput = project
      ? {
          OR: [
            { ownerId: userId, scope: "global" },
            { ownerId: project.ownerId, scope: "project", projectId: project.id },
          ],
        }
      : { ownerId: userId, scope: "global" };
    const rows = await this.prisma.statusCatalogEntry.findMany({ where });
    return rows.map(toEntry);
  }

  async findMeta(code: string): Promise<StatusCatalogMeta | null> {
    const row = await this.prisma.statusCatalogEntry.findUnique({
      where: { code },
      select: { ownerId: true, scope: true, projectId: true },
    });
    return row
      ? { ownerId: row.ownerId, scope: row.scope as StatusCatalogScope, projectId: row.projectId }
      : null;
  }

  async upsert(ownerId: string, entry: StatusCatalogEntry): Promise<StatusCatalogEntry> {
    const scope = entry.scope ?? SCOPE_GLOBAL;
    // A project entry keeps its projectId; a global one never carries one.
    const projectId = scope === "project" ? (entry.projectId ?? null) : null;
    const data = {
      scope,
      projectId,
      ownerId,
      label: entry.label,
      kind: entry.kind,
      color: entry.color ?? null,
    };
    await this.prisma.statusCatalogEntry.upsert({
      where: { code: entry.code },
      update: data,
      create: { code: entry.code, ...data },
    });
    return {
      code: entry.code,
      label: entry.label,
      kind: entry.kind,
      scope,
      ...(entry.color ? { color: entry.color } : {}),
      ...(projectId ? { projectId } : {}),
    };
  }

  async remove(ownerId: string, code: string): Promise<boolean> {
    const { count } = await this.prisma.statusCatalogEntry.deleteMany({ where: { code, ownerId } });
    return count > 0;
  }

  async promote(ownerId: string, code: string): Promise<StatusCatalogEntry | null> {
    const { count } = await this.prisma.statusCatalogEntry.updateMany({
      where: { code, ownerId },
      data: { scope: "global", projectId: null },
    });
    if (count === 0) return null;
    const row = await this.prisma.statusCatalogEntry.findUnique({ where: { code } });
    return row ? toEntry(row) : null;
  }
}
