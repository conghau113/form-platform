import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  OrgUnitRecord,
  OrgUnitUpdateInput,
} from "../../persistence/repositories/org-unit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { OrgUnitRepo } from "../../persistence/repositories/org-unit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import { wouldCreateCycle } from "../folders/folder-tree.js";
import type { CreateOrgUnitDto } from "./dto/create-org-unit.dto.js";
import type { UpdateOrgUnitDto } from "./dto/update-org-unit.dto.js";

/**
 * Org-unit CRUD (product-roadmap Phase B2). Every operation is scoped to the caller's tenant, resolved
 * from the authenticated user's {@link TenantRepo.findTenantIdForUser membership}: a unit is created in
 * the caller's tenant, and reads/mutations of a unit whose `tenantId` differs return 404 (no existence
 * leak) — the first genuine cross-tenant enforcement. Moves are guarded against cycles
 * ({@link wouldCreateCycle}, reused from folders → 409); a non-empty unit (sub-units or members) can't
 * be deleted unless `?cascade=true` (Prisma cascades sub-units; members fall off via SetNull).
 */
@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly units: OrgUnitRepo,
    private readonly tenants: TenantRepo,
  ) {}

  async list(userId: string): Promise<OrgUnitRecord[]> {
    return this.units.list(await this.requireTenant(userId));
  }

  async create(userId: string, dto: CreateOrgUnitDto): Promise<OrgUnitRecord> {
    if (!dto.name?.trim()) throw new BadRequestException("Org unit name is required");
    const tenantId = await this.requireTenant(userId);
    if (dto.parentId) await this.requireParentInTenant(dto.parentId, tenantId);
    return this.units.create({
      tenantId,
      parentId: dto.parentId ?? null,
      name: dto.name.trim(),
      kind: dto.kind?.trim() || null,
    });
  }

  async update(userId: string, id: string, dto: UpdateOrgUnitDto): Promise<OrgUnitRecord> {
    const unit = await this.requireOwned(userId, id);

    const patch: OrgUnitUpdateInput = {
      name: dto.name?.trim(),
      // Normalize like create (trim, empty → null) but keep `undefined` so a rename doesn't wipe kind.
      kind: dto.kind === undefined ? undefined : dto.kind?.trim() || null,
      order: dto.order,
    };
    // A move (parentId present in the payload, including explicit null → root).
    if ("parentId" in dto) {
      const parentId = dto.parentId ?? null;
      if (parentId) await this.requireParentInTenant(parentId, unit.tenantId);
      const siblings = await this.units.list(unit.tenantId);
      if (wouldCreateCycle(siblings, id, parentId)) {
        throw new ConflictException("Move would create an org-unit cycle");
      }
      patch.parentId = parentId;
    }
    return this.units.update(id, patch);
  }

  async remove(userId: string, id: string, cascade: boolean): Promise<void> {
    await this.requireOwned(userId, id);
    if (!cascade) {
      const { units, members } = await this.units.countChildren(id);
      if (units > 0 || members > 0) {
        throw new ConflictException(
          `Org unit is not empty (${units} sub-unit(s), ${members} member(s)); pass ?cascade=true to delete it.`,
        );
      }
    }
    await this.units.delete(id);
  }

  /** The caller's tenant (B1 guarantees every logged-in user has one); absent → 404 (defensive). */
  private async requireTenant(userId: string): Promise<string> {
    const tenantId = await this.tenants.findTenantIdForUser(userId);
    if (!tenantId) throw new NotFoundException("No tenant for user");
    return tenantId;
  }

  /** Load a unit and assert it lives in the caller's tenant (404 otherwise — no existence leak). */
  private async requireOwned(userId: string, id: string): Promise<OrgUnitRecord> {
    const tenantId = await this.requireTenant(userId);
    const unit = await this.units.findById(id);
    if (!unit || unit.tenantId !== tenantId)
      throw new NotFoundException(`Org unit not found: ${id}`);
    return unit;
  }

  /** A parent unit must exist and live in the same tenant as its child. */
  private async requireParentInTenant(parentId: string, tenantId: string): Promise<void> {
    const parent = await this.units.findById(parentId);
    if (!parent || parent.tenantId !== tenantId) {
      throw new BadRequestException(`Parent org unit not in tenant: ${parentId}`);
    }
  }
}
