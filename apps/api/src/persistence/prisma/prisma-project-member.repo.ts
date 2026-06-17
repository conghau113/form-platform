import { Injectable } from "@nestjs/common";
import type { ProjectMember } from "@prisma/client";
import {
  type MemberRole,
  type ProjectMemberRecord,
  ProjectMemberRepo,
} from "../repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

function toRecord(m: ProjectMember): ProjectMemberRecord {
  return {
    projectId: m.projectId,
    userId: m.userId,
    role: m.role as MemberRole,
    createdAt: m.createdAt,
  };
}

@Injectable()
export class PrismaProjectMemberRepo extends ProjectMemberRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByProject(projectId: string): Promise<ProjectMemberRecord[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  }

  async listProjectIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  async find(projectId: string, userId: string): Promise<ProjectMemberRecord | null> {
    const row = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return row ? toRecord(row) : null;
  }

  async upsert(input: {
    projectId: string;
    userId: string;
    role: MemberRole;
  }): Promise<ProjectMemberRecord> {
    const row = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
      update: { role: input.role },
      create: { projectId: input.projectId, userId: input.userId, role: input.role },
    });
    return toRecord(row);
  }

  async remove(projectId: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.projectMember.deleteMany({
      where: { projectId, userId },
    });
    return count > 0;
  }
}
