-- Product-roadmap Phase B1: introduce Tenant + Membership and stamp every Project with a tenant.
-- Backfill strategy = personal-tenant-per-user: each distinct existing owner (∪ every user) gets its
-- own tenant, preserving today's isolation exactly. `ownerId` is kept as the canonical creator.

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'personal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add tenantId nullable first so the backfill can populate it before NOT NULL/FK apply.
ALTER TABLE "Project" ADD COLUMN "tenantId" TEXT;

-- Backfill: one personal tenant per distinct Project.ownerId ∪ every User.id. Deterministic ids
-- ('tnt_'||owner) let the follow-up joins/updates run without generated ids; slug mirrors the
-- runtime `personal-<userId>` so a backfilled user is never re-provisioned (they short-circuit on
-- their existing membership).
INSERT INTO "Tenant" ("id", "name", "slug", "kind", "createdAt", "updatedAt")
SELECT 'tnt_' || s.oid,
       COALESCE(u."displayName", u."email", s.oid),
       'personal-' || s.oid,
       'personal',
       now(),
       now()
FROM (
    SELECT "ownerId" AS oid FROM "Project"
    UNION
    SELECT "id" AS oid FROM "User"
) s
LEFT JOIN "User" u ON u."id" = s.oid;

-- Membership for every real user (owners with no matching User row hold legacy data reachable once a
-- user with access exists — the bootstrap admin id='local' covers pre-2A 'local' data).
INSERT INTO "Membership" ("id", "userId", "tenantId", "createdAt")
SELECT 'mem_' || u."id", u."id", 'tnt_' || u."id", now()
FROM "User" u;

-- Point every existing project at its owner's personal tenant.
UPDATE "Project" SET "tenantId" = 'tnt_' || "ownerId";

-- Now enforce NOT NULL + index + FK.
ALTER TABLE "Project" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
