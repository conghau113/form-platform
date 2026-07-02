/**
 * Persistence boundary for the audit trail (product-roadmap §8; write-side lands with Phase D1).
 * Append-only: sensitive admin actions (role changes, permission grants, member management) are
 * recorded so a tenant can answer "who did what, when". The read/UI surface is Phase D5.
 */
export interface AuditEntry {
  tenantId: string;
  actorId: string;
  /** Stable dotted action code, e.g. `role.create`, `user.set-roles`, `member.add`. */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Small JSON payload with the specifics (e.g. the granted codes). Keep it shallow. */
  detail?: unknown;
}

export abstract class AuditRepo {
  abstract record(entry: AuditEntry): Promise<void>;
}
