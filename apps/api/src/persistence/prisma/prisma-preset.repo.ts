import { Injectable } from "@nestjs/common";
import type { FieldNode, Preset, PresetScope } from "@org/form-schema";
import type { Prisma } from "@prisma/client";
import { PresetRepo } from "../repositories/preset.repo.js";
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

  /** Global presets for the owner, unioned with this project's presets when `projectId` is set. */
  async list(ownerId: string, projectId?: string): Promise<Preset[]> {
    const where: Prisma.PresetWhereInput = projectId
      ? { ownerId, OR: [{ scope: "global" }, { scope: "project", projectId }] }
      : { ownerId, scope: "global" };
    const rows = await this.prisma.preset.findMany({ where });
    return rows.map(toPreset);
  }

  async findOwner(id: string): Promise<string | null> {
    const row = await this.prisma.preset.findUnique({ where: { id }, select: { ownerId: true } });
    return row?.ownerId ?? null;
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
