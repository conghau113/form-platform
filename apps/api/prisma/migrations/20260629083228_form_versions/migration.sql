-- AlterTable
ALTER TABLE "FormRecord" ADD COLUMN "activeVersion" INTEGER;
ALTER TABLE "FormRecord" ADD COLUMN "publishedAt" DATETIME;

-- CreateTable
CREATE TABLE "FormVersionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormVersionRecord_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormVersionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FormVersionRecord_formId_idx" ON "FormVersionRecord"("formId");

-- CreateIndex
CREATE INDEX "FormVersionRecord_projectId_idx" ON "FormVersionRecord"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FormVersionRecord_formId_version_key" ON "FormVersionRecord"("formId", "version");
