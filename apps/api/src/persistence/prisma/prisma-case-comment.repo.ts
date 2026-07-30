import { Injectable } from "@nestjs/common";
import { type CaseCommentRecord, CaseCommentRepo } from "../repositories/case-comment.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaCaseCommentRepo extends CaseCommentRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  create(input: {
    instanceId: string;
    authorId: string;
    authorName: string;
    body: string;
  }): Promise<CaseCommentRecord> {
    // `id` comes from the column's `@default(cuid())` — the row is returned so the service can audit
    // which comment it created.
    return this.prisma.workflowInstanceComment.create({ data: input });
  }

  listByInstance(instanceId: string): Promise<CaseCommentRecord[]> {
    return this.prisma.workflowInstanceComment.findMany({
      where: { instanceId },
      orderBy: { createdAt: "asc" },
    });
  }
}
