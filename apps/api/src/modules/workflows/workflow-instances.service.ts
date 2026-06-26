import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { advance, createInstance, validateGraph } from "@org/workflow-core";
import type { WorkflowInstance } from "@org/workflow-schema";
import { assertId } from "../../common/file-store.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import type { WorkflowSummary } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowRepo } from "../../persistence/repositories/workflow.repo.js";
import type { WorkflowInstanceSummary } from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowInstanceRepo } from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/** Input to start a fresh case of a workflow. */
export interface StartInstanceOptions {
  id?: string;
  data?: Record<string, unknown>;
}

/** Input to fire an action against a running case. */
export interface AdvanceInstanceOptions {
  action: string;
  data?: Record<string, unknown>;
  /** Workflow roles the caller declares; the actor's project role is added automatically. */
  roles?: string[];
}

/**
 * Workflow runtime (WF3): server-authoritative instance lifecycle. Starting/advancing is a write
 * (project role `editor`); reading is `viewer`. The pure engine (`@org/workflow-core`) does ALL the
 * logic — this service only loads (definition, instance), runs the engine, and persists the result
 * via {@link WorkflowInstanceRepo}. Mirrors {@link WorkflowsService}'s access pattern.
 */
@Injectable()
export class WorkflowInstancesService {
  constructor(
    private readonly instances: WorkflowInstanceRepo,
    private readonly workflows: WorkflowRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Start a new case at the workflow's start node (writes ⇒ requires `editor`). */
  async start(
    ownerId: string,
    workflowId: string,
    opts: StartInstanceOptions = {},
  ): Promise<WorkflowInstance> {
    const summary = await this.requireWorkflowAccess(ownerId, workflowId, "editor");
    const def = await this.workflows.load(workflowId);
    if (!def) throw new NotFoundException(`Workflow not found: ${workflowId}`);
    const errors = validateGraph(def);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        message: "Workflow graph is invalid; fix it before running",
        errors,
      });
    }
    const instance = createInstance(def, { id: opts.id, data: opts.data });
    return this.instances.upsert(instance, {
      workflowId,
      projectId: summary.projectId,
    });
  }

  /** Load a running case by id (read ⇒ requires `viewer`). */
  async load(ownerId: string, instanceId: string): Promise<WorkflowInstance> {
    await this.requireInstanceAccess(ownerId, instanceId, "viewer");
    const instance = await this.instances.load(instanceId);
    if (!instance) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    return instance;
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
    const summary = await this.requireInstanceAccess(ownerId, instanceId, "editor");
    const instance = await this.instances.load(instanceId);
    if (!instance) throw new NotFoundException(`Workflow instance not found: ${instanceId}`);
    const def = await this.workflows.load(instance.definitionId);
    if (!def) throw new NotFoundException(`Workflow not found: ${instance.definitionId}`);

    // The runtime has no actor-role registry yet (WF4): the actor's project role
    // (owner|editor|viewer) doubles as an implicit workflow role, merged with any roles the caller
    // self-declares. A transition guarded on a literal "editor"/"viewer"/"owner" is thus satisfiable
    // by project membership — acceptable until domain roles exist; revisit when WF4 adds them.
    const role = await this.projectsService.resolveRole(ownerId, summary.projectId);
    const roles = [...(opts.roles ?? []), ...(role ? [role] : [])];
    const result = advance(def, instance, opts.action, { data: opts.data, roles });
    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: `Cannot advance instance: ${result.reason}`,
        reason: result.reason,
      });
    }
    return this.instances.upsert(result.instance, {
      workflowId: summary.workflowId,
      projectId: summary.projectId,
    });
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

  /** Resolve an instance's project and assert the user holds at least `minRole` on it. */
  private async requireInstanceAccess(
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
}
