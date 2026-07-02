import { Injectable } from "@nestjs/common";
import type { OrgUnit } from "@prisma/client";
import {
  type OrgUnitCreateInput,
  type OrgUnitRecord,
  OrgUnitRepo,
  type OrgUnitUpdateInput,
} from "../repositories/org-unit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

function toRecord(u: OrgUnit): OrgUnitRecord {
  return {
    id: u.id,
    tenantId: u.tenantId,
    parentId: u.parentId,
    name: u.name,
    kind: u.kind,
    order: u.order,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class PrismaOrgUnitRepo extends OrgUnitRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: OrgUnitCreateInput): Promise<OrgUnitRecord> {
    const unit = await this.prisma.orgUnit.create({
      data: {
        tenantId: input.tenantId,
        parentId: input.parentId ?? null,
        name: input.name,
        kind: input.kind ?? null,
        order: input.order ?? 0,
      },
    });
    return toRecord(unit);
  }

  async list(tenantId: string): Promise<OrgUnitRecord[]> {
    const units = await this.prisma.orgUnit.findMany({
      where: { tenantId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return units.map(toRecord);
  }

  async findById(id: string): Promise<OrgUnitRecord | null> {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id } });
    return unit ? toRecord(unit) : null;
  }

  async update(id: string, patch: OrgUnitUpdateInput): Promise<OrgUnitRecord> {
    const unit = await this.prisma.orgUnit.update({
      where: { id },
      data: { name: patch.name, parentId: patch.parentId, kind: patch.kind, order: patch.order },
    });
    return toRecord(unit);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.orgUnit.delete({ where: { id } });
  }

  async countChildren(id: string): Promise<{ units: number; members: number }> {
    const [units, members] = await Promise.all([
      this.prisma.orgUnit.count({ where: { parentId: id } }),
      this.prisma.membership.count({ where: { orgUnitId: id } }),
    ]);
    return { units, members };
  }
}
