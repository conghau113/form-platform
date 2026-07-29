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
