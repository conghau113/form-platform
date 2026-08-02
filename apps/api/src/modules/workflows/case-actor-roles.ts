import { Injectable } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { CaseParticipantRepo } from "../../persistence/repositories/case-participant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ActorRolesService } from "../projects/actor-roles.service.js";

/** The derived code a case's responsible person holds — never stored as a cast row (one writer). */
export const ASSIGNEE_ROLE_CODE = "assignee";

/** The derived code written into the cast when a case is started, so a case always has someone. */
export const CREATOR_ROLE_CODE = "creator";

/**
 * The roles an actor holds on one CASE: their project-level roles, plus every role they were cast
 * into on this case, plus `assignee` when the case is theirs. Pure, deduped, order-stable.
 */
export function mergeCaseActorRoles(
  projectRoles: string[],
  castRoles: string[],
  isAssignee: boolean,
): string[] {
  const roles = new Set([...projectRoles, ...castRoles]);
  if (isAssignee) roles.add(ASSIGNEE_ROLE_CODE);
  return [...roles];
}

/**
 * The per-case extension of {@link ActorRolesService} (product-roadmap Phase E3a) — what the engine
 * checks `transition.role` against and what field masking resolves `viewRoles` with.
 *
 * It lives in `workflows/` rather than beside `ActorRolesService`: `projects/` is imported by nearly
 * every feature module, so making it depend on {@link CaseParticipantRepo} would point the layering
 * the wrong way round.
 *
 * `assignee` is DERIVED from the case summary, never stored as a cast row — `setAssignee` stays the
 * single writer of "who is responsible", so the two can never disagree.
 */
@Injectable()
export class CaseActorRolesService {
  constructor(
    private readonly actorRoles: ActorRolesService,
    private readonly participants: CaseParticipantRepo,
  ) {}

  /** The caller's roles on one case. `case` is the summary every access check already produced. */
  async forCase(
    userId: string,
    instance: { id: string; projectId: string; assigneeId: string | null },
  ): Promise<string[]> {
    const [projectRoles, castRoles] = await Promise.all([
      this.actorRoles.forProject(userId, instance.projectId),
      this.participants.listRoleCodes(instance.id, userId),
    ]);
    return mergeCaseActorRoles(projectRoles, castRoles, instance.assigneeId === userId);
  }
}
