import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  MemberRole,
  ProjectMemberRecord,
} from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectMemberRepo } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "./projects.service.js";

const MEMBER_ROLES: readonly MemberRole[] = ["editor", "viewer"];

/** The sharing picture a project exposes: its canonical owner + the collaborator grants. */
export interface ProjectMembersView {
  ownerId: string;
  members: ProjectMemberRecord[];
}

/**
 * Project sharing (W5). The canonical owner (`Project.ownerId`) is never a stored grant — it
 * always resolves to the `owner` role — so there is always exactly one, un-removable owner and
 * "last owner" needs no special handling. Only the owner may manage grants; any member (viewer+)
 * may read the roster. Grants carry `editor`/`viewer` and never target the owner themselves.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly members: ProjectMemberRepo,
  ) {}

  /** Roster (owner + collaborators) — any member of the project may read it (viewer+). */
  async list(userId: string, projectId: string): Promise<ProjectMembersView> {
    const project = await this.projects.requireAccess(userId, projectId, "viewer");
    const members = await this.members.listByProject(projectId);
    return { ownerId: project.ownerId, members };
  }

  /** Share with / re-grant a collaborator (owner only). Cannot target the project owner. */
  async grant(
    userId: string,
    projectId: string,
    targetUserId: string,
    role: string,
  ): Promise<ProjectMemberRecord> {
    const project = await this.projects.requireAccess(userId, projectId, "owner");
    const target = targetUserId?.trim();
    if (!target) throw new BadRequestException("A user id to share with is required");
    if (target === project.ownerId) {
      throw new BadRequestException("The project owner already has full access");
    }
    return this.members.upsert({ projectId, userId: target, role: assertMemberRole(role) });
  }

  /** Change an existing collaborator's role (owner only) → 404 if not currently a member. */
  async updateRole(
    userId: string,
    projectId: string,
    targetUserId: string,
    role: string,
  ): Promise<ProjectMemberRecord> {
    await this.projects.requireAccess(userId, projectId, "owner");
    const existing = await this.members.find(projectId, targetUserId);
    if (!existing) throw new NotFoundException(`Not a member: ${targetUserId}`);
    return this.members.upsert({ projectId, userId: targetUserId, role: assertMemberRole(role) });
  }

  /** Revoke a collaborator (owner only) → 404 if they were not a member. */
  async revoke(userId: string, projectId: string, targetUserId: string): Promise<void> {
    await this.projects.requireAccess(userId, projectId, "owner");
    const removed = await this.members.remove(projectId, targetUserId);
    if (!removed) throw new NotFoundException(`Not a member: ${targetUserId}`);
  }
}

/** Narrow an arbitrary string to a grantable role (editor/viewer) or reject it (400). The edge
 *  DTO (`@IsIn`) already rejects bad roles, so this is defense-in-depth — but it is also the
 *  `string → MemberRole` type narrowing the repo needs, so both layers are intentional. */
function assertMemberRole(role: string): MemberRole {
  if ((MEMBER_ROLES as readonly string[]).includes(role)) return role as MemberRole;
  throw new BadRequestException(`Invalid role: ${role} (expected editor | viewer)`);
}
