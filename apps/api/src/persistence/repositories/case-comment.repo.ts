/**
 * Persistence boundary for case comments (Phase E2) — a note someone left on a running work-order
 * case. Append-only in this slice: no edit, no delete (see the roadmap's known-gap list).
 *
 * `authorName` is a snapshot taken when the comment is written, and `authorId` carries no FK — the
 * same shape as {@link AuditRepo}, and for the same reason: a comment is a historical record that
 * must outlive the account that wrote it, and a thread should not cost one user lookup per row.
 */
export interface CaseCommentRecord {
  id: string;
  instanceId: string;
  authorId: string;
  /** Display name (falling back to email) of the author AS AT the time of writing. */
  authorName: string;
  body: string;
  createdAt: Date;
}

export abstract class CaseCommentRepo {
  /** Append a comment; returns the stored row (the caller needs its generated `id` for the audit). */
  abstract create(input: {
    instanceId: string;
    authorId: string;
    authorName: string;
    body: string;
  }): Promise<CaseCommentRecord>;
  /** A case's whole thread, oldest first — a conversation reads top-down. */
  abstract listByInstance(instanceId: string): Promise<CaseCommentRecord[]>;
}
