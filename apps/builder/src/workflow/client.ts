import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../workspace/config";
import type { WorkflowInstanceSummary, WorkflowSummary } from "../workspace/types";

/**
 * Thin client for the workflow api (Workflow track WF0: `/workflows`). Mirrors `workspace/client.ts`
 * — `fetch` lives ONLY here, a non-OK response throws with the server's message, and every request
 * carries the `x-owner-id` owner header ({@link ownerHeaders}). The body is the pure workflow
 * contract; org metadata (project/folder/title) is the workspace's concern, returned as summaries.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const jsonHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  ...ownerHeaders(),
});

/** List workflow summaries (no body) for a project, optionally one folder. */
export async function listWorkflows(
  projectId: string,
  folderId?: string,
): Promise<WorkflowSummary[]> {
  const params = new URLSearchParams({ projectId });
  if (folderId) params.set("folderId", folderId);
  const res = await apiFetch(`${API_BASE}/workflows?${params}`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List workflows failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowSummary[];
}

export async function loadWorkflow(id: string): Promise<WorkflowDefinition> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(id)}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load workflow failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowDefinition;
}

/** Upsert a workflow contract, optionally placing it in a project/folder (new ones only). */
export async function saveWorkflow(
  body: WorkflowDefinition,
  placement?: { projectId?: string; folderId?: string | null },
): Promise<WorkflowDefinition> {
  const params = new URLSearchParams();
  if (placement?.projectId) params.set("projectId", placement.projectId);
  if (placement?.folderId) params.set("folderId", placement.folderId);
  const query = params.toString();
  const res = await apiFetch(`${API_BASE}/workflows${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Save workflow failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowDefinition;
}

/** Move a workflow to another folder (`folderId: null` → project root). */
export async function moveWorkflow(id: string, folderId: string | null): Promise<WorkflowSummary> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(id)}/move`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ folderId }),
  });
  if (!res.ok) throw new Error(`Move workflow failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowSummary;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Delete workflow failed: ${await readError(res)}`);
}

/* --- Workflow runtime / instances (WF3) ---------------------------------------------------------
 * The server is authoritative: it loads the definition + instance, runs the engine (`advance`:
 * JSONLogic guards + role checks), and persists. The client only POSTs `{action, data}` and reads
 * the new instance back. Cases nest under their workflow for start/list; a single case is addressed
 * by its own id under `/workflow-instances`. */

/** Start a fresh case of a workflow at its start node (422 if the graph is invalid). */
export async function startInstance(
  workflowId: string,
  data?: Record<string, unknown>,
): Promise<WorkflowInstance> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(workflowId)}/instances`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`Start case failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowInstance;
}

/** List a workflow's cases (summaries, no body), newest first. */
export async function listInstances(workflowId: string): Promise<WorkflowInstanceSummary[]> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(workflowId)}/instances`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`List cases failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowInstanceSummary[];
}

/** Load a single running case by id. */
export async function getInstance(instanceId: string): Promise<WorkflowInstance> {
  const res = await apiFetch(`${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Load case failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowInstance;
}

/** Fire an action against a case; the server advances it (or 422s with the failure reason). */
export async function advanceInstance(
  instanceId: string,
  input: { action: string; data?: Record<string, unknown>; roles?: string[] },
): Promise<WorkflowInstance> {
  const res = await apiFetch(
    `${API_BASE}/workflow-instances/${encodeURIComponent(instanceId)}/advance`,
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) },
  );
  if (!res.ok) throw new Error(`Advance case failed: ${await readError(res)}`);
  return (await res.json()) as WorkflowInstance;
}
