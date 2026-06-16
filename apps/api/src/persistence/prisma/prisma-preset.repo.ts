import { Injectable } from "@nestjs/common";
import type { FieldNode, Preset } from "@org/form-schema";
import type { Prisma } from "@prisma/client";
import { SEED_OWNER_ID } from "../../common/constants.js";
import { PresetRepo } from "../repositories/preset.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** W0 stores every preset globally; W3 introduces per-project scope. */
const SCOPE_GLOBAL = "global";

/** Map a DB row back to the P1 `Preset` shape the API has always returned (no scope/owner). */
function toPreset(row: {
  id: string;
  fieldType: string;
  name: string;
  icon: string | null;
  patch: Prisma.JsonValue;
}): Preset {
  return {
    id: row.id,
    fieldType: row.fieldType as FieldNode["type"],
    name: row.name,
    ...(row.icon ? { icon: row.icon } : {}),
    patch: row.patch as Record<string, unknown>,
  };
}

@Injectable()
export class PrismaPresetRepo extends PresetRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<Preset[]> {
    const rows = await this.prisma.preset.findMany();
    return rows.map(toPreset);
  }

  async upsert(preset: Preset): Promise<Preset> {
    const data = {
      scope: SCOPE_GLOBAL,
      projectId: null,
      ownerId: SEED_OWNER_ID,
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
    return preset;
  }

  async remove(id: string): Promise<boolean> {
    const { count } = await this.prisma.preset.deleteMany({ where: { id } });
    return count > 0;
  }
}
