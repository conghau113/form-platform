import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { type AuditEntry, AuditRepo } from "../repositories/audit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaAuditRepo extends AuditRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        detail: entry.detail === undefined ? undefined : (entry.detail as Prisma.InputJsonValue),
      },
    });
  }
}
