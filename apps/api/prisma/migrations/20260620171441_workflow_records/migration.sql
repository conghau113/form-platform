-- CreateTable
CREATE TABLE "WorkflowRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "body" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRecord_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WorkflowRecord_projectId_folderId_idx" ON "WorkflowRecord"("projectId", "folderId");
