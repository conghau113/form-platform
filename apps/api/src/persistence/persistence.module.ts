import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";
import { PrismaFolderRepo } from "./prisma/prisma-folder.repo.js";
import { PrismaFormRepo } from "./prisma/prisma-form.repo.js";
import { PrismaFormVersionRepo } from "./prisma/prisma-form-version.repo.js";
import { PrismaPresetRepo } from "./prisma/prisma-preset.repo.js";
import { PrismaProjectRepo } from "./prisma/prisma-project.repo.js";
import { PrismaProjectMemberRepo } from "./prisma/prisma-project-member.repo.js";
import { PrismaStatusCatalogRepo } from "./prisma/prisma-status-catalog.repo.js";
import { PrismaSubmissionRepo } from "./prisma/prisma-submission.repo.js";
import { PrismaThemeRepo } from "./prisma/prisma-theme.repo.js";
import { PrismaWorkflowRepo } from "./prisma/prisma-workflow.repo.js";
import { PrismaWorkflowInstanceRepo } from "./prisma/prisma-workflow-instance.repo.js";
import { FolderRepo } from "./repositories/folder.repo.js";
import { FormRepo } from "./repositories/form.repo.js";
import { FormVersionRepo } from "./repositories/form-version.repo.js";
import { PresetRepo } from "./repositories/preset.repo.js";
import { ProjectRepo } from "./repositories/project.repo.js";
import { ProjectMemberRepo } from "./repositories/project-member.repo.js";
import { StatusCatalogRepo } from "./repositories/status-catalog.repo.js";
import { SubmissionRepo } from "./repositories/submission.repo.js";
import { ThemeRepo } from "./repositories/theme.repo.js";
import { WorkflowRepo } from "./repositories/workflow.repo.js";
import { WorkflowInstanceRepo } from "./repositories/workflow-instance.repo.js";

/**
 * Global persistence layer (D4). Binds each repo interface (abstract-class DI token) to its
 * Prisma implementation; feature services inject the interface and never see Prisma. Marked
 * `@Global` so any feature module can inject a repo without re-importing this module.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: FormRepo, useClass: PrismaFormRepo },
    { provide: FormVersionRepo, useClass: PrismaFormVersionRepo },
    { provide: WorkflowRepo, useClass: PrismaWorkflowRepo },
    { provide: WorkflowInstanceRepo, useClass: PrismaWorkflowInstanceRepo },
    { provide: PresetRepo, useClass: PrismaPresetRepo },
    { provide: ThemeRepo, useClass: PrismaThemeRepo },
    { provide: ProjectRepo, useClass: PrismaProjectRepo },
    { provide: FolderRepo, useClass: PrismaFolderRepo },
    { provide: ProjectMemberRepo, useClass: PrismaProjectMemberRepo },
    { provide: StatusCatalogRepo, useClass: PrismaStatusCatalogRepo },
    { provide: SubmissionRepo, useClass: PrismaSubmissionRepo },
  ],
  exports: [
    PrismaService,
    FormRepo,
    FormVersionRepo,
    WorkflowRepo,
    WorkflowInstanceRepo,
    PresetRepo,
    ThemeRepo,
    ProjectRepo,
    FolderRepo,
    ProjectMemberRepo,
    StatusCatalogRepo,
    SubmissionRepo,
  ],
})
export class PersistenceModule {}
