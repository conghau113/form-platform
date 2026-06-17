import { Injectable } from "@nestjs/common";
import type { FieldNode, Preset, PresetScope } from "@org/form-schema";
import type { Prisma } from "@prisma/client";
import {
  type PresetMeta,
  type PresetProjectScope,
  PresetRepo,
} from "../repositories/preset.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Default scope for a preset that arrives without one (back-compat with P1 bodies). */
const SCOPE_GLOBAL: PresetScope = "global";

/** Map a DB row back to the `Preset` shape (omit nullable `icon`/`projectId`, like the contract). */
function toPreset(row: {
  id: string;
  scope: string;
  projectId: string | null;
  fieldType: string;
  name: string;
  icon: string | null;
  patch: Prisma.JsonValue;
}): Preset {
  return {
    id: row.id,
    fieldType: row.fieldType as FieldNode["type"],
    name: row.name,
    scope: row.scope as PresetScope,
    ...(row.icon ? { icon: row.icon } : {}),
    ...(row.projectId ? { projectId: row.projectId } : {}),
    patch: row.patch as Record<string, unknown>,
  };
}

@Injectable()
export class PrismaPresetRepo extends PresetRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * The user's own global presets, unioned with a project's *shared* presets when given. Global
   * rows are the user's (`ownerId: userId`); project rows belong to the project owner so every
   * collaborator sees the same project library.
   */
  async list(userId: string, project?: PresetProjectScope): Promise<Preset[]> {
    const where: Prisma.PresetWhereInput = project
      ? {
          OR: [
            { ownerId: userId, scope: "global" },
            { ownerId: project.ownerId, scope: "project", projectId: project.id },
          ],
        }
      : { ownerId: userId, scope: "global" };
    const rows = await this.prisma.preset.findMany({ where });
    return rows.map(toPreset);
  }

  async findMeta(id: string): Promise<PresetMeta | null> {
    const row = await this.prisma.preset.findUnique({
      where: { id },
      select: { ownerId: true, scope: true, projectId: true },
    });
    return row
      ? { ownerId: row.ownerId, scope: row.scope as PresetScope, projectId: row.projectId }
      : null;
  }

  async upsert(ownerId: string, preset: Preset): Promise<Preset> {
    const scope = preset.scope ?? SCOPE_GLOBAL;
    // A project preset keeps its projectId; a global one never carries one.
    const projectId = scope === "project" ? (preset.projectId ?? null) : null;
    const data = {
      scope,
      projectId,
      ownerId,
      name: preset.name,
      fieldType: preset.fieldType,
      icon: preset.icon ?? null,
      patch: preset.patch as Prisma.InputJsonValue,
    };
    await this.prisma.preset.upsert({
      where: { id: preset.id },
      update: data,
      create: { id: preset.id, ...data },
    });
    // Echo the normalized preset (scope resolved, projectId cleared for global).
    return {
      id: preset.id,
      fieldType: preset.fieldType,
      name: preset.name,
      scope,
      ...(preset.icon ? { icon: preset.icon } : {}),
      ...(projectId ? { projectId } : {}),
      patch: preset.patch,
    };
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.preset.deleteMany({ where: { id, ownerId } });
    return count > 0;
  }

  async promote(ownerId: string, id: string): Promise<Preset | null> {
    const { count } = await this.prisma.preset.updateMany({
      where: { id, ownerId },
      data: { scope: "global", projectId: null },
    });
    if (count === 0) return null;
    const row = await this.prisma.preset.findUnique({ where: { id } });
    return row ? toPreset(row) : null;
  }
}
