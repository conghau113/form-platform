import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { maskData } from "@org/form-core";
import { type FormSchema, migrate } from "@org/form-schema";
import { advance, createInstance, deriveCaseLabel, validateGraph } from "@org/workflow-core";
import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { CaseParticipantRepo } from "../../persistence/repositories/case-participant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormVersionRepo } from "../../persistence/repositories/form-version.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { UserRepo } from "../../persistence/repositories/user.repo.js";
import type { WorkflowSummary } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowRepo } from "../../persistence/repositories/workflow.repo.js";
import type {
  WorkflowInstanceMeta,
  WorkflowInstanceSummary,
} from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowInstanceRepo } from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { MailService } from "../mail/mail.service.js";
import { caseAssignedEmail } from "../mail/mail-templates.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { NotificationsService } from "../notifications/notifications.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { CaseActorRolesService, CREATOR_ROLE_CODE } from "./case-actor-roles.js";

/** Input to start a fresh case of a workflow. */
export interface StartInstanceOptions {
  id?: string;
  data?: Record<string, unknown>;
}

/** Input to fire an action against a running case. */
export interface AdvanceInstanceOptions {
  action: string;
  data?: Record<string, unknown>;
}

/**
 * Workflow runtime (WF3): server-authoritative instance lifecycle. Reading is project `viewer`;
 * starting/advancing/assigning goes through {@link ProjectsService.requireRunAccess} — running a
 * case is its OWN permission (`workflow.run`), not a side effect of design-time `editor` (Phase E).
 * The pure engine (`@org/workflow-core`) does ALL the logic — this service only loads (definition,
 * instance), runs the engine, and persists the result via {@link WorkflowInstanceRepo}.
 *
 * Field-level RBAC: every response carrying case data is masked against the form bound to the case's
 * current state, exactly like {@link SubmissionsService.load}. Masking is a READ concern only — what
 * is persisted is always the full, unmasked instance, so a reader who cannot see a field can never
 * erase it.
 *
 * Actor roles (Phase E3a): the roles the engine checks `transition.role` against, and that masking
 * resolves `viewRoles` with, come from {@link CaseActorRolesService} — the caller's project role,
 * their tenant roles and the cast of this case. They are NOT taken from the request body any more;
 * a caller who could name their own roles could read every gated field simply by asking.
 */
@Injectable()
export class WorkflowInstancesService {
  private readonly logger = new Logger(WorkflowInstancesService.name);

  constructor(
    private readonly instances: WorkflowInstanceRepo,
    private readonly workflows: WorkflowRepo,
    private readonly projectsService: ProjectsService,
    private readonly forms: FormRepo,
    private readonly versions: FormVersionRepo,
    private readonly tenants: TenantRepo,
    private readonly users: UserRepo,
    private readonly audit: AuditRepo,
    private readonly mail: MailService,
    private readonly participants: CaseParticipantRepo,
    private readonly caseActorRoles: CaseActorRolesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Start a new case at the workflow's start node (requires run access). */
  async start(
    ownerId: string,
    workflowId: string,
    opts: StartInstanceOptions = {},
  ): Promise<WorkflowInstance> {
    const summary = await this.requireWorkflowRunAccess(ownerId, workflowId);
    const def = await this.workflows.load(workflowId);
    if (!def) throw new NotFoundException(`Workflow not found: ${workflowId}`);
    const errors = validateGraph(def);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        message: "Workflow graph is invalid; fix it before running",
        errors,
      });
    }
    // Starting a case with an id that already exists must never REWRITE that case and drag it into
    // this project. (Phase E makes this reachable with `workflow.run`, where it previously needed
    // `editor`.) This check is the friendly path — it reports the conflict before the work of
    // `denormalize` — but it is not the guarantee: it races, and it only covers client-chosen ids.
    // The insert below is what actually decides.
    if (opts.id && (await this.instances.findSummary(opts.id))) {
      throw new ConflictException(`Workflow instance already exists: ${opts.id}`);
    }
    const instance = createInstance(def, { id: opts.id, data: opts.data });
    const stored = await this.instances.create(instance, {
      workflowId,
      projectId: summary.projectId,
      ...(await this.denormalize(def, instance)),
    });
    // `null` = the id was taken between the check above and this insert, or a generated id collided.
    if (!stored) {
      throw new ConflictException(`Workflow instance already exists: ${instance.id}`);
    }
    // Phase E3a: a case is never cast-less. The starter goes in as `creator`, which a definition can
    // gate on ("only whoever raised this may withdraw it") without anyone having to cast them first.
    await this.participants.create({
      instanceId: stored.id,
      roleCode: CREATOR_ROLE_CODE,
      userId: ownerId,
      addedBy: ownerId,
    });
    const scope = { id: stored.id, projectId: summary.projectId, assigneeId: null };
    return this.maskInstance(def, stored, await this.caseActorRoles.forCase(ownerId, scope));
  }

  /** Load a running case by id (read ⇒ requires `viewer`). */
  async load(ownerId: string, instanceId: string): Promise<WorkflowInstance> {
    const summary = await this.requireInstanceAccess(ownerId, instanceId, "viewer");
    const stored = await this.instances.load(instanceId);
    if (!stored) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    const def = await this.workflows.load(stored.instance.definitionId);
    return this.maskInstance(
      def,
      stored.instance,
      await this.caseActorRoles.forCase(ownerId, summary),
    );
  }

  /** List a workflow's cases (read ⇒ requires `viewer`). */
  async list(ownerId: string, workflowId: string): Promise<WorkflowInstanceSummary[]> {
    await this.requireWorkflowAccess(ownerId, workflowId, "viewer");
    return this.instances.listByWorkflow(workflowId);
  }

  /** Fire an action; the engine picks the winning transition or reports why none fired (422). */
  async advance(
    ownerId: string,
    instanceId: string,
    opts: AdvanceInstanceOptions,
  ): Promise<WorkflowInstance> {
    const summary = await this.requireInstanceRunAccess(ownerId, instanceId);
    // E3b (parallel track): `loaded.rev` is the revision this decision is made on. It travels to the write below and
    // nowhere else — the engine has no business knowing the case is stored at all.
    const loaded = await this.instances.load(instanceId);
    if (!loaded) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    const def = await this.workflows.load(loaded.instance.definitionId);
    if (!def) throw new NotFoundException(`Workflow not found: ${loaded.instance.definitionId}`);

    // Phase E3a: the acting roles are the SERVER's answer — project role + tenant roles + this
    // case's cast + `assignee` — never the caller's. `transition.role` is therefore a real check
    // now, on top of (not instead of) `requireInstanceRunAccess`, which remains the access boundary.
    // A project role still doubles as a workflow role, so definitions gating on a literal
    // "editor"/"viewer"/"owner" keep working exactly as before.
    const roles = await this.caseActorRoles.forCase(ownerId, summary);
    const result = advance(def, loaded.instance, opts.action, {
      data: opts.data,
      roles,
      actor: ownerId,
    });
    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: `Cannot advance instance: ${result.reason}`,
        reason: result.reason,
      });
    }
    // Captured rather than inlined into the write call: the notification's title has to describe
    // the case as it is AFTER the move (new status, possibly a new label), and it must come from the
    // same ungated derivation the stored columns do — never from `result.instance.data`.
    const meta = await this.denormalize(def, result.instance);
    const stored = await this.instances.update(
      result.instance,
      { workflowId: summary.workflowId, projectId: summary.projectId, ...meta },
      loaded.rev,
    );
    // E3b (parallel track): someone else moved the case between our load and our write, so `result.instance` was
    // computed from state that no longer exists — writing it would drop THEIR move from `history`
    // and `tokens` without a trace. Refuse, and let the caller decide what to do with the case as
    // it now stands; retrying here would silently re-run an action against a different situation.
    if (!stored) {
      throw new ConflictException(
        `Workflow instance changed while this action was being processed; reload and retry: ${instanceId}`,
      );
    }
    // Deliberately after the conflict check: telling people "the case moved" for a move that was
    // refused is a notification about something that did not happen.
    await this.notifyCaseAdvanced(ownerId, summary, meta);
    return this.maskInstance(def, stored, roles);
  }

  /**
   * Assign the case to a tenant member, or clear it with `null` (Phase E). The target must belong to
   * the project's tenant — assigning work to someone who cannot reach the project would create a
   * silent dead end. Notification is best-effort: {@link MailService.send} already swallows and logs
   * transport failures, so a broken SMTP never fails the assignment.
   */
  async assign(
    ownerId: string,
    instanceId: string,
    assigneeId: string | null,
  ): Promise<WorkflowInstanceSummary> {
    const summary = await this.requireInstanceRunAccess(ownerId, instanceId);
    const project = await this.projectsService.requireRunAccess(ownerId, summary.projectId);

    if (assigneeId && !(await this.tenants.isMember(assigneeId, project.tenantId))) {
      throw new BadRequestException(`User is not a member of this workspace: ${assigneeId}`);
    }
    await this.instances.setAssignee(instanceId, assigneeId);
    await this.audit.record({
      tenantId: project.tenantId,
      actorId: ownerId,
      action: "case.assign",
      targetType: "workflow-instance",
      targetId: instanceId,
      detail: { assigneeId },
    });
    if (assigneeId) {
      await this.notifyAssignee(assigneeId, summary, project.name);
      await this.notifications.emitCaseEvent({
        kind: "case.assigned",
        tenantId: project.tenantId,
        actorId: ownerId,
        recipientIds: [assigneeId],
        case: {
          id: instanceId,
          projectId: summary.projectId,
          workflowId: summary.workflowId,
          label: summary.label,
          statusLabel: summary.statusLabel,
        },
      });
    }

    const updated = await this.instances.findSummary(instanceId);
    if (!updated) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    return updated;
  }

  /**
   * Write the work-order attributes of a case — deadline and urgency (Phase E2). Same boundary as
   * {@link assign}: changing when work is due is operating the case, so it needs run access.
   *
   * Only the keys present in `patch` are written (`dueAt: null` clears the deadline), and none of
   * them go through {@link WorkflowInstanceMeta} — see the note there on why advancing a case must
   * never be able to wipe them.
   */
  async updateWorkOrder(
    ownerId: string,
    instanceId: string,
    patch: { dueAt?: Date | null; priority?: number },
  ): Promise<WorkflowInstanceSummary> {
    if (patch.dueAt === undefined && patch.priority === undefined) {
      throw new BadRequestException("Nothing to update: provide dueAt and/or priority");
    }
    const summary = await this.requireInstanceRunAccess(ownerId, instanceId);
    const project = await this.projectsService.requireRunAccess(ownerId, summary.projectId);

    await this.instances.setWorkOrderFields(instanceId, patch);
    await this.audit.record({
      tenantId: project.tenantId,
      actorId: ownerId,
      action: "case.set-work-order",
      targetType: "workflow-instance",
      targetId: instanceId,
      // Serialize the date explicitly rather than relying on Prisma's implicit `Date.toJSON()`, so
      // what lands in the JSON column is a stable, obvious shape.
      detail: {
        ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt?.toISOString() ?? null } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      },
    });

    const updated = await this.instances.findSummary(instanceId);
    if (!updated) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    return updated;
  }

  /** Email the new assignee that a case is waiting for them (best-effort, never throws). */
  private async notifyAssignee(
    assigneeId: string,
    summary: WorkflowInstanceSummary,
    projectName: string,
  ): Promise<void> {
    const user = await this.users.findById(assigneeId);
    if (!user) return;
    await this.mail.send(
      user.email,
      caseAssignedEmail({
        displayName: user.displayName ?? user.email,
        caseLabel: summary.label,
        statusLabel: summary.statusLabel,
        projectName,
      }),
    );
  }

  /**
   * Tell everyone on the case that it moved (Phase E3b): its cast plus whoever is responsible for
   * it, minus the person who moved it — {@link NotificationsService.emitCaseEvent} applies that
   * subtraction, the dedupe (being both cast and assignee earns one notification, not two) and the
   * "can they still open the project" filter.
   *
   * The tenant comes from a second `requireRunAccess` call, exactly as `assign` and
   * `CaseCommentsService.add` do it: {@link WorkflowInstanceSummary} carries no `tenantId`, and it
   * must not start to — every column on that summary is spelled out by hand in the admin-catalog
   * repo (the Phase E2 lesson).
   */
  private async notifyCaseAdvanced(
    ownerId: string,
    summary: WorkflowInstanceSummary,
    meta: Pick<WorkflowInstanceMeta, "label" | "statusLabel">,
  ): Promise<void> {
    // The whole body is swallowed, not just the write: this runs AFTER the advance has been
    // committed, so a failure gathering the recipients (a lock on the participant table while the
    // instance table is fine) would turn work the engine has already done into a 500.
    try {
      const project = await this.projectsService.requireRunAccess(ownerId, summary.projectId);
      const cast = await this.participants.listByInstance(summary.id);
      await this.notifications.emitCaseEvent({
        kind: "case.advanced",
        tenantId: project.tenantId,
        actorId: ownerId,
        recipientIds: [
          ...cast.map((p) => p.userId),
          ...(summary.assigneeId ? [summary.assigneeId] : []),
        ],
        case: {
          id: summary.id,
          projectId: summary.projectId,
          workflowId: summary.workflowId,
          label: meta.label,
          statusLabel: meta.statusLabel,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to notify case.advanced on ${summary.id}: ${(err as Error).stack}`);
    }
  }

  /**
   * Mask the case data a response carries (FS2 reuse: `maskData` + the reader's roles).
   *
   * Masking runs against EVERY form the definition binds, not just the current node's. A case
   * accumulates data across states, so a field gated in step 1's form is still in `data` at step 3 —
   * masking only the current node's form would hand it over the moment the case moved on (or land
   * on a node with no form at all and mask nothing). `maskData` only touches fields the given form
   * declares, so applying the forms in turn yields exactly the union of their gates.
   *
   * ⚠️ Read-side only. `advance` persists the merged, UNMASKED instance, so a field the actor cannot
   * see survives their advance — with one limit: that merge is shallow, so a client echoing back a
   * whole ARRAY it received masked replaces that array, dropping row-level gated values. Known gap
   * (Phase E); top-level gated fields are unaffected.
   */
  private async maskInstance(
    def: WorkflowDefinition | null,
    instance: WorkflowInstance,
    roles: string[],
  ): Promise<WorkflowInstance> {
    const forms = await this.boundForms(def);
    if (forms.length === 0) return instance;

    const data = forms.reduce((acc, form) => maskData(form, acc, { roles }), instance.data);
    return { ...instance, data };
  }

  /** The form to mask against: the active published version when there is one, else the draft. */
  private async resolveSnapshot(formId: string): Promise<FormSchema | null> {
    const active = await this.versions.loadActive(formId);
    if (active) return migrate(active.body);
    return this.forms.load(formId);
  }

  /** Every form the definition binds, deduped — what masking and labelling both resolve against. */
  private async boundForms(def: WorkflowDefinition | null): Promise<FormSchema[]> {
    const formIds = [...new Set((def?.nodes ?? []).flatMap((n) => (n.formId ? [n.formId] : [])))];
    if (formIds.length === 0) return [];
    return (await Promise.all(formIds.map((id) => this.resolveSnapshot(id)))).filter(
      (f): f is FormSchema => f != null,
    );
  }

  /**
   * The denormalized columns written on every case write: the display label plus the current node's
   * status (Phase E).
   *
   * The label is derived from the case data with EVERY role-gated field removed
   * (`maskData(..., { roles: [] })`). It has to be: the label is stored once and shown to everyone —
   * in the work-order list, in the assignment email, and it is substring-searchable via `?q=` — while
   * `deriveCaseLabel` picks "the first non-empty string", which is quite happy to pick a
   * `viewRoles`-gated answer. Deriving it from the ungated subset keeps one shared label honest for
   * every reader instead of turning the search box into an oracle over gated values.
   */
  private async denormalize(
    def: WorkflowDefinition,
    instance: WorkflowInstance,
  ): Promise<Pick<WorkflowInstanceMeta, "label" | "statusLabel" | "statusKind">> {
    const forms = await this.boundForms(def);
    const ungated = forms.reduce((acc, form) => maskData(form, acc, { roles: [] }), instance.data);
    const node = def.nodes.find((n) => n.id === instance.current);
    return {
      label: deriveCaseLabel(ungated) ?? null,
      statusLabel: node?.status ?? null,
      statusKind: node?.kind ?? null,
    };
  }

  /** Resolve a workflow's project and assert the user holds at least `minRole` on it. */
  private async requireWorkflowAccess(
    ownerId: string,
    workflowId: string,
    minRole: ProjectRole,
  ): Promise<WorkflowSummary> {
    assertId(workflowId, "workflow");
    const summary = await this.workflows.findSummary(workflowId);
    if (!summary) throw new NotFoundException(`Workflow not found: ${workflowId}`);
    await this.projectsService.requireAccess(ownerId, summary.projectId, minRole);
    return summary;
  }

  /** Resolve a workflow's project and assert the user may run its cases. */
  private async requireWorkflowRunAccess(
    ownerId: string,
    workflowId: string,
  ): Promise<WorkflowSummary> {
    assertId(workflowId, "workflow");
    const summary = await this.workflows.findSummary(workflowId);
    if (!summary) throw new NotFoundException(`Workflow not found: ${workflowId}`);
    await this.projectsService.requireRunAccess(ownerId, summary.projectId);
    return summary;
  }

  /**
   * Resolve an instance's project and assert the user holds at least `minRole` on it.
   *
   * `public` (like {@link requireInstanceRunAccess} below) so {@link CaseCommentsService} can reuse
   * the exact same access decision instead of re-deriving it — one copy of "can this person touch
   * this case" is the point. Not part of the HTTP surface.
   */
  async requireInstanceAccess(
    ownerId: string,
    instanceId: string,
    minRole: ProjectRole,
  ): Promise<WorkflowInstanceSummary> {
    assertId(instanceId, "workflow instance");
    const summary = await this.instances.findSummary(instanceId);
    if (!summary) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    await this.projectsService.requireAccess(ownerId, summary.projectId, minRole);
    return summary;
  }

  /** Resolve an instance's project and assert the user may run it (public — see above). */
  async requireInstanceRunAccess(
    ownerId: string,
    instanceId: string,
  ): Promise<WorkflowInstanceSummary> {
    assertId(instanceId, "workflow instance");
    const summary = await this.instances.findSummary(instanceId);
    if (!summary) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    await this.projectsService.requireRunAccess(ownerId, summary.projectId);
    return summary;
  }
}
