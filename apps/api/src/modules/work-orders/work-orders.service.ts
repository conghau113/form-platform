import { Injectable } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { OrgUnitRepo } from "../../persistence/repositories/org-unit.repo.js";
import type { ProjectRecord } from "../../persistence/repositories/project.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import {
  ProjectMemberRepo,
  roleSatisfies,
} from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import type { WorkflowSummary } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowRepo } from "../../persistence/repositories/workflow.repo.js";
import type {
  WorkOrderPage,
  WorkOrderRow,
} from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowInstanceRepo } from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";
import {
  canRunWorkflow,
  collectAncestors,
  hasScopedGrant,
  projectRoleFromScopedGrants,
} from "../projects/tenant-role.js";

/** A work-order row plus whether THIS caller may operate it (assign / advance). */
export interface WorkOrderListRow extends WorkOrderRow {
  canRun: boolean;
}

/** One page of the work-order list. */
export interface WorkOrderListResult {
  rows: WorkOrderListRow[];
  total: number;
}

/** A tenant member offered in the assignee picker. */
export interface AssigneeOption {
  id: string;
  email: string;
  displayName: string | null;
}

/** Query the controller has already normalised (paging defaults applied, `pageSize` capped). */
export interface WorkOrderQuery {
  workflowId?: string;
  current?: string;
  statusKind?: string;
  /** A user id, or the sentinels `me` (the caller) / `none` (unassigned). */
  assignee?: string;
  search?: string;
  /** Exact urgency (Phase E2): 1 | 2 | 3. */
  priority?: number;
  /** Keep only cases past their deadline and not finished (Phase E2). */
  overdue?: boolean;
  page: WorkOrderPage;
}

/**
 * Read side of the work-order manager (product-roadmap Phase E — the "Vận hành" screen).
 *
 * Access is NOT re-implemented here: the visible projects come from
 * {@link ProjectsService.list}, the one chokepoint that already applies the active workspace, the
 * B3 tenant union and C3 data-scope. Those projects are then narrowed to the caller's ACTIVE tenant
 * — `ProjectsService.list` deliberately never filters W5 person-to-person shares by tenant, which is
 * right for the design screen but wrong here: a case from another workspace would be listed with an
 * assignee picker drawn from this workspace's members, and every assignment would fail. One screen,
 * one workspace.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly instances: WorkflowInstanceRepo,
    private readonly workflows: WorkflowRepo,
    private readonly projectsService: ProjectsService,
    private readonly tenants: TenantRepo,
    private readonly rbac: RbacRepo,
    private readonly orgUnits: OrgUnitRepo,
    private readonly members: ProjectMemberRepo,
  ) {}

  async list(
    userId: string,
    query: WorkOrderQuery,
    activeTenantId?: string,
  ): Promise<WorkOrderListResult> {
    const { tenantId, projects } = await this.scope(userId, activeTenantId);
    if (projects.length === 0) return { rows: [], total: 0 };

    const { rows, total } = await this.instances.listByProjects(
      projects.map((p) => p.id),
      {
        workflowId: query.workflowId,
        current: query.current,
        statusKind: query.statusKind,
        ...resolveAssignee(userId, query.assignee),
        search: query.search,
        priority: query.priority,
        // The HTTP surface asks a yes/no question; the repo wants the cutoff instant, so the clock is
        // read HERE — one field down there means the filter can never be applied without it.
        ...(query.overdue ? { overdueBefore: new Date() } : {}),
      },
      query.page,
    );
    const runnable = tenantId
      ? await this.runnableProjectIds(userId, tenantId, projects)
      : new Set<string>();
    return {
      rows: rows.map((r) => ({ ...r, canRun: runnable.has(r.projectId) })),
      total,
    };
  }

  /** Members of the active workspace, for the assignee picker. */
  async assignees(userId: string, activeTenantId?: string): Promise<AssigneeOption[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) return [];
    const users = await this.rbac.listTenantUsers(tenantId);
    return users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }));
  }

  /** Workflows the caller can start a case of, for the "Tạo việc" picker. */
  async runnableWorkflows(userId: string, activeTenantId?: string): Promise<WorkflowSummary[]> {
    const { tenantId, projects } = await this.scope(userId, activeTenantId);
    if (!tenantId || projects.length === 0) return [];
    const runnable = await this.runnableProjectIds(userId, tenantId, projects);
    return this.workflows.listByProjects([...runnable]);
  }

  /** The active workspace + the projects the caller can see inside it. */
  private async scope(
    userId: string,
    activeTenantId?: string,
  ): Promise<{ tenantId: string | null; projects: ProjectRecord[] }> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) return { tenantId: null, projects: [] };
    const visible = await this.projectsService.list(userId, activeTenantId);
    return { tenantId, projects: visible.filter((p) => p.tenantId === tenantId) };
  }

  /**
   * Which of those projects the caller may actually operate — the same verdict
   * {@link ProjectsService.requireRunAccess} would give, resolved ONCE for the page instead of per
   * row so the UI can disable assignment exactly where the server would answer 403.
   *
   * Three ways to qualify, cheapest first: you own the project; your tenant grants carry a run
   * function that reaches it (data-scoped, C3); or a W5 person-to-person share made you `editor`.
   * Only projects that failed the first two cost a per-project grant lookup, so the common operator
   * and admin paths stay at two queries for the whole page.
   */
  private async runnableProjectIds(
    userId: string,
    tenantId: string,
    projects: ProjectRecord[],
  ): Promise<Set<string>> {
    const grants = await this.rbac.resolveScopedGrants(userId, tenantId);
    const units = hasScopedGrant(grants) ? await this.orgUnits.list(tenantId) : [];
    const runnable = new Set<string>();
    const undecided: ProjectRecord[] = [];
    for (const p of projects) {
      if (p.ownerId === userId) {
        runnable.add(p.id);
        continue;
      }
      const ancestors = p.orgUnitId ? collectAncestors(units, p.orgUnitId) : new Set<string>();
      // Both halves of `requireRunAccess`: a run function, or grants that already confer `editor`
      // (design-time power implies runtime power).
      const tenantRole = projectRoleFromScopedGrants(grants, ancestors);
      if (
        canRunWorkflow(grants, ancestors) ||
        (tenantRole && roleSatisfies(tenantRole, "editor"))
      ) {
        runnable.add(p.id);
      } else undecided.push(p);
    }
    if (undecided.length > 0) {
      const shared = new Set(await this.members.listProjectIdsForUser(userId));
      for (const p of undecided) {
        if (!shared.has(p.id)) continue;
        const grant = await this.members.find(p.id, userId);
        if (grant && roleSatisfies(grant.role, "editor")) runnable.add(p.id);
      }
    }
    return runnable;
  }
}

/** Translate the `assignee` sentinel into a repo filter. */
function resolveAssignee(
  userId: string,
  assignee: string | undefined,
): { assigneeId?: string; unassigned?: boolean } {
  if (!assignee) return {};
  if (assignee === "none") return { unassigned: true };
  return { assigneeId: assignee === "me" ? userId : assignee };
}
