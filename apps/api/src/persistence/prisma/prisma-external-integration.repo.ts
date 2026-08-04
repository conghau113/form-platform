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

  async findTicketTypeMap(
    tenantId: string,
    ticketTypeCode: string,
  ): Promise<ExternalTicketTypeMapRecord | null> {
    const row = await this.prisma.externalTicketTypeMap.findUnique({
      where: { tenantId_ticketTypeCode: { tenantId, ticketTypeCode } },
      select: {
        id: true,
        tenantId: true,
        ticketTypeCode: true,
        formId: true,
        externalFormCode: true,
        workflowId: true,
      },
    });
    return row;
  }
}
