import { Injectable, NotFoundException } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
import type { CaseCommentRecord } from "../../persistence/repositories/case-comment.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { CaseCommentRepo } from "../../persistence/repositories/case-comment.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { UserRepo } from "../../persistence/repositories/user.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowInstancesService } from "./workflow-instances.service.js";

/**
 * Comments on a running case (product-roadmap Phase E2) — the "what's going on with this one"
 * thread beside the machine-generated history.
 *
 * Two different boundaries on purpose (owner's call): READING is project `viewer`, the same as
 * loading the case, because anyone who can see the case can see the discussion about it. WRITING
 * needs run access — commenting is participating in the work, so it sits with advancing and
 * assigning rather than with reading. Both decisions are delegated to
 * {@link WorkflowInstancesService}, which owns the access rules for a case; this service never
 * re-derives them.
 */
@Injectable()
export class CaseCommentsService {
  constructor(
    private readonly comments: CaseCommentRepo,
    private readonly instancesService: WorkflowInstancesService,
    private readonly projectsService: ProjectsService,
    private readonly users: UserRepo,
    private readonly audit: AuditRepo,
  ) {}

  /** The case's thread, oldest first (read ⇒ requires `viewer`). */
  async list(ownerId: string, instanceId: string): Promise<CaseCommentRecord[]> {
    await this.instancesService.requireInstanceAccess(ownerId, instanceId, "viewer");
    return this.comments.listByInstance(instanceId);
  }

  /** Append a comment (requires run access). */
  async add(ownerId: string, instanceId: string, body: string): Promise<CaseCommentRecord> {
    const summary = await this.instancesService.requireInstanceRunAccess(ownerId, instanceId);
    // A second call, exactly as `assign` does it: the instance summary carries no tenantId, and an
    // audit entry cannot be written without one.
    const project = await this.projectsService.requireRunAccess(ownerId, summary.projectId);

    const author = await this.users.findById(ownerId);
    if (!author) throw new NotFoundException(`User not found: ${ownerId}`);

    const comment = await this.comments.create({
      instanceId,
      authorId: ownerId,
      // Snapshotted here rather than joined at read time — see the model's doc-comment.
      authorName: author.displayName ?? author.email,
      body,
    });
    await this.audit.record({
      tenantId: project.tenantId,
      actorId: ownerId,
      action: "case.comment",
      targetType: "workflow-instance",
      targetId: instanceId,
      // The comment TEXT stays out of the audit trail: the audit `detail` already carries a PII debt
      // (known-gap D1) and a free-text note is the last thing that should be duplicated into it.
      detail: { commentId: comment.id },
    });
    return comment;
  }
}
