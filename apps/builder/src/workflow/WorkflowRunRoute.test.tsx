import { type FormSchema, migrate } from "@org/form-schema";
import { advance, createInstance } from "@org/workflow-core";
import type {
  StatusCatalogEntry,
  WorkflowDefinition,
  WorkflowInstance,
} from "@org/workflow-schema";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../query/testing";
import { CaseConflictError } from "./client";

/**
 * The Run view's branch picker (E3c, parallel track) — the ONE place the picker is wired to what an
 * action actually fires. `run-branches` can be perfectly tested and this whole component deleted
 * without a single suite going red, which is exactly what happened to `progressTag` in E1.
 *
 * Hooks are mocked, not `client`: the seam under test is component → hook. The client and the hook
 * have their own tests (`client.test.ts`, `useAdvanceInstance.test.tsx`), and stubbing `fetch` for
 * all six data hooks would measure the mocks more than the view.
 */
const advanceSpy = vi.fn();
let instance: WorkflowInstance;

vi.mock("./useWorkflowInstances", () => ({
  useWorkflowInstance: () => ({ instance, loading: false, error: null }),
  useWorkflowInstances: () => ({ instances: [], loading: false }),
  useAdvanceInstance: () => advanceSpy,
  useStartInstance: () => vi.fn(),
}));

vi.mock("./useFormDefinition", () => ({
  // Keyed by the bound form id, so "the form on screen is the selected branch's" is a real claim.
  useFormDefinition: (formId?: string) => ({
    definition: formId ? forms[formId] : null,
    loading: false,
  }),
}));

// `resolveStatusStyle` + `indexStatusCatalog` stay REAL: the picker's labels are only worth
// asserting if they go through the same catalog resolution the status Tag uses.
vi.mock("./status-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./status-catalog")>()),
  useStatusCatalog: () => ({ entries: catalog, loading: false }),
}));

// `hasFunction` stays REAL — mocking it wholesale would silently decide the `canSeeMembers` branch.
vi.mock("../auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth")>()),
  useAuth: () => ({ user: { id: "u1" }, functions: ["workflow.run"] }),
}));

vi.mock("../operate/useWorkOrders", () => ({
  useAssignees: () => ({ assignees: [], nameOf: () => null }),
  useAssignCase: () => vi.fn(),
  useUpdateWorkOrder: () => vi.fn(),
}));

vi.mock("../operate/useCaseParticipants", () => ({
  useCaseParticipants: () => ({ cast: { myRoles: [] }, loading: false }),
}));

vi.mock("../operate/CaseComments", () => ({ CaseComments: () => null }));
vi.mock("../operate/CaseParticipants", () => ({ CaseParticipants: () => null }));

const { CaseRunner } = await import("./WorkflowRunRoute");

/**
 * F-diff — the two branches fire DIFFERENT actions and bind DIFFERENT forms.
 *
 * Deliberately not the same fixture the API tests use (there, both branches answer to `approve`,
 * which is what makes them ambiguous). With identical actions, `runActions(current)` and
 * `runActions(selected.at)` return the same buttons, so a view still anchored to `current` would
 * look correct — the mutation this file exists to catch would pass.
 */
const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "Duyệt song song",
  start: "draft",
  nodes: [
    { id: "draft", status: "Nháp" },
    { id: "F", status: "Tách", gateway: "fork" },
    { id: "tech", status: "Kỹ thuật", statusCode: "TECH", formId: "form-tech" },
    { id: "fin", status: "Tài chính", formId: "form-fin" },
    { id: "J", status: "Gộp", gateway: "join" },
    { id: "done", status: "Hoàn tất", kind: "end" },
  ],
  transitions: [
    { id: "t1", from: "draft", to: "F", action: "submit" },
    { id: "ft", from: "F", to: "tech", action: "enterTech" },
    { id: "ff", from: "F", to: "fin", action: "enterFin" },
    { id: "at", from: "tech", to: "J", action: "duyetKyThuat" },
    { id: "af", from: "fin", to: "J", action: "duyetTaiChinh" },
    { id: "tj", from: "J", to: "done", action: "merge" },
  ],
};

/** The catalog renames `TECH`, so the picker and the Tag must both show the catalog's words. */
const catalog: StatusCatalogEntry[] = [
  { code: "TECH", label: "Thẩm định kỹ thuật", kind: "normal" },
];

const form = (id: string, label: string): FormSchema =>
  migrate({ formVersion: 1, id, title: label, fields: [{ type: "text", name: "note", label }] });

const forms: Record<string, FormSchema> = {
  "form-tech": form("form-tech", "Ghi chú kỹ thuật"),
  "form-fin": form("form-fin", "Ghi chú tài chính"),
};

/** Same graph, except BOTH fork edges land on `tech` — a case that stands twice in one place, which
 *  a fork is allowed to produce and the engine deliberately does not dedupe. */
const sameNodeDef: WorkflowDefinition = {
  ...def,
  transitions: def.transitions.map((t) => (t.id === "ff" ? { ...t, to: "tech" } : t)),
};

/**
 * A single-branch graph whose two form-bound nodes follow one another, plus one action id used on
 * BOTH edges with a label declared on only one of them.
 *
 * It carries the two claims the parallel fixture cannot: that a token keeps its id while moving
 * between nodes (so the remount key needs the node too), and what an action button is labelled when
 * the edge leaving THIS node has no wording of its own.
 */
const linearDef: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf-linear",
  title: "Tuần tự",
  start: "tech",
  defaultLocale: "vi",
  locales: ["vi"],
  nodes: [
    { id: "tech", status: "Kỹ thuật", statusCode: "TECH", formId: "form-tech" },
    { id: "fin", status: "Tài chính", formId: "form-fin" },
    { id: "done", status: "Hoàn tất", kind: "end" },
  ],
  transitions: [
    { id: "n1", from: "tech", to: "fin", action: "next" },
    { id: "n2", from: "fin", to: "done", action: "next", i18n: { action: { vi: "Kết thúc" } } },
  ],
};

/** Drive the REAL engine to the marking under test — a hand-written `tokens` array would let these
 *  tests agree about a case the engine can never produce. */
function forkedInto(graph: WorkflowDefinition): WorkflowInstance {
  const result = advance(graph, createInstance(graph, { id: "c1" }), "submit");
  if (!result.ok) throw new Error(`fixture did not fork: ${result.reason}`);
  return result.instance;
}

const forked = (): WorkflowInstance => forkedInto(def);

const tokenAt = (inst: WorkflowInstance, node: string): string => {
  const token = inst.tokens?.find((t) => t.at === node);
  if (!token) throw new Error(`no token at ${node}: ${JSON.stringify(inst.tokens)}`);
  return token.id;
};

const mount = () =>
  renderWithQuery(
    <MemoryRouter>
      <CaseRunner def={def} projectId="p1" workflowId="wf" instanceId="c1" />
    </MemoryRouter>,
  );

/**
 * Choose a branch through the antd Select, the way a person does.
 *
 * Narrowed to the dropdown item on purpose. antd puts the same `title` on the closed selector, so a
 * branch that is already selected matches twice; and its `role="option"` elements include a hidden
 * accessibility list whose entries are not the ones a click selects.
 */
async function pickBranch(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: "Nhánh" }));
  const items = await screen.findAllByTitle(label);
  const option = items.find((el) => el.className.includes("ant-select-item-option"));
  if (!option) throw new Error(`no dropdown option labelled "${label}"`);
  await user.click(option);
}

/**
 * The header's status Tag, or `undefined` when there is none.
 *
 * Found by test id rather than by position or text: the assignee/priority tags are also `.ant-tag`,
 * so "the first tag on the page" would silently become the assignee's "Chưa giao" exactly in the
 * case where the status tag is supposed to be ABSENT — turning the assertion that matters into one
 * that can never fail. The picker's closed selector prints the same words too, which rules out
 * matching on text.
 */
function statusTagText(): string | undefined {
  return screen.queryByTestId("case-status")?.textContent ?? undefined;
}

beforeEach(() => {
  advanceSpy.mockReset().mockResolvedValue(undefined);
  instance = forked();
});

describe("CaseRunner — branch picker (E3c, parallel track)", () => {
  it("offers a branch per token, labelled the way the status catalog says", async () => {
    mount();

    const picker = screen.getByRole("combobox", { name: "Nhánh" });
    expect(picker).toBeTruthy();
    expect(screen.getByText("2 nhánh đang chạy")).toBeTruthy();
    // The catalog renames TECH; the picker must not print the node's own `status` instead.
    expect(screen.getByTitle("Thẩm định kỹ thuật")).toBeTruthy();
  });

  it("shows the FIRST branch's action, form and status until another is chosen", async () => {
    mount();

    expect(screen.getByRole("button", { name: "duyetKyThuat" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "duyetTaiChinh" })).toBeNull();
    expect(screen.getByLabelText("Ghi chú kỹ thuật")).toBeTruthy();
    // The control value for `statusTagText`: the catalog's words for the first branch's node.
    expect(statusTagText()).toBe("Thẩm định kỹ thuật");
  });

  it("re-points the actions, the form AND the status tag at the branch that was chosen", async () => {
    const user = userEvent.setup();
    mount();

    await pickBranch(user, "Tài chính");

    // All three, not just the buttons: a view that moved its actions but left the header describing
    // the other branch is the "header says one thing, button does another" failure.
    expect(await screen.findByRole("button", { name: "duyetTaiChinh" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "duyetKyThuat" })).toBeNull();
    expect(screen.getByLabelText("Ghi chú tài chính")).toBeTruthy();
    expect(screen.queryByLabelText("Ghi chú kỹ thuật")).toBeNull();
    // The status Tag specifically — the picker's closed selector prints the same words, so matching
    // on text alone would pass with the header still stuck on the other branch.
    expect(statusTagText()).toBe("Tài chính");
  });

  it("fires the chosen branch's action WITH its token", async () => {
    const user = userEvent.setup();
    const finToken = tokenAt(instance, "fin");
    mount();

    await pickBranch(user, "Tài chính");
    await user.click(await screen.findByRole("button", { name: "duyetTaiChinh" }));

    await waitFor(() =>
      expect(advanceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: "duyetTaiChinh", token: finToken }),
      ),
    );
  });

  it("starts the chosen branch's form empty rather than reusing the other branch's answers", async () => {
    // `useForm` reads `defaultValues` once, and a cached definition means no loading frame between
    // the two branches — without a remount key, React keeps the same form instance and the text
    // typed under one branch is still sitting there (and would be submitted) under the other.
    const user = userEvent.setup();
    mount();

    await user.type(screen.getByLabelText("Ghi chú kỹ thuật"), "chỉ dành cho kỹ thuật");
    await pickBranch(user, "Tài chính");
    await pickBranch(user, "Thẩm định kỹ thuật");

    const back = await screen.findByLabelText("Ghi chú kỹ thuật");
    expect((back as HTMLInputElement).value).toBe("");
  });

  it("keeps two branches parked on the SAME node apart", async () => {
    // A fork may send two edges to one node, and the engine does not dedupe the tokens — so `at` is
    // not a branch's identity. Keyed on `at` alone the form would not remount here, and one branch's
    // answers would be submitted under the other branch's token.
    const user = userEvent.setup();
    instance = forkedInto(sameNodeDef);
    const [first, second] = instance.tokens ?? [];
    renderWithQuery(
      <MemoryRouter>
        <CaseRunner def={sameNodeDef} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Ghi chú kỹ thuật"), "nhánh một");
    // Both options carry the same node label, so the token id is what tells them apart at all.
    await pickBranch(user, `Thẩm định kỹ thuật · ${second.id}`);

    expect((screen.getByLabelText("Ghi chú kỹ thuật") as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "duyetKyThuat" }));
    await waitFor(() =>
      expect(advanceSpy).toHaveBeenCalledWith(expect.objectContaining({ token: second.id })),
    );
    expect(advanceSpy).not.toHaveBeenCalledWith(expect.objectContaining({ token: first.id }));
  });

  it("starts the next node's form empty when ONE branch moves on", async () => {
    // The other half of the remount key. An ordinary move carries a token's id with it
    // (`engine.ts`: `t.id === token.id ? {...t, at: transition.to}`), so keyed on `tokenId` alone
    // the key would not change as the branch walks from one form-bound node to the next, and the
    // previous node's answers would be submitted against the new node's schema.
    const user = userEvent.setup();
    instance = createInstance(linearDef, { id: "c1" });
    const render = () =>
      renderWithQuery(
        <MemoryRouter>
          <CaseRunner def={linearDef} projectId="p1" workflowId="wf" instanceId="c1" />
        </MemoryRouter>,
      );
    const { rerender } = render();

    await user.type(screen.getByLabelText("Ghi chú kỹ thuật"), "viết ở bước một");
    const moved = advance(linearDef, instance, "next");
    if (!moved.ok) throw new Error(moved.reason);
    // The precondition that makes this test about `at`: the token id did NOT change.
    expect(moved.instance.tokens?.[0].id).toBe(instance.tokens?.[0].id);
    instance = moved.instance;
    rerender(
      <MemoryRouter>
        <CaseRunner def={linearDef} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    const next = await screen.findByLabelText("Ghi chú tài chính");
    expect((next as HTMLInputElement).value).toBe("");
  });

  it("keeps the chosen branch across a refetch, and falls back when a join swallowed it", async () => {
    // The picker holds a token ID, not an index, so an unrelated refetch must not move the user to
    // another branch — and when the branch really is gone, the view must land on the head of the
    // marking instead of blanking out.
    const user = userEvent.setup();
    const finToken = tokenAt(instance, "fin");
    const { rerender } = mount();
    await pickBranch(user, "Tài chính");

    // Same case, new object (what react-query hands back after an invalidate).
    instance = { ...instance, data: { ...instance.data } };
    rerender(
      <MemoryRouter>
        <CaseRunner def={def} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "duyetTaiChinh" })).toBeTruthy();

    // Now the other branch approved and the join released, consuming BOTH tokens for a new id.
    const merged = advance(def, instance, "duyetKyThuat", { token: tokenAt(instance, "tech") });
    if (!merged.ok) throw new Error(merged.reason);
    const settled = advance(def, merged.instance, "duyetTaiChinh", { token: finToken });
    if (!settled.ok) throw new Error(settled.reason);
    instance = settled.instance;
    expect(instance.tokens?.some((t) => t.id === finToken)).toBe(false);
    rerender(
      <MemoryRouter>
        <CaseRunner def={def} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("combobox", { name: "Nhánh" })).toBeNull();
    expect(statusTagText()).toBe("Hoàn tất");
  });

  it("explains a conflict in its own words instead of repeating the server's", async () => {
    // The route half of the 409 handling (the cache half lives in `useAdvanceInstance.test.tsx`).
    // Without this, deleting the whole `instanceof CaseConflictError` branch leaves every test green.
    const user = userEvent.setup();
    advanceSpy.mockRejectedValue(
      new CaseConflictError("Workflow instance changed; reload and retry"),
    );
    mount();

    await user.click(screen.getByRole("button", { name: "duyetKyThuat" }));

    expect(await screen.findByText(/Case vừa được người khác cập nhật/)).toBeTruthy();
    expect(screen.queryByText(/reload and retry/)).toBeNull();
  });
});

describe("CaseRunner — the definition changed under a running case (E3c, parallel track)", () => {
  it("labels a branch whose node is gone with its raw id instead of inventing words for it", async () => {
    // Definitions are editable while cases run, so a token can be standing on a node the graph no
    // longer has. Anything friendlier than the id here would be a sentence about a node nobody can
    // look up — and the view must still render rather than blank out.
    const trimmed: WorkflowDefinition = {
      ...def,
      nodes: def.nodes.filter((n) => n.id !== "fin"),
    };

    renderWithQuery(
      <MemoryRouter>
        <CaseRunner def={trimmed} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    expect(screen.getByText("2 nhánh đang chạy")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Nhánh" }));
    expect(await screen.findByTitle("fin")).toBeTruthy();

    await user.click(screen.getByTitle("fin"));

    // Nowhere to go is not the same as finished. Calling this "terminal" would tell someone the
    // branch is done when in fact its node was deleted out from under the case.
    expect(await screen.findByText("Trạng thái này không còn trong workflow")).toBeTruthy();
    expect(screen.queryByText(/Trạng thái kết thúc/)).toBeNull();
  });
});

describe("CaseRunner — a single-branch case is untouched (E3c, parallel track)", () => {
  beforeEach(() => {
    // Every case running today. It must look and behave exactly as it did before this slice.
    instance = createInstance(def, { id: "c1" });
  });

  it("shows no picker", () => {
    mount();

    expect(screen.queryByRole("combobox", { name: "Nhánh" })).toBeNull();
  });

  it("fires WITHOUT a token key at all", async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(advanceSpy).toHaveBeenCalled());
    // `objectContaining` would pass with a token present, which is the mutation this pins against.
    expect(Object.keys(advanceSpy.mock.calls[0][0]).sort()).toEqual(["action", "data"]);
  });
});

describe("CaseRunner — a branch parked on a join (E3c, parallel track)", () => {
  beforeEach(() => {
    const start = forked();
    const first = advance(def, start, "duyetKyThuat", { token: tokenAt(start, "tech") });
    if (!first.ok) throw new Error(first.reason);
    instance = first.instance;
  });

  it("does not claim a branch on a FORK is waiting for anyone", async () => {
    // No editing needed to reach this: `createInstance` parks the first token on `def.start` and
    // does NOT settle, so a workflow whose start IS a fork stands here from the moment it is
    // created. Nobody is being waited for, so the join wording would name colleagues who do not
    // exist. Still no buttons: firing a fork's outgoing edge by hand moves one token and skips the
    // spawn the fork exists to do.
    const startIsFork: WorkflowDefinition = { ...def, start: "F" };
    instance = createInstance(startIsFork, { id: "c1" });
    expect(instance.tokens).toHaveLength(1);
    renderWithQuery(
      <MemoryRouter>
        <CaseRunner def={startIsFork} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Nhánh đang đứng trên điểm rẽ — không thao tác trực tiếp được"),
    ).toBeTruthy();
    expect(screen.queryByText("Đang chờ nhánh khác")).toBeNull();
    expect(screen.queryByRole("button", { name: "enterTech" })).toBeNull();
  });

  it("does not claim a LONE branch on a join is waiting for anyone either", async () => {
    // A single root-scoped token on a join is releasable, not blocked: the engine's `expected`
    // defaults to 1, so it walks straight through on the next advance. "Đang chờ nhánh khác" would
    // be false. What IS true is only that this view will not fire a gateway's edge by hand.
    instance = {
      id: "c1",
      definitionId: "wf",
      definitionVersion: 1,
      current: "J",
      data: {},
      history: [],
    };
    mount();

    expect(
      await screen.findByText("Nhánh đang ở điểm gộp — không thao tác trực tiếp được"),
    ).toBeTruthy();
    expect(screen.queryByText("Đang chờ nhánh khác")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Nhánh" })).toBeNull();
  });

  it("says it is waiting, and offers no action that would walk it past the join", async () => {
    const user = userEvent.setup();
    mount();

    // Pick the OTHER branch first, so choosing "Gộp" is a real selection rather than a click that
    // re-selects what was already the default (a join parks in the first sibling's slot, so it is
    // `branches[0]` here and the picker's initial value anyway).
    await pickBranch(user, "Tài chính");
    expect(screen.getByRole("button", { name: "duyetTaiChinh" })).toBeTruthy();
    await pickBranch(user, "Gộp");

    expect(await screen.findByText("Đang chờ nhánh khác")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "merge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "duyetTaiChinh" })).toBeNull();
    // Not "terminal": the branch has not finished, it is waiting on a colleague.
    expect(screen.queryByText(/Trạng thái kết thúc/)).toBeNull();
  });
});

describe("CaseRunner — a case whose marking was emptied (E3c, parallel track)", () => {
  beforeEach(() => {
    instance = { ...forked(), tokens: [] };
  });

  it("reports the damage instead of pretending the case is somewhere", () => {
    mount();

    expect(screen.getByText("Case không có nhánh nào đang chạy")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "duyetKyThuat" })).toBeNull();
    expect(screen.queryByText(/Trạng thái kết thúc/)).toBeNull();
    // And no status at all. `instance.current` still says "tech", so a header that fell back to it
    // would put a confident status beside the error — the damaged case wearing a healthy face.
    expect(statusTagText()).toBeUndefined();
  });
});

describe("CaseRunner — action labels follow the branch's own edge (E3c, parallel track)", () => {
  // Actions now come from the SELECTED branch, so their labels are looked up anchored to that node
  // (`actionLabel(..., selected.at)`). Two edges may share one action id with different wording;
  // without the anchor a button would print the other node's words. The cost, pinned here so it is a
  // decision and not a surprise: an edge that declares no label of its own no longer borrows a
  // sibling edge's — it falls back to the raw action id.
  it("shows the raw id where THIS node's edge has no label, and the label where it does", async () => {
    instance = createInstance(linearDef, { id: "c1" });
    const { rerender } = renderWithQuery(
      <MemoryRouter>
        <CaseRunner def={linearDef} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "next" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kết thúc" })).toBeNull();

    const moved = advance(linearDef, instance, "next");
    if (!moved.ok) throw new Error(moved.reason);
    instance = moved.instance;
    rerender(
      <MemoryRouter>
        <CaseRunner def={linearDef} projectId="p1" workflowId="wf" instanceId="c1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "Kết thúc" })).toBeTruthy();
  });
});

/** The case title renders — enough to catch a mount that throws (a missing Router or auth provider
 *  takes the whole component down before anything reaches the screen). */
it("renders inside a Router", () => {
  const { container } = mount();
  expect(within(container).getByText("Duyệt song song")).toBeTruthy();
});
