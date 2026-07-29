-- Phase E (work-order): who is responsible for a case + a denormalized, human-readable state.
-- Purely additive; every column is nullable and no backfill is required — existing cases stay
-- unassigned and pick up statusLabel/statusKind on their next write.

-- AlterTable
ALTER TABLE "WorkflowInstanceRecord" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "WorkflowInstanceRecord" ADD COLUMN "statusLabel" TEXT;
ALTER TABLE "WorkflowInstanceRecord" ADD COLUMN "statusKind" TEXT;

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_assigneeId_idx" ON "WorkflowInstanceRecord"("assigneeId");

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_projectId_updatedAt_idx" ON "WorkflowInstanceRecord"("projectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "WorkflowInstanceRecord" ADD CONSTRAINT "WorkflowInstanceRecord_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
