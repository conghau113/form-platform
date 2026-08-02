import { Injectable } from "@nestjs/common";
import {
  type CaseParticipantRecord,
  CaseParticipantRepo,
} from "../repositories/case-participant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaCaseParticipantRepo extends CaseParticipantRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: {
    instanceId: string;
    roleCode: string;
    userId: string;
    addedBy: string;
  }): Promise<CaseParticipantRecord | null> {
    try {
      // `id` comes from the column's `@default(cuid())`; the row is returned so the service can
      // audit and echo back what it created.
      return await this.prisma.workflowInstanceParticipant.create({ data: input });
    } catch (err) {
      // P2002 = unique violation on (instanceId, roleCode, userId), i.e. already cast. Anything
      // else is a real failure — the same duck-typed check `PrismaWorkflowInstanceRepo.create` uses.
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
        return null;
      }
      throw err;
    }
  }

  listByInstance(instanceId: string): Promise<CaseParticipantRecord[]> {
    return this.prisma.workflowInstanceParticipant.findMany({
      where: { instanceId },
      orderBy: { createdAt: "asc" },
    });
  }

  async listRoleCodes(instanceId: string, userId: string): Promise<string[]> {
    const rows = await this.prisma.workflowInstanceParticipant.findMany({
      where: { instanceId, userId },
      select: { roleCode: true },
    });
    return rows.map((r) => r.roleCode);
  }

  findById(id: string): Promise<CaseParticipantRecord | null> {
    return this.prisma.workflowInstanceParticipant.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workflowInstanceParticipant.deleteMany({ where: { id } });
  }
}
