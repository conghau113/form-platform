import { Injectable } from "@nestjs/common";
import { TenantRepo } from "../repositories/tenant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaTenantRepo extends TenantRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ensureTenantForOwner(ownerId: string, name?: string): Promise<string> {
    // Upsert by the stable per-owner slug so the auth path (membership) and the project-write path
    // converge on one tenant, and the B1 backfill's `tnt_<owner>` row (slug `personal-<owner>`) is
    // reused rather than duplicated. No membership here — the owner need not be a real User.
    const tenant = await this.prisma.tenant.upsert({
      where: { slug: `personal-${ownerId}` },
      update: {},
      create: { name: name ?? ownerId, slug: `personal-${ownerId}`, kind: "personal" },
    });
    return tenant.id;
  }

  async findTenantIdForUser(userId: string): Promise<string | null> {
    const membership = await this.prisma.membership.findFirst({ where: { userId } });
    return membership?.tenantId ?? null;
  }

  async ensurePersonalTenant(userId: string, name?: string): Promise<string> {
    const tenantId = await this.ensureTenantForOwner(userId, name);
    await this.prisma.membership.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      update: {},
      create: { userId, tenantId },
    });
    return tenantId;
  }
}
