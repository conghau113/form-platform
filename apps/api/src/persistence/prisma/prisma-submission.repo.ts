import { Injectable } from "@nestjs/common";
import type { Submission } from "@org/form-schema";
import type { Prisma, SubmissionRecord } from "@prisma/client";
import {
  type SubmissionMeta,
  SubmissionRepo,
  type SubmissionSummary,
} from "../repositories/submission.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Columns that make up a {@link SubmissionSummary} — selected to avoid loading the body. */
const summarySelect = {
  id: true,
  formId: true,
  projectId: true,
  submittedBy: true,
  submittedAt: true,
} as const;

type SummaryRow = Pick<SubmissionRecord, keyof typeof summarySelect>;

function toSummary(r: SummaryRow): SubmissionSummary {
  return {
    id: r.id,
    formId: r.formId,
    projectId: r.projectId,
    submittedBy: r.submittedBy,
    submittedAt: r.submittedAt,
  };
}

@Injectable()
export class PrismaSubmissionRepo extends SubmissionRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(submission: Submission, meta: SubmissionMeta): Promise<Submission> {
    await this.prisma.submissionRecord.create({
      data: {
        id: submission.id,
        formId: meta.formId,
        projectId: meta.projectId,
        submittedBy: submission.submittedBy,
        submittedAt: new Date(submission.submittedAt),
        body: submission as unknown as Prisma.InputJsonValue,
      },
    });
    return submission;
  }

  async load(id: string): Promise<Submission | null> {
    const record = await this.prisma.submissionRecord.findUnique({ where: { id } });
    return record ? (record.body as unknown as Submission) : null;
  }

  async findSummary(id: string): Promise<SubmissionSummary | null> {
    const row = await this.prisma.submissionRecord.findUnique({
      where: { id },
      select: summarySelect,
    });
    return row ? toSummary(row) : null;
  }

  async listByForm(formId: string): Promise<SubmissionSummary[]> {
    const rows = await this.prisma.submissionRecord.findMany({
      where: { formId },
      select: summarySelect,
      orderBy: { submittedAt: "desc" },
    });
    return rows.map(toSummary);
  }
}
