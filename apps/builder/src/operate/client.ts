import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../workspace/config";

/**
 * Thin client for the work-order api (`/work-orders/*` + case assignment, product-roadmap Phase E).
 * Mirrors `admin/client.ts`: `fetch` lives only here, a non-OK response throws the server message,
 * and the active workspace rides along as the `X-Tenant-Id` header {@link apiFetch} stamps. The
 * server is authoritative — it decides which cases the caller sees (`workflow.run` + the project
 * chokepoint) and whether an assignment is allowed.
 */

/** A case as the work-order list shows it: the org index plus the names and the caller's verdict. */
export interface WorkOrderRow {
  id: string;
  workflowId: string;
  projectId: string;
  current: string;
  /** Case label derived from the data with role-gated fields removed, or null when none. */
  label: string | null;
  assigneeId: string | null;
  /** Human status of the current node, snapshotted at the last write. */
  statusLabel: string | null;
  /** Engine category of the current node — `start` | `normal` | `end`. */
  statusKind: string | null;
  /** Deadline as an ISO instant, or null when none was set (Phase E2). */
  dueAt: string | null;
  /** Urgency (Phase E2): 1 = low, 2 = normal, 3 = high. */
  priority: number;
  createdAt: string;
  updatedAt: string;
  workflowTitle: string;
  projectName: string;
  assigneeName: string | null;
  /** Whether THIS caller may operate the case — the same verdict the server would give a write. */
  canRun: boolean;
}

/** One page of the work-order list; `total` counts every row matching the same filter. */
export interface WorkOrderPage {
  rows: WorkOrderRow[];
  total: number;
}

/** A member of the active workspace, offered in the assignee picker. */
export interface AssigneeOption {
  id: string;
  email: string;
  displayName: string | null;
}

/** A workflow the caller may start a case of (mirrors the api `WorkflowSummary`). */
export interface RunnableWorkflow {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: string;
}

/** One note on a case (Phase E2). `authorName` is what the server snapshotted when it was written. */
export interface CaseComment {
  id: string;
  instanceId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** One person cast into a domain role on a case (Phase E3a). */
export interface CaseParticipant {
  id: string;
  instanceId: string;
  roleCode: string;
  userId: string;
  addedBy: string;
  createdAt: string;
}

/** A case's cast plus the roles the SERVER says the caller acts in on it. */
export interface CaseCast {
  participants: CaseParticipant[];
  myRoles: string[];
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

/** One page of cases in the active workspace. `search` is the already-serialized query string. */
export async function listWorkOrders(search: string): Promise<WorkOrderPage> {
  const res = await apiFetch(`${API_BASE}/work-orders?${search}`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Tải danh sách việc thất bại: ${await readError(res)}`);
  return (await res.json()) as WorkOrderPage;
}

export async function listAssignees(): Promise<AssigneeOption[]> {
  const res = await apiFetch(`${API_BASE}/work-orders/assignees`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Tải danh sách thành viên thất bại: ${await readError(res)}`);
  return (await res.json()) as AssigneeOption[];
}

export async function listRunnableWorkflows(): Promise<RunnableWorkflow[]> {
  const res = await apiFetch(`${API_BASE}/work-orders/workflows`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Tải danh sách quy trình thất bại: ${await readError(res)}`);
  return (await res.json()) as RunnableWorkflow[];
}

/**
 * Make a workspace member responsible for a case; `null` unassigns. Lives here rather than in
 * `workflow/client.ts` because responsibility is the work-order feature's concern — the workflow
 * client stays the pure runtime (start / load / advance).
 */
export async function assignCase(instanceId: string, assigneeId: string | null): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/assign`,
    {
      method: "POST",
      headers: { ...ownerHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ assigneeId }),
    },
  );
  if (!res.ok) throw new Error(`Giao việc thất bại: ${await readError(res)}`);
}

/**
 * Set a case's deadline and/or urgency. Only the keys passed are written — `dueAt: null` clears the
 * deadline, an absent key leaves that attribute alone. `dueAt` must be an ISO instant WITH a
 * timezone (the server refuses offset-less values, which would otherwise mean different instants on
 * different machines); `Date.toISOString()` produces exactly that.
 */
export async function updateWorkOrder(
  instanceId: string,
  patch: { dueAt?: string | null; priority?: number },
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/work-order`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders(), "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`Cập nhật việc thất bại: ${await readError(res)}`);
}

/**
 * A case's cast + the caller's own roles on it (Phase E3a). Reading only needs `viewer`.
 *
 * `myRoles` is the server's verdict, not a preference: it is what the engine checks
 * `transition.role` against and what decides which gated fields come back unmasked.
 */
export async function listCaseParticipants(instanceId: string): Promise<CaseCast> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/participants`,
    { headers: ownerHeaders() },
  );
  if (!res.ok) throw new Error(`Tải vai trò trên case thất bại: ${await readError(res)}`);
  return (await res.json()) as CaseCast;
}

/** Cast a workspace member into a role — the server requires run access (a viewer gets 403). */
export async function addCaseParticipant(
  instanceId: string,
  input: { roleCode: string; userId: string },
): Promise<CaseParticipant> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/participants`,
    {
      method: "POST",
      headers: { ...ownerHeaders(), "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(`Thêm vai trò thất bại: ${await readError(res)}`);
  return (await res.json()) as CaseParticipant;
}

/** Remove someone from a case's cast (run access required). */
export async function removeCaseParticipant(
  instanceId: string,
  participantId: string,
): Promise<void> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/participants/${encodeURIComponent(participantId)}`,
    { method: "DELETE", headers: ownerHeaders() },
  );
  if (!res.ok) throw new Error(`Xóa vai trò thất bại: ${await readError(res)}`);
}

/** A case's comment thread, oldest first. Reading only needs `viewer` on the project. */
export async function listCaseComments(instanceId: string): Promise<CaseComment[]> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/comments`,
    { headers: ownerHeaders() },
  );
  if (!res.ok) throw new Error(`Tải bình luận thất bại: ${await readError(res)}`);
  return (await res.json()) as CaseComment[];
}

/** Append a comment — the server requires run access, so a viewer gets a 403 here. */
export async function addCaseComment(instanceId: string, body: string): Promise<CaseComment> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/comments`,
    {
      method: "POST",
      headers: { ...ownerHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) throw new Error(`Gửi bình luận thất bại: ${await readError(res)}`);
  return (await res.json()) as CaseComment;
}
