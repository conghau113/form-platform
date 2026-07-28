-- AlterTable
ALTER TABLE "Project" ADD COLUMN "orgUnitId" TEXT;

-- CreateTable
CREATE TABLE "DataScope" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,

    CONSTRAINT "DataScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataScope_roleId_idx" ON "DataScope"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "DataScope_roleId_orgUnitId_key" ON "DataScope"("roleId", "orgUnitId");

-- CreateIndex
CREATE INDEX "Project_orgUnitId_idx" ON "Project"("orgUnitId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataScope" ADD CONSTRAINT "DataScope_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataScope" ADD CONSTRAINT "DataScope_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
