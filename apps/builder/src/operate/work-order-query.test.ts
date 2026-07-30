import { describe, expect, it } from "vitest";
import { isOverdue, PRIORITY_OPTIONS, priorityLabel } from "./priority";
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

describe("deadline + urgency query (Phase E2)", () => {
  it("serializes the new filters, and `overdue` only when it is on", () => {
    expect(workOrderSearch({ ...base, priority: 3 })).toContain("priority=3");
    expect(workOrderSearch({ ...base, overdue: true })).toContain("overdue=true");
    // Off must produce the same key-set as never having touched the control, or two equivalent
    // states would cache under different keys.
    expect(workOrderSearch({ ...base, overdue: false })).toBe(workOrderSearch(base));
  });

  it("sorts by deadline and urgency", () => {
    expect(applySort(base, "dueAt", "ascend")).toMatchObject({ sort: "dueAt", dir: "asc" });
    expect(applySort(base, "priority", "descend")).toMatchObject({
      sort: "priority",
      dir: "desc",
    });
  });

  it("returns to page 1 when narrowing by urgency or deadline", () => {
    expect(applyFilters({ ...base, page: 4 }, { priority: 3 })).toMatchObject({
      page: 1,
      priority: 3,
    });
    expect(applyFilters({ ...base, page: 4 }, { overdue: true })).toMatchObject({
      page: 1,
      overdue: true,
    });
  });

  it("names the three urgency levels, highest first", () => {
    expect(PRIORITY_OPTIONS.map((o) => o.value)).toEqual([3, 2, 1]);
    expect(priorityLabel(3)).toBe("Cao");
    // An unknown level (a newer api) degrades to the raw number rather than rendering blank.
    expect(priorityLabel(9)).toBe("9");
  });

  it("calls a case overdue only while it is still open", () => {
    const now = new Date("2026-07-30T00:00:00.000Z");
    const past = "2020-01-01T00:00:00.000Z";
    expect(isOverdue(past, "normal", now)).toBe(true);
    expect(isOverdue(past, null, now)).toBe(true); // pre-Phase-E case, no status yet
    expect(isOverdue(past, "end", now)).toBe(false); // finished — its deadline stopped mattering
    expect(isOverdue("2999-01-01T00:00:00.000Z", "normal", now)).toBe(false);
    expect(isOverdue(null, "normal", now)).toBe(false);
  });
});
