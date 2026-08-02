import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
import type { CaseParticipantRecord } from "../../persistence/repositories/case-participant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { CaseParticipantRepo } from "../../persistence/repositories/case-participant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import { isReservedRoleCode } from "../projects/actor-roles.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { CaseActorRolesService } from "./case-actor-roles.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowInstancesService } from "./workflow-instances.service.js";

/** What the cast endpoint returns: the whole cast plus the caller's own effective roles. */
export interface CaseCastView {
  participants: CaseParticipantRecord[];
  /** The roles the SERVER says the caller acts in — what the Run view shows as "Vai trò của bạn". */
  myRoles: string[];
}

/**
 * The cast of a running case (product-roadmap Phase E3a) — who plays which domain role on it.
 *
 * Boundaries mirror {@link CaseCommentsService}: READING is project `viewer` (anyone who can see the
 * case can see who is on it), CHANGING it needs run access, because casting someone is operating the
 * case. Both decisions are delegated to {@link WorkflowInstancesService}, which owns a case's access
 * rules; this service never re-derives them.
 *
 * ⚠️ Cast membership is what the engine's `transition.role` and a form's `viewRoles` now resolve
 * against, so adding a row GRANTS visibility. Two guards follow from that: a reserved code can never
 * be cast (it would mint a project-level role — see `RESERVED_ROLE_CODES`), and the target must
 * actually be able to open the project, not merely belong to the workspace.
 */
@Injectable()
export class CaseParticipantsService {
  constructor(
    private readonly participants: CaseParticipantRepo,
    private readonly instancesService: WorkflowInstancesService,
    private readonly projectsService: ProjectsService,
    private readonly caseActorRoles: CaseActorRolesService,
    private readonly tenants: TenantRepo,
    private readonly audit: AuditRepo,
  ) {}

  /** The case's cast + the caller's own roles (read ⇒ requires `viewer`). */
  async list(ownerId: string, instanceId: string): Promise<CaseCastView> {
    const summary = await this.instancesService.requireInstanceAccess(
      ownerId,
      instanceId,
      "viewer",
    );
    const [participants, myRoles] = await Promise.all([
      this.participants.listByInstance(instanceId),
      this.caseActorRoles.forCase(ownerId, summary),
    ]);
    return { participants, myRoles };
  }

  /** Cast a workspace member into a role on the case (requires run access). */
  async add(
    ownerId: string,
    instanceId: string,
    input: { roleCode: string; userId: string },
  ): Promise<CaseParticipantRecord> {
    const summary = await this.instancesService.requireInstanceRunAccess(ownerId, instanceId);
    // A second call, exactly as `assign` and `CaseCommentsService.add` do it: the instance summary
    // carries no tenantId, and an audit entry cannot be written without one.
    const project = await this.projectsService.requireRunAccess(ownerId, summary.projectId);

    const roleCode = input.roleCode.trim();
    if (isReservedRoleCode(roleCode)) {
      throw new BadRequestException(`Role code is reserved by the platform: ${roleCode}`);
    }
    if (!(await this.tenants.isMember(input.userId, project.tenantId))) {
      throw new BadRequestException(`User is not a member of this workspace: ${input.userId}`);
    }
    // Workspace membership alone is not enough: a role on the case is only meaningful to someone who
    // can open the project it lives in. Casting anyone else would create a participant who cannot
    // see their own case — and, once Phase E3b lands, one who receives notifications LABELLED with a
    // case they may not read.
    if (!(await this.projectsService.resolveRole(input.userId, summary.projectId))) {
      throw new BadRequestException(`User has no access to this project: ${input.userId}`);
    }

    const row = await this.participants.create({
      instanceId,
      roleCode,
      userId: input.userId,
      addedBy: ownerId,
    });
    if (!row) {
      throw new ConflictException(`Already cast in this role: ${input.userId} as ${roleCode}`);
    }
    await this.audit.record({
      tenantId: project.tenantId,
      actorId: ownerId,
      action: "case.participant.add",
      targetType: "workflow-instance",
      targetId: instanceId,
      detail: { participantId: row.id, roleCode, userId: input.userId },
    });
    return row;
  }

  /** Remove a cast row (requires run access). A row belonging to another case is a 404. */
  async remove(ownerId: string, instanceId: string, participantId: string): Promise<void> {
    const summary = await this.instancesService.requireInstanceRunAccess(ownerId, instanceId);
    const project = await this.projectsService.requireRunAccess(ownerId, summary.projectId);

    const row = await this.participants.findById(participantId);
    // Checked against THIS case, so a valid id from a case the caller cannot reach still 404s here
    // rather than being deleted through the wrong parent.
    if (!row || row.instanceId !== instanceId) {
      throw new NotFoundException(`Participant not found: ${participantId}`);
    }
    // Platform-owned rows are not the operator's to remove. `creator` is written once, by `start()`,
    // and there is no way to put it back — deleting it would permanently disarm any transition
    // gated on `role: "creator"` ("only whoever raised this may withdraw it"). The symmetric rule to
    // `add()` refusing to CREATE a reserved code.
    if (isReservedRoleCode(row.roleCode)) {
      throw new BadRequestException(
        `Role code is platform-owned and cannot be removed: ${row.roleCode}`,
      );
    }
    await this.participants.delete(participantId);
    await this.audit.record({
      tenantId: project.tenantId,
      actorId: ownerId,
      action: "case.participant.remove",
      targetType: "workflow-instance",
      targetId: instanceId,
      detail: { participantId, roleCode: row.roleCode, userId: row.userId },
    });
  }
}
