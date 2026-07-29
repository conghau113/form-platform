import { describe, expect, it } from "vitest";
import {
  applyFilters,
  applySort,
  DEFAULT_WORK_ORDER_QUERY,
  type WorkOrderQueryState,
  workOrderSearch,
} from "./work-order-query";

const base: WorkOrderQueryState = DEFAULT_WORK_ORDER_QUERY;

describe("work-order query state (Phase E, server-side paging)", () => {
  it("serializes only the filters that are set, in a stable order", () => {
    expect(workOrderSearch(base)).toBe("page=1&pageSize=20&sort=updatedAt&dir=desc");
    expect(workOrderSearch({ ...base, assignee: "me", workflowId: "wf1" })).toBe(
      "workflowId=wf1&assignee=me&page=1&pageSize=20&sort=updatedAt&dir=desc",
    );
  });

  it("drops a blank search term and trims the rest", () => {
    expect(workOrderSearch({ ...base, q: "   " })).not.toContain("q=");
    expect(workOrderSearch({ ...base, q: "  hồ sơ " })).toContain("q=h%E1%BB%93+s%C6%A1");
  });

  it("returns to page 1 whenever a filter narrows", () => {
    const onPage5 = { ...base, page: 5 };
    expect(applyFilters(onPage5, { assignee: "none" })).toMatchObject({
      page: 1,
      assignee: "none",
    });
  });

  it("clears the node status when the workflow filter is cleared OR swapped", () => {
    const scoped = applyFilters(base, { workflowId: "wf1", current: "review" });
    expect(scoped.current).toBe("review");
    expect(applyFilters(scoped, { workflowId: undefined }).current).toBeUndefined();
    // A state id from wf1 can never match wf2 — keeping it would yield a permanently empty list.
    expect(applyFilters(scoped, { workflowId: "wf2" }).current).toBeUndefined();
    // An unrelated filter change leaves it alone.
    expect(applyFilters(scoped, { assignee: "me" }).current).toBe("review");
  });

  it("maps antd sorter order to the server's sort/dir", () => {
    expect(applySort(base, "createdAt", "ascend")).toMatchObject({
      sort: "createdAt",
      dir: "asc",
    });
    expect(applySort(base, "current", "descend")).toMatchObject({ sort: "current", dir: "desc" });
  });

  it("falls back to the default order when sorting is cleared or unsupported", () => {
    const sorted = applySort(base, "createdAt", "ascend");
    expect(applySort(sorted, "createdAt", null)).toMatchObject({ sort: "updatedAt", dir: "desc" });
    // `label` is not sortable server-side — never send it.
    expect(applySort(sorted, "label", "ascend")).toMatchObject({ sort: "updatedAt", dir: "desc" });
  });
});
