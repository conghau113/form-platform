import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../query/testing";
import { CaseParticipants } from "./CaseParticipants";

const api = vi.hoisted(() => ({
  listCaseParticipants: vi.fn(),
  addCaseParticipant: vi.fn(),
  removeCaseParticipant: vi.fn(),
}));

vi.mock("./client", () => api);

const MEMBERS = [
  { id: "u1", email: "an@example.com", displayName: "Nguyễn An" },
  { id: "u2", email: "binh@example.com", displayName: null },
];

const nameOf = (userId: string | null | undefined) =>
  MEMBERS.find((m) => m.id === userId)?.displayName ?? null;

function render(canRun: boolean) {
  return renderWithQuery(
    <CaseParticipants
      instanceId="case-1"
      canRun={canRun}
      roleOptions={["manager", "hr"]}
      nameOf={nameOf}
      members={MEMBERS}
    />,
  );
}

describe("CaseParticipants (Phase E3a)", () => {
  beforeEach(() => {
    api.listCaseParticipants.mockReset();
    api.addCaseParticipant.mockReset();
    api.removeCaseParticipant.mockReset();
    api.listCaseParticipants.mockResolvedValue({
      participants: [
        {
          id: "p1",
          instanceId: "case-1",
          roleCode: "manager",
          userId: "u1",
          addedBy: "u2",
          createdAt: "2026-08-01T02:00:00.000Z",
        },
      ],
      myRoles: ["editor", "manager"],
    });
    api.addCaseParticipant.mockResolvedValue({
      id: "p2",
      instanceId: "case-1",
      roleCode: "hr",
      userId: "u2",
      addedBy: "u1",
      createdAt: "2026-08-01T03:00:00.000Z",
    });
    api.removeCaseParticipant.mockResolvedValue(undefined);
  });

  it("shows the cast and the caller's own roles as the server reported them", async () => {
    render(true);

    expect(await screen.findByText("Nguyễn An")).toBeTruthy();
    // `manager` shows twice: once as the cast row's role, once among the caller's own roles.
    expect(screen.getAllByText("manager")).toHaveLength(2);
    // "Vai trò của bạn" is read-only: it is a verdict, not a preference — there is no control for it.
    expect(screen.getByText("editor")).toBeTruthy();
    expect(screen.getByText("Vai trò của bạn:")).toBeTruthy();
  });

  it("casts a member into a role and clears the form", async () => {
    render(true);
    await screen.findByText("Nguyễn An");

    const roleBox = screen.getByRole("combobox", { name: "Mã vai trò" }) as HTMLInputElement;
    fireEvent.change(roleBox, { target: { value: "  hr  " } });
    // The member picker is an antd Select; drive it through its search input.
    fireEvent.mouseDown(screen.getByText("Chọn thành viên"));
    fireEvent.click(await screen.findByTitle("binh@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Cử vào vai" }));

    await waitFor(() =>
      expect(api.addCaseParticipant).toHaveBeenCalledWith("case-1", {
        roleCode: "hr",
        userId: "u2",
      }),
    );
    await waitFor(() => expect(roleBox.value).toBe(""));
  });

  it("keeps the submit button disabled until both fields are valid", async () => {
    render(true);
    await screen.findByText("Nguyễn An");

    const submit = screen.getByRole("button", { name: "Cử vào vai" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // A role code alone is not enough, and a code with a space never leaves the browser — the
    // server's `AddParticipantDto` would 400 on it.
    fireEvent.change(screen.getByRole("combobox", { name: "Mã vai trò" }), {
      target: { value: "hr manager" },
    });
    expect(submit.disabled).toBe(true);
  });

  it("removes someone from the cast", async () => {
    render(true);
    await screen.findByText("Nguyễn An");

    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    await waitFor(() => expect(api.removeCaseParticipant).toHaveBeenCalledWith("case-1", "p1"));
  });

  it("offers no Xóa for a platform-owned row like `creator`", async () => {
    // The server refuses it with 400 (there is no way to write the row back), so the button would
    // only ever be a dead end.
    api.listCaseParticipants.mockResolvedValue({
      participants: [
        {
          id: "p0",
          instanceId: "case-1",
          roleCode: "creator",
          userId: "u1",
          addedBy: "u1",
          createdAt: "2026-08-01T01:00:00.000Z",
        },
      ],
      myRoles: ["creator"],
    });
    render(true);

    expect(await screen.findByText("Nguyễn An")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
  });

  it("hides every control from someone who may read but not run the case", async () => {
    // Hiding is only UX — the server refuses a viewer with 403 either way.
    render(false);

    expect(await screen.findByText("Nguyễn An")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Mã vai trò (vd: manager)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cử vào vai" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
  });

  it("says so when nobody has been cast, and when the caller holds no role", async () => {
    api.listCaseParticipants.mockResolvedValue({ participants: [], myRoles: [] });
    render(true);

    expect(await screen.findByText("Chưa cử ai vào vai trò nào.")).toBeTruthy();
    expect(screen.getByText("Không có vai trò nào")).toBeTruthy();
  });

  it("surfaces a load failure instead of pretending the cast is empty", async () => {
    api.listCaseParticipants.mockRejectedValue(new Error("Tải vai trò trên case thất bại: 403"));
    render(true);

    expect(await screen.findByText("Tải vai trò trên case thất bại: 403")).toBeTruthy();
  });
});
