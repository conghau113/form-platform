-- CreateTable
CREATE TABLE "SubmissionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionRecord_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubmissionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SubmissionRecord_formId_idx" ON "SubmissionRecord"("formId");

-- CreateIndex
CREATE INDEX "SubmissionRecord_projectId_idx" ON "SubmissionRecord"("projectId");
