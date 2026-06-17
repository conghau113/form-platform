/**
 * Project roles (W5). `owner` is implicit (it is `Project.ownerId`, never a stored member row);
 * collaborator grants carry `editor` or `viewer`. Ranking drives capability checks: a higher
 * rank satisfies any lower required role.
 */
export type ProjectRole = "owner" | "editor" | "viewer";

/** The two roles a sharing grant may hold (the owner is derived from `Project.ownerId`). */
export type MemberRole = Extract<ProjectRole, "editor" | "viewer">;

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, owner: 3 };

/** True when `have` is at least as privileged as `need` (owner ≥ editor ≥ viewer). */
export function roleSatisfies(have: ProjectRole, need: ProjectRole): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}

/** A sharing grant as the repo layer exposes it (no Prisma types leak across the boundary). */
export interface ProjectMemberRecord {
  projectId: string;
  userId: string;
  role: MemberRole;
  createdAt: Date;
}

/**
 * Persistence boundary for project sharing grants (W5; D4: services depend on this interface,
 * never on Prisma). The canonical owner is `Project.ownerId` and is never stored here, so no
 * backfill is required — these rows hold only the *additional* users a project is shared with.
 */
export abstract class ProjectMemberRepo {
  /** All collaborator grants on a project (excludes the implicit owner). */
  abstract listByProject(projectId: string): Promise<ProjectMemberRecord[]>;
  /** Project ids the user has been granted access to via a membership row (excludes owned). */
  abstract listProjectIdsForUser(userId: string): Promise<string[]>;
  /** The user's grant on a project, or `null` when not a member. */
  abstract find(projectId: string, userId: string): Promise<ProjectMemberRecord | null>;
  /** Create or change a grant (unique per project+user). */
  abstract upsert(input: {
    projectId: string;
    userId: string;
    role: MemberRole;
  }): Promise<ProjectMemberRecord>;
  /** Revoke a grant; resolves whether a row was removed. */
  abstract remove(projectId: string, userId: string): Promise<boolean>;
}
