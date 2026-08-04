import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";
import { PrismaAdminCatalogRepo } from "./prisma/prisma-admin-catalog.repo.js";
import { PrismaAuditRepo } from "./prisma/prisma-audit.repo.js";
import { PrismaCaseCommentRepo } from "./prisma/prisma-case-comment.repo.js";
import { PrismaCaseParticipantRepo } from "./prisma/prisma-case-participant.repo.js";
import { PrismaExternalIntegrationRepo } from "./prisma/prisma-external-integration.repo.js";
import { PrismaFolderRepo } from "./prisma/prisma-folder.repo.js";
import { PrismaFormRepo } from "./prisma/prisma-form.repo.js";
import { PrismaFormVersionRepo } from "./prisma/prisma-form-version.repo.js";
import { PrismaNotificationRepo } from "./prisma/prisma-notification.repo.js";
import { PrismaOrgUnitRepo } from "./prisma/prisma-org-unit.repo.js";
import { PrismaPresetRepo } from "./prisma/prisma-preset.repo.js";
import { PrismaProjectRepo } from "./prisma/prisma-project.repo.js";
import { PrismaProjectMemberRepo } from "./prisma/prisma-project-member.repo.js";
import { PrismaRbacRepo } from "./prisma/prisma-rbac.repo.js";
import { PrismaRefreshTokenRepo } from "./prisma/prisma-refresh-token.repo.js";
import { PrismaStatusCatalogRepo } from "./prisma/prisma-status-catalog.repo.js";
import { PrismaSubmissionRepo } from "./prisma/prisma-submission.repo.js";
import { PrismaTenantRepo } from "./prisma/prisma-tenant.repo.js";
import { PrismaThemeRepo } from "./prisma/prisma-theme.repo.js";
import { PrismaUserRepo } from "./prisma/prisma-user.repo.js";
import { PrismaVerificationTokenRepo } from "./prisma/prisma-verification-token.repo.js";
import { PrismaWorkflowRepo } from "./prisma/prisma-workflow.repo.js";
import { PrismaWorkflowInstanceRepo } from "./prisma/prisma-workflow-instance.repo.js";
import { AdminCatalogRepo } from "./repositories/admin-catalog.repo.js";
import { AuditRepo } from "./repositories/audit.repo.js";
import { CaseCommentRepo } from "./repositories/case-comment.repo.js";
import { CaseParticipantRepo } from "./repositories/case-participant.repo.js";
import { ExternalIntegrationRepo } from "./repositories/external-integration.repo.js";
import { FolderRepo } from "./repositories/folder.repo.js";
import { FormRepo } from "./repositories/form.repo.js";
import { FormVersionRepo } from "./repositories/form-version.repo.js";
import { NotificationRepo } from "./repositories/notification.repo.js";
import { OrgUnitRepo } from "./repositories/org-unit.repo.js";
import { PresetRepo } from "./repositories/preset.repo.js";
import { ProjectRepo } from "./repositories/project.repo.js";
import { ProjectMemberRepo } from "./repositories/project-member.repo.js";
import { RbacRepo } from "./repositories/rbac.repo.js";
import { RefreshTokenRepo } from "./repositories/refresh-token.repo.js";
import { StatusCatalogRepo } from "./repositories/status-catalog.repo.js";
import { SubmissionRepo } from "./repositories/submission.repo.js";
import { TenantRepo } from "./repositories/tenant.repo.js";
import { ThemeRepo } from "./repositories/theme.repo.js";
import { UserRepo } from "./repositories/user.repo.js";
import { VerificationTokenRepo } from "./repositories/verification-token.repo.js";
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
    { provide: UserRepo, useClass: PrismaUserRepo },
    { provide: RefreshTokenRepo, useClass: PrismaRefreshTokenRepo },
    { provide: VerificationTokenRepo, useClass: PrismaVerificationTokenRepo },
    { provide: TenantRepo, useClass: PrismaTenantRepo },
    { provide: OrgUnitRepo, useClass: PrismaOrgUnitRepo },
    { provide: RbacRepo, useClass: PrismaRbacRepo },
    { provide: AuditRepo, useClass: PrismaAuditRepo },
    { provide: AdminCatalogRepo, useClass: PrismaAdminCatalogRepo },
    { provide: CaseCommentRepo, useClass: PrismaCaseCommentRepo },
    { provide: CaseParticipantRepo, useClass: PrismaCaseParticipantRepo },
    { provide: NotificationRepo, useClass: PrismaNotificationRepo },
    { provide: ExternalIntegrationRepo, useClass: PrismaExternalIntegrationRepo },
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
    UserRepo,
    RefreshTokenRepo,
    VerificationTokenRepo,
    TenantRepo,
    OrgUnitRepo,
    RbacRepo,
    AuditRepo,
    AdminCatalogRepo,
    CaseCommentRepo,
    CaseParticipantRepo,
    NotificationRepo,
    ExternalIntegrationRepo,
  ],
})
export class PersistenceModule {}
