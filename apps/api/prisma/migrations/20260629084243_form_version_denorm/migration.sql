/*
  Warnings:

  - Added the required column `formVersion` to the `FormVersionRecord` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FormVersionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormVersionRecord_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormVersionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FormVersionRecord" ("body", "formId", "id", "projectId", "publishedAt", "publishedBy", "version") SELECT "body", "formId", "id", "projectId", "publishedAt", "publishedBy", "version" FROM "FormVersionRecord";
DROP TABLE "FormVersionRecord";
ALTER TABLE "new_FormVersionRecord" RENAME TO "FormVersionRecord";
CREATE INDEX "FormVersionRecord_formId_idx" ON "FormVersionRecord"("formId");
CREATE INDEX "FormVersionRecord_projectId_idx" ON "FormVersionRecord"("projectId");
CREATE UNIQUE INDEX "FormVersionRecord_formId_version_key" ON "FormVersionRecord"("formId", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
