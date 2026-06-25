-- CreateTable
CREATE TABLE "StatusCatalogEntry" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StatusCatalogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StatusCatalogEntry_scope_projectId_idx" ON "StatusCatalogEntry"("scope", "projectId");
