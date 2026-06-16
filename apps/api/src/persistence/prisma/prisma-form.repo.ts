import { Injectable } from "@nestjs/common";
import type { FormSchema } from "@org/form-schema";
import type { Prisma } from "@prisma/client";
import { FormRepo, type FormUpsertMeta } from "../repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

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
}
