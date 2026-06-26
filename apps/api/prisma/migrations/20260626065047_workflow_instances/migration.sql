-- CreateTable
CREATE TABLE "WorkflowInstanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "current" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowInstanceRecord_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowInstanceRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_workflowId_idx" ON "WorkflowInstanceRecord"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_projectId_idx" ON "WorkflowInstanceRecord"("projectId");
