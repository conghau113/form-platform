import { Injectable } from "@nestjs/common";
import {
  type ExternalApiKeyRecord,
  ExternalIntegrationRepo,
  type ExternalTicketTypeMapRecord,
} from "../repositories/external-integration.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaExternalIntegrationRepo extends ExternalIntegrationRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findActiveKeyByHash(tokenHash: string): Promise<ExternalApiKeyRecord | null> {
    // `revokedAt: null` belongs in the WHERE, not in a caller-side check: a revoked key must be
    // indistinguishable from a nonexistent one all the way down.
    const row = await this.prisma.externalApiKey.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { id: true, tenantId: true, label: true, revokedAt: true },
    });
    return row;
  }

  async findTicketTypeMaps(
    tenantId: string,
    ticketTypeCode: string,
    externalFormCode?: string,
  ): Promise<ExternalTicketTypeMapRecord[]> {
    return this.prisma.externalTicketTypeMap.findMany({
      // Spelled out rather than passing `externalFormCode` straight through: Prisma drops an
      // `undefined` filter, so the "narrow to one template" and "list every template" cases would
      // read identically at the call site.
      where: {
        tenantId,
        ticketTypeCode,
        ...(externalFormCode === undefined ? {} : { externalFormCode }),
      },
      select: {
        id: true,
        tenantId: true,
        ticketTypeCode: true,
        ticketTypeName: true,
        formId: true,
        externalFormCode: true,
        workflowId: true,
      },
    });
  }
}
