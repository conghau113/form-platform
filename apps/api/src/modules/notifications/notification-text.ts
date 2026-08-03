/**
 * In-app notification wording + deep links (product-roadmap Phase E3b) as **pure functions** — no
 * repo, no config — mirroring `mail-templates.ts`. Vietnamese, matching the builder UI.
 *
 * ⚠️ Everything here is fed from a {@link WorkflowInstanceSummary}: `label` and `statusLabel` are the
 * denormalized columns, derived at write time through `maskData(..., { roles: [] })`, i.e. with every
 * role-gated field removed. That is the whole reason this module never sees `instance.data`: one
 * notification row is shown to whoever it was addressed to, with no masking pass of its own, so
 * anything embedded in the title is effectively public to that reader.
 */

/** Event types the platform emits. Purely descriptive — the client maps them to icons. */
export const NOTIFICATION_KINDS = [
  "case.assigned",
  "case.advanced",
  "case.commented",
  "case.participant-added",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What a notification needs to know about the case it is about — the ungated subset. */
export interface CaseNotificationSubject {
  /** Case label with gated fields already removed, or null when the case has none. */
  label: string | null;
  /** Human status of the current node at the time of the event. */
  statusLabel: string | null;
  /** Only for `case.participant-added`: the domain role the person was cast into. */
  roleCode?: string;
}

const UNLABELLED = "(chưa có nhãn)";

/** Title + body for one event. `body` is null when the event says everything in its title. */
export function caseNotificationText(
  kind: NotificationKind,
  subject: CaseNotificationSubject,
): { title: string; body: string | null } {
  const name = subject.label?.trim() || UNLABELLED;
  const status = subject.statusLabel?.trim() || null;
  switch (kind) {
    case "case.assigned":
      return {
        title: `Bạn được giao việc: ${name}`,
        body: status ? `Trạng thái: ${status}` : null,
      };
    case "case.advanced":
      return {
        title: `Việc đã chuyển bước: ${name}`,
        body: status ? `Trạng thái mới: ${status}` : null,
      };
    case "case.commented":
      return { title: `Bình luận mới trong việc: ${name}`, body: null };
    case "case.participant-added":
      return {
        title: `Bạn được cử tham gia việc: ${name}`,
        body: subject.roleCode?.trim() ? `Vai trò: ${subject.roleCode.trim()}` : null,
      };
  }
}

/**
 * In-app route to the case's Run view — the same path the builder's router declares. Relative on
 * purpose: the SPA's base path is deployment-specific (Phase 0 `VITE_BASE_PATH`), so an absolute URL
 * built here would be wrong on any install that is not mounted at `/`.
 */
export function caseLink(projectId: string, workflowId: string, instanceId: string): string {
  return `/projects/${projectId}/workflows/${workflowId}/run/${instanceId}`;
}
