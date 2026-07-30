-- Phase E2 (work-order, take 2): a deadline + an urgency on every case, and a comment thread per case.
--
-- Additive and safe on existing rows: `dueAt` is nullable (no deadline) and `priority` carries a
-- DEFAULT, so the ALTER backfills every existing case to "normal" without a separate UPDATE.

-- AlterTable
ALTER TABLE "WorkflowInstanceRecord" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "WorkflowInstanceRecord" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 2;

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_projectId_dueAt_idx" ON "WorkflowInstanceRecord"("projectId", "dueAt");

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_projectId_priority_idx" ON "WorkflowInstanceRecord"("projectId", "priority");

-- CreateTable
CREATE TABLE "WorkflowInstanceComment" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowInstanceComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowInstanceComment_instanceId_createdAt_idx" ON "WorkflowInstanceComment"("instanceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowInstanceComment" ADD CONSTRAINT "WorkflowInstanceComment_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
