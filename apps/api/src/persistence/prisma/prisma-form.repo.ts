import { Injectable } from "@nestjs/common";
import type { FormSchema } from "@org/form-schema";
import type { FormRecord, Prisma } from "@prisma/client";
import {
  type FormListQuery,
  FormRepo,
  type FormSummary,
  type FormUpsertMeta,
} from "../repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Columns that make up a {@link FormSummary} — selected to avoid loading the (large) body. */
const summarySelect = {
  id: true,
  projectId: true,
  folderId: true,
  title: true,
  status: true,
  updatedAt: true,
} as const;

type SummaryRow = Pick<FormRecord, keyof typeof summarySelect>;

function toSummary(r: SummaryRow): FormSummary {
  return {
    id: r.id,
    projectId: r.projectId,
    folderId: r.folderId,
    title: r.title,
    status: r.status,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class PrismaFormRepo extends FormRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(form: FormSchema, meta: FormUpsertMeta): Promise<FormSchema> {
    const data = {
      projectId: meta.projectId,
      folderId: meta.folderId ?? null,
      title: form.title,
      body: form as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.formRecord.upsert({
      where: { id: form.id },
      update: data,
      create: { id: form.id, ...data },
    });
    return form;
  }

  async load(id: string): Promise<FormSchema | null> {
    const record = await this.prisma.formRecord.findUnique({ where: { id } });
    return record ? (record.body as unknown as FormSchema) : null;
  }

  async findSummary(id: string): Promise<FormSummary | null> {
    const row = await this.prisma.formRecord.findUnique({ where: { id }, select: summarySelect });
    return row ? toSummary(row) : null;
  }

  async listSummaries(query: FormListQuery): Promise<FormSummary[]> {
    const rows = await this.prisma.formRecord.findMany({
      where: {
        projectId: query.projectId,
        // `undefined` → all forms in the project; `null` → project-root forms only.
        ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
      },
      select: summarySelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toSummary);
  }

  async move(id: string, folderId: string | null): Promise<FormSummary | null> {
    const row = await this.prisma.formRecord.update({
      where: { id },
      data: { folderId },
      select: summarySelect,
    });
    return toSummary(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.formRecord.deleteMany({ where: { id } });
  }
}
