import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../query/testing";
import { CaseComments } from "./CaseComments";

const api = vi.hoisted(() => ({
  listCaseComments: vi.fn(),
  addCaseComment: vi.fn(),
}));

vi.mock("./client", () => api);

describe("CaseComments (Phase E2)", () => {
  beforeEach(() => {
    api.listCaseComments.mockReset();
    api.addCaseComment.mockReset();
    api.listCaseComments.mockResolvedValue([
      {
        id: "c1",
        instanceId: "case-1",
        authorId: "u1",
        authorName: "Nguyễn An",
        body: "Đang chờ hồ sơ gốc",
        createdAt: "2026-07-30T02:00:00.000Z",
      },
    ]);
    api.addCaseComment.mockResolvedValue({
      id: "c2",
      instanceId: "case-1",
      authorId: "u1",
      authorName: "Nguyễn An",
      body: "đã nhận",
      createdAt: "2026-07-30T03:00:00.000Z",
    });
  });

  it("shows the thread with the author name the server snapshotted", async () => {
    renderWithQuery(<CaseComments instanceId="case-1" canWrite />);

    expect(await screen.findByText("Đang chờ hồ sơ gốc")).toBeTruthy();
    expect(screen.getByText(/Nguyễn An/)).toBeTruthy();
  });

  it("posts a comment and clears the box", async () => {
    renderWithQuery(<CaseComments instanceId="case-1" canWrite />);
    await screen.findByText("Đang chờ hồ sơ gốc");

    const box = screen.getByPlaceholderText("Viết bình luận…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  đã nhận  " } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    // Trimmed before it leaves the browser — the server rejects a blank body anyway.
    await waitFor(() => expect(api.addCaseComment).toHaveBeenCalledWith("case-1", "đã nhận"));
    await waitFor(() => expect(box.value).toBe(""));
  });

  it("hides the composer from someone who may read but not write", async () => {
    renderWithQuery(<CaseComments instanceId="case-1" canWrite={false} />);

    // The thread is still readable — only writing needs run access.
    expect(await screen.findByText("Đang chờ hồ sơ gốc")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Viết bình luận…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Gửi" })).toBeNull();
  });

  it("says so when there is nothing yet", async () => {
    api.listCaseComments.mockResolvedValue([]);
    renderWithQuery(<CaseComments instanceId="case-1" canWrite />);

    expect(await screen.findByText("Chưa có bình luận nào.")).toBeTruthy();
  });

  it("surfaces a load failure instead of pretending the thread is empty", async () => {
    api.listCaseComments.mockRejectedValue(new Error("Tải bình luận thất bại: 403"));
    renderWithQuery(<CaseComments instanceId="case-1" canWrite />);

    expect(await screen.findByText("Tải bình luận thất bại: 403")).toBeTruthy();
  });
});
