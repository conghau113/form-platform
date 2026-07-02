-- B4: slugs are unique per TENANT (many owners may write into one team tenant), not per owner.
-- Safe on existing data: every project so far was created into its owner's personal tenant
-- (tenant 1:1 owner), so (tenantId, slug) is already distinct; this CREATE fails loudly otherwise.

-- DropIndex
DROP INDEX "Project_ownerId_slug_key";

-- DropIndex (superseded by the tenantId-prefixed unique below)
DROP INDEX "Project_tenantId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_slug_key" ON "Project"("tenantId", "slug");

-- CreateIndex (ProjectRepo.list still queries by owner)
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
