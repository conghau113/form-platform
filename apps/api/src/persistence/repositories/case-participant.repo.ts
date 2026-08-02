/**
 * Persistence boundary for a case's cast (product-roadmap Phase E3a) — the people cast into a domain
 * role on one running case, which is where the engine's `transition.role` check gets its facts from.
 *
 * Like {@link CaseCommentRepo} this repo applies no access rules; the service decides who may read or
 * change a cast. `addedBy` is a bare string (no FK) so the record outlives the account that wrote it.
 */
export interface CaseParticipantRecord {
  id: string;
  instanceId: string;
  /** The domain role, matched against `transition.role` (e.g. "manager", "hr"). */
  roleCode: string;
  userId: string;
  /** Who cast this person, as at the time — a historical reference, never joined. */
  addedBy: string;
  createdAt: Date;
}

export abstract class CaseParticipantRepo {
  /**
   * Cast a person into a role on a case, or return `null` when that exact (case, role, person) row
   * already exists.
   *
   * `null` rather than a thrown Prisma error keeps the driver's error types out of the service (the
   * same contract as {@link WorkflowInstanceRepo.create}), which maps it to 409. It means "already
   * cast" only because `(instanceId, roleCode, userId)` is the model's ONLY unique constraint.
   */
  abstract create(input: {
    instanceId: string;
    roleCode: string;
    userId: string;
    addedBy: string;
  }): Promise<CaseParticipantRecord | null>;
  /** A case's whole cast, oldest first. */
  abstract listByInstance(instanceId: string): Promise<CaseParticipantRecord[]>;
  /**
   * The role codes one person holds on one case — the hot path, read on every advance, load and
   * masked response, so it is its own narrow query rather than a filter over the whole cast.
   */
  abstract listRoleCodes(instanceId: string, userId: string): Promise<string[]>;
  /** One cast row by id, or `null` — the service checks it belongs to the case before deleting. */
  abstract findById(id: string): Promise<CaseParticipantRecord | null>;
  /** Remove a cast row by id; no-op if already absent. */
  abstract delete(id: string): Promise<void>;
}
