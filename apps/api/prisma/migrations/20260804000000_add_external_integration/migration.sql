-- EVN §12 integration, step D0-a: the machine-to-machine credential + the ticket-type binding.
--
-- Purely additive: two new tables, no column added to an existing one, no backfill. Unlike P5's
-- `sessionId` this migration is backward compatible in both directions — an older build simply
-- never reads these tables, so migrate and deploy do not have to ship together.
--
-- `ExternalApiKey.tokenHash` is UNIQUE because authentication *is* the lookup: we hash the
-- presented key and select on the digest. That mirrors "RefreshToken"."tokenHash" exactly.
--
-- `ExternalTicketTypeMap` is UNIQUE on (tenantId, ticketTypeCode) so a caller's "PCT" resolves to
-- exactly one form. Without it two seeded rows would make resolution depend on row order.
-- Both tables cascade from Tenant: deleting a tenant must not leave a live credential behind.

-- CreateTable
CREATE TABLE "ExternalApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTicketTypeMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketTypeCode" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "externalFormCode" TEXT NOT NULL,
    "workflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTicketTypeMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalApiKey_tokenHash_key" ON "ExternalApiKey"("tokenHash");

-- CreateIndex
CREATE INDEX "ExternalApiKey_tenantId_idx" ON "ExternalApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "ExternalTicketTypeMap_tenantId_idx" ON "ExternalTicketTypeMap"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTicketTypeMap_tenantId_ticketTypeCode_key" ON "ExternalTicketTypeMap"("tenantId", "ticketTypeCode");

-- AddForeignKey
ALTER TABLE "ExternalApiKey" ADD CONSTRAINT "ExternalApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTicketTypeMap" ADD CONSTRAINT "ExternalTicketTypeMap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
