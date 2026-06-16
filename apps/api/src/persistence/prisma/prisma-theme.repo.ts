import { Injectable } from "@nestjs/common";
import type { DesignTokens } from "@org/form-theme";
import type { Prisma } from "@prisma/client";
import { ThemeRepo } from "../repositories/theme.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaThemeRepo extends ThemeRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(formId: string): Promise<DesignTokens | null> {
    const row = await this.prisma.theme.findUnique({ where: { formId } });
    return row ? (row.tokens as unknown as DesignTokens) : null;
  }

  async upsert(formId: string, tokens: DesignTokens): Promise<DesignTokens> {
    const value = tokens as unknown as Prisma.InputJsonValue;
    await this.prisma.theme.upsert({
      where: { formId },
      update: { tokens: value },
      create: { formId, tokens: value },
    });
    return tokens;
  }
}
