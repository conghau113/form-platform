import { Injectable } from "@nestjs/common";
import type { FormSchema, FormVersion } from "@org/form-schema";
import type { FormVersionRecord, Prisma } from "@prisma/client";
import {
  FormVersionRepo,
  type FormVersionSummary,
  type PublishInput,
} from "../repositories/form-version.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Columns that make up a {@link FormVersionSummary} — selected to avoid loading the body. */
const summarySelect = {
  id: true,
  formId: true,
  projectId: true,
  version: true,
  formVersion: true,
  publishedBy: true,
  publishedAt: true,
} as const;

type SummaryRow = Pick<FormVersionRecord, keyof typeof summarySelect>;

/** Map a stored row to the `FormVersion` contract (the `body` Json IS a frozen `FormSchema`). */
function toVersion(r: FormVersionRecord): FormVersion {
  return {
    id: r.id,
    formId: r.formId,
    version: r.version,
    formVersion: r.formVersion,
    body: r.body as unknown as FormSchema,
    publishedBy: r.publishedBy,
    publishedAt: r.publishedAt.toISOString(),
  };
}

function toSummary(r: SummaryRow): FormVersionSummary {
  return {
    id: r.id,
    formId: r.formId,
    projectId: r.projectId,
    version: r.version,
    formVersion: r.formVersion,
    publishedBy: r.publishedBy,
    publishedAt: r.publishedAt,
  };
}

@Injectable()
export class PrismaFormVersionRepo extends FormVersionRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async publish(input: PublishInput): Promise<FormVersion> {
    const record = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.formVersionRecord.findFirst({
        where: { formId: input.formId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      const created = await tx.formVersionRecord.create({
        data: {
          id: input.id,
          formId: input.formId,
          projectId: input.projectId,
          version,
          formVersion: input.body.formVersion,
          publishedBy: input.publishedBy,
          publishedAt: input.publishedAt,
          body: input.body as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.formRecord.update({
        where: { id: input.formId },
        data: { activeVersion: version, publishedAt: input.publishedAt },
      });
      return created;
    });
    return toVersion(record);
  }

  async loadActive(formId: string): Promise<FormVersion | null> {
    const form = await this.prisma.formRecord.findUnique({
      where: { id: formId },
      select: { activeVersion: true },
    });
    if (form?.activeVersion == null) return null;
    return this.load(formId, form.activeVersion);
  }

  async load(formId: string, version: number): Promise<FormVersion | null> {
    const record = await this.prisma.formVersionRecord.findUnique({
      where: { formId_version: { formId, version } },
    });
    return record ? toVersion(record) : null;
  }

  async listByForm(formId: string): Promise<FormVersionSummary[]> {
    const rows = await this.prisma.formVersionRecord.findMany({
      where: { formId },
      select: summarySelect,
      orderBy: { version: "desc" },
    });
    return rows.map(toSummary);
  }
}
