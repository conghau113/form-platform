-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "body" JSONB NOT NULL,
    "activeVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormVersionRecord" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionRecord" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "body" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstanceRecord" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "current" TEXT NOT NULL,
    "label" TEXT,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preset" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "icon" TEXT,
    "patch" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusCatalogEntry" (
    "code" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusCatalogEntry_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Theme" (
    "formId" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("formId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_slug_key" ON "Project"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Folder_projectId_parentId_idx" ON "Folder"("projectId", "parentId");

-- CreateIndex
CREATE INDEX "FormRecord_projectId_folderId_idx" ON "FormRecord"("projectId", "folderId");

-- CreateIndex
CREATE INDEX "FormVersionRecord_formId_idx" ON "FormVersionRecord"("formId");

-- CreateIndex
CREATE INDEX "FormVersionRecord_projectId_idx" ON "FormVersionRecord"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FormVersionRecord_formId_version_key" ON "FormVersionRecord"("formId", "version");

-- CreateIndex
CREATE INDEX "SubmissionRecord_formId_idx" ON "SubmissionRecord"("formId");

-- CreateIndex
CREATE INDEX "SubmissionRecord_projectId_idx" ON "SubmissionRecord"("projectId");

-- CreateIndex
CREATE INDEX "WorkflowRecord_projectId_folderId_idx" ON "WorkflowRecord"("projectId", "folderId");

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_workflowId_idx" ON "WorkflowInstanceRecord"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowInstanceRecord_projectId_idx" ON "WorkflowInstanceRecord"("projectId");

-- CreateIndex
CREATE INDEX "Preset_scope_projectId_idx" ON "Preset"("scope", "projectId");

-- CreateIndex
CREATE INDEX "StatusCatalogEntry_scope_projectId_idx" ON "StatusCatalogEntry"("scope", "projectId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRecord" ADD CONSTRAINT "FormRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRecord" ADD CONSTRAINT "FormRecord_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersionRecord" ADD CONSTRAINT "FormVersionRecord_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersionRecord" ADD CONSTRAINT "FormVersionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRecord" ADD CONSTRAINT "SubmissionRecord_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRecord" ADD CONSTRAINT "SubmissionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRecord" ADD CONSTRAINT "WorkflowRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRecord" ADD CONSTRAINT "WorkflowRecord_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstanceRecord" ADD CONSTRAINT "WorkflowInstanceRecord_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstanceRecord" ADD CONSTRAINT "WorkflowInstanceRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preset" ADD CONSTRAINT "Preset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusCatalogEntry" ADD CONSTRAINT "StatusCatalogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
