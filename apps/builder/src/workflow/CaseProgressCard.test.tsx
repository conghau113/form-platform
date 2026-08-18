import type {
  StatusCatalogEntry,
  WorkflowDefinition,
  WorkflowInstance,
} from "@org/workflow-schema";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseProgressCard } from "./CaseProgressCard";

// draft --submit--> review --approve--> done. `done` has no outgoing transition, so a case sitting
// on it is terminal.
const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "draft",
  nodes: [
    { id: "draft", status: "Nháp" },
    { id: "review", status: "Đang duyệt" },
    { id: "done", status: "Hoàn tất" },
  ],
  transitions: [
    { id: "t1", from: "draft", to: "review", action: "submit", i18n: { action: { vi: "Gửi" } } },
    { id: "t2", from: "review", to: "done", action: "approve" },
  ],
};

const byCode: ReadonlyMap<string, StatusCatalogEntry> = new Map();
const nameOf = (userId: string | null | undefined) => (userId === "u1" ? "Nguyễn An" : null);

const instanceAt = (current: string, history: WorkflowInstance["history"]): WorkflowInstance => ({
  id: "case-1",
  definitionId: "wf",
  definitionVersion: 1,
  current,
  data: {},
  history,
});

/** The row whose node label is `label` — assertions target one row, not the whole card. Each row is
 *  an antd `Space`, so the nearest `.ant-space` above the label IS the row (the label's immediate
 *  parent is only that row's `ant-space-item` wrapper). */
const rowOf = (label: string): HTMLElement =>
  screen.getByText(label).closest(".ant-space") as HTMLElement;

function renderCard(instance: WorkflowInstance, locale?: string) {
  return render(
    <CaseProgressCard
      def={def}
      view={def}
      instance={instance}
      byCode={byCode}
      nameOf={nameOf}
      locale={locale}
    />,
  );
}

describe("CaseProgressCard (E1)", () => {
  it("shows every node of the definition, not just the current one", () => {
    renderCard(instanceAt("draft", []));
    expect(screen.getByText("Nháp")).toBeTruthy();
    expect(screen.getByText("Đang duyệt")).toBeTruthy();
    expect(screen.getByText("Hoàn tất")).toBeTruthy();
  });

  it("marks the node the case is on Đang xử lý while the case can still advance", () => {
    renderCard(instanceAt("review", [{ from: "draft", to: "review", action: "submit", at: "x" }]));
    expect(within(rowOf("Đang duyệt")).getByText("Đang xử lý")).toBeTruthy();
    expect(screen.queryByText("Kết thúc")).toBeNull();
  });

  it("marks it Kết thúc — NOT Đang xử lý — once the case sits on a terminal node", () => {
    // The screen already says "Trạng thái kết thúc — không còn hành động" for this case; the
    // progress row must not contradict it.
    renderCard(
      instanceAt("done", [
        { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
        { from: "review", to: "done", action: "approve", at: "2026-08-17T10:00:00.000Z" },
      ]),
    );
    expect(within(rowOf("Hoàn tất")).getByText("Kết thúc")).toBeTruthy();
    expect(screen.queryByText("Đang xử lý")).toBeNull();
  });

  it("reports who left a done node, and the LOCALIZED action label", () => {
    renderCard(
      instanceAt("review", [
        {
          from: "draft",
          to: "review",
          action: "submit",
          at: "2026-08-17T09:00:00.000Z",
          actor: "u1",
        },
      ]),
      "vi",
    );
    const row = rowOf("Nháp");
    expect(within(row).getByText("Xong")).toBeTruthy();
    // "Gửi", not the raw engine id "submit".
    expect(row.textContent).toContain("Gửi");
    expect(row.textContent).not.toContain("submit");
    expect(row.textContent).toContain("Nguyễn An");
  });

  it("shows no name at all for an actor it cannot resolve — never a raw user id", () => {
    const row = renderCard(
      instanceAt("review", [
        {
          from: "draft",
          to: "review",
          action: "submit",
          at: "2026-08-17T09:00:00.000Z",
          actor: "u-unknown",
        },
      ]),
    ).container;
    expect(row.textContent).not.toContain("u-unknown");
  });

  it("says NOTHING about a row it cannot place, rather than claiming Chưa tới", () => {
    // `localizeWorkflow` overwrites ANY attribute named in a node's i18n map — `id` included — so a
    // localized view can carry ids that no longer match the definition. Two things must hold: it
    // must not take the Run view down, AND it must not assert "Chưa tới" about a node the case may
    // be standing on right now.
    const view: WorkflowDefinition = {
      ...def,
      nodes: def.nodes.map((n) => ({ ...n, id: `${n.id}-vi` })),
    };
    expect(() =>
      render(
        <CaseProgressCard
          def={def}
          view={view}
          instance={instanceAt("draft", [])}
          byCode={byCode}
          nameOf={nameOf}
          locale={undefined}
        />,
      ),
    ).not.toThrow();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("Chưa tới")).toBeNull();
    expect(screen.queryByText("Đang xử lý")).toBeNull();
  });

  it("labels a done row with the action of the edge leaving THAT node", () => {
    // `submit` is used by two edges with different labels. The row is anchored to `draft`, so it
    // must read "Gửi" — the label on `draft`'s own edge — not the other edge's wording.
    //
    // The conflicting edge is listed FIRST on purpose: `actionLabel` returns the first match, so
    // with the other order the correct answer would come out even without narrowing by `from`, and
    // this test would prove nothing.
    const shared: WorkflowDefinition = {
      ...def,
      transitions: [
        {
          id: "t3",
          from: "review",
          to: "done",
          action: "submit",
          i18n: { action: { vi: "Chuyển tiếp" } },
        },
        ...def.transitions,
      ],
    };
    render(
      <CaseProgressCard
        def={shared}
        view={shared}
        instance={instanceAt("review", [
          { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
        ])}
        byCode={byCode}
        nameOf={nameOf}
        locale="vi"
      />,
    );
    const row = rowOf("Nháp");
    expect(row.textContent).toContain("Gửi");
    expect(row.textContent).not.toContain("Chuyển tiếp");
  });
});

describe("CaseProgressCard — a case standing in several places (E3a)", () => {
  // A fork whose two branches differ in exactly the way the label depends on: `dead` has no
  // outgoing transition, `live` does.
  const forkedDef: WorkflowDefinition = {
    workflowVersion: 1,
    id: "wf2",
    title: "WF2",
    start: "draft",
    nodes: [
      { id: "draft", status: "Nháp" },
      { id: "dead", status: "Nhánh cụt" },
      { id: "live", status: "Nhánh còn việc" },
      { id: "after", status: "Sau" },
    ],
    transitions: [
      { id: "a", from: "draft", to: "dead", action: "toDead" },
      { id: "b", from: "draft", to: "live", action: "toLive" },
      { id: "c", from: "live", to: "after", action: "go" },
    ],
  };

  it("judges each standing branch on its OWN node, not on the representative one", () => {
    // `current` names the dead branch, so a single shared flag would call the branch that still has
    // work "Kết thúc" — and swapping the token order would flip the lie to the other row. Neither
    // row's label may depend on which branch happens to be listed first.
    const forked: WorkflowInstance = {
      id: "case-2",
      definitionId: "wf2",
      definitionVersion: 1,
      current: "dead",
      data: {},
      history: [],
      tokens: [
        { id: "s-1-0", at: "dead", scope: "s-1" },
        { id: "s-1-1", at: "live", scope: "s-1" },
      ],
      scopes: { "s-1": { forkNode: "draft", expected: 2, parent: null } },
    };
    render(
      <CaseProgressCard
        def={forkedDef}
        view={forkedDef}
        instance={forked}
        byCode={byCode}
        nameOf={nameOf}
        locale={undefined}
      />,
    );
    expect(within(rowOf("Nhánh cụt")).getByText("Kết thúc")).toBeTruthy();
    expect(within(rowOf("Nhánh còn việc")).getByText("Đang xử lý")).toBeTruthy();
  });
});
