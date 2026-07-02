import { Injectable } from "@nestjs/common";
import { type TenantRecord, TenantRepo } from "../repositories/tenant.repo.js";
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
    // Oldest membership wins (deterministic): that is the personal tenant created at register, so a
    // user added to another tenant (D1 add-member) keeps resolving to their own context.
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return membership?.tenantId ?? null;
  }

  async listTenantIdsForUser(userId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { tenantId: true },
    });
    return memberships.map((m) => m.tenantId);
  }

  async listTenantsForUser(userId: string): Promise<TenantRecord[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { tenant: true },
    });
    return memberships.map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      kind: m.tenant.kind,
      createdAt: m.tenant.createdAt,
      updatedAt: m.tenant.updatedAt,
    }));
  }

  async isMember(userId: string, tenantId: string): Promise<boolean> {
    const row = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true },
    });
    return row !== null;
  }

  async addMember(tenantId: string, userId: string): Promise<void> {
    await this.prisma.membership.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      update: {},
      create: { userId, tenantId },
    });
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
