/**
 * The work-order list query as pure state (product-roadmap Phase E). Paging, sorting and filtering
 * all happen SERVER-side, so the screen's whole data-fetching identity is this object — it is both
 * the request and the react-query cache key. Keeping it here (no React, no antd) is what makes the
 * mapping testable: the table hands back antd's sorter shape, the filters hand back patches, and
 * every path goes through one place.
 */

/** Columns the server can sort by — mirrors `WORK_ORDER_SORTS` in the api's
 *  `list-work-orders.dto.ts`. `label` is deliberately absent there: it is often null. */
export const WORK_ORDER_SORTS = ["updatedAt", "createdAt", "current"] as const;
export type WorkOrderSort = (typeof WORK_ORDER_SORTS)[number];

/** The filter half of the query — everything the user can narrow the list by. */
export interface WorkOrderFilters {
  workflowId?: string;
  /** A node id of the selected workflow (only meaningful together with `workflowId`). */
  current?: string;
  /** Engine category: `start` | `normal` | `end`. */
  statusKind?: string;
  /** A member id, or the sentinels `me` (the signed-in user) / `none` (unassigned). */
  assignee?: string;
  /** Case-insensitive substring of the case label. */
  q?: string;
}

export interface WorkOrderQueryState extends WorkOrderFilters {
  page: number;
  pageSize: number;
  sort: WorkOrderSort;
  dir: "asc" | "desc";
}

/** Freshest first — the default a work queue should open on. */
export const DEFAULT_WORK_ORDER_QUERY: WorkOrderQueryState = {
  page: 1,
  pageSize: 20,
  sort: "updatedAt",
  dir: "desc",
};

/**
 * Serialize to the `GET /work-orders` query string. Keys are emitted in a FIXED order and empty
 * values are dropped, so two equivalent states produce the same string — that is what lets the
 * result double as a cache key.
 */
export function workOrderSearch(state: WorkOrderQueryState): string {
  const params = new URLSearchParams();
  if (state.workflowId) params.set("workflowId", state.workflowId);
  if (state.current) params.set("current", state.current);
  if (state.statusKind) params.set("statusKind", state.statusKind);
  if (state.assignee) params.set("assignee", state.assignee);
  const q = state.q?.trim();
  if (q) params.set("q", q);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  params.set("sort", state.sort);
  params.set("dir", state.dir);
  return params.toString();
}

/**
 * Apply a filter change. Narrowing always returns to page 1 — staying on page 5 of a list that just
 * shrank to one page reads as "my work disappeared".
 *
 * Any change to the workflow (cleared OR swapped) also drops the node status: a state id belongs to
 * one graph, so carrying `review` from workflow A into workflow B AND-s two filters that can never
 * both match, leaving an empty list and a picker showing a raw id.
 */
export function applyFilters(
  state: WorkOrderQueryState,
  patch: WorkOrderFilters,
): WorkOrderQueryState {
  const next = { ...state, ...patch, page: 1 };
  const switchedWorkflow = "workflowId" in patch && patch.workflowId !== state.workflowId;
  // A patch that sets both at once (a preset, a deep link) means what it says; only an inherited
  // status is dropped.
  if ((switchedWorkflow && !("current" in patch)) || !next.workflowId) next.current = undefined;
  return next;
}

/**
 * Map antd Table's `onChange` sorter back into the query. An unsorted column (the user cleared the
 * arrow) falls back to the default order rather than leaving the previous sort silently applied,
 * and a column the server cannot sort by is ignored for the same reason.
 */
export function applySort(
  state: WorkOrderQueryState,
  field: unknown,
  order: string | null | undefined,
): WorkOrderQueryState {
  const sortable = (WORK_ORDER_SORTS as readonly string[]).includes(String(field));
  if (!order || !sortable) {
    return { ...state, sort: DEFAULT_WORK_ORDER_QUERY.sort, dir: DEFAULT_WORK_ORDER_QUERY.dir };
  }
  return { ...state, sort: field as WorkOrderSort, dir: order === "ascend" ? "asc" : "desc" };
}
