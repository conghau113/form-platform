-- Phase E3a: the "cast" of a running case — who plays which domain role on it.
--
-- Purely additive: one new table, no column added to an existing one and no backfill. Cases that
-- already exist simply start with an empty cast; `start()` writes a `creator` row from now on.

-- CreateTable
CREATE TABLE "WorkflowInstanceParticipant" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowInstanceParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInstanceParticipant_instanceId_roleCode_userId_key" ON "WorkflowInstanceParticipant"("instanceId", "roleCode", "userId");

-- CreateIndex
CREATE INDEX "WorkflowInstanceParticipant_instanceId_idx" ON "WorkflowInstanceParticipant"("instanceId");

-- CreateIndex
CREATE INDEX "WorkflowInstanceParticipant_userId_idx" ON "WorkflowInstanceParticipant"("userId");

-- AddForeignKey
ALTER TABLE "WorkflowInstanceParticipant" ADD CONSTRAINT "WorkflowInstanceParticipant_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstanceParticipant" ADD CONSTRAINT "WorkflowInstanceParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
