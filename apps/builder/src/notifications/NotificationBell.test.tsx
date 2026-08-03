import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../query/testing";
import { NotificationBell } from "./NotificationBell";

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock("./client", () => api);

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const UNREAD = {
  id: "n1",
  kind: "case.assigned",
  title: "Bạn được giao việc: Đơn nghỉ phép",
  body: "Trạng thái: review",
  targetType: "workflow-instance",
  targetId: "inst-1",
  link: "/projects/p1/workflows/wf1/run/inst-1",
  readAt: null,
  createdAt: new Date().toISOString(),
};
const READ = { ...UNREAD, id: "n2", title: "Việc đã chuyển bước: Đơn cũ", body: null, readAt: "x" };

describe("NotificationBell (Phase E3b)", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    navigate.mockReset();
    api.getUnreadCount.mockResolvedValue(2);
    api.listNotifications.mockResolvedValue([UNREAD, READ]);
    api.markNotificationRead.mockResolvedValue(undefined);
    api.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it("shows the unread count on the bell and fetches no feed until it is opened", async () => {
    renderWithQuery(<NotificationBell />);

    expect(await screen.findByLabelText("Thông báo (2 chưa đọc)")).toBeTruthy();
    expect(api.listNotifications).not.toHaveBeenCalled();
  });

  it("lists the feed when opened", async () => {
    renderWithQuery(<NotificationBell />);
    fireEvent.click(await screen.findByLabelText("Thông báo (2 chưa đọc)"));

    expect(await screen.findByText("Bạn được giao việc: Đơn nghỉ phép")).toBeTruthy();
    expect(screen.getByText("Việc đã chuyển bước: Đơn cũ")).toBeTruthy();
    expect(screen.getByText("Trạng thái: review")).toBeTruthy();
  });

  it("marks a notification read and navigates to its case when clicked", async () => {
    renderWithQuery(<NotificationBell />);
    fireEvent.click(await screen.findByLabelText("Thông báo (2 chưa đọc)"));
    fireEvent.click(await screen.findByText("Bạn được giao việc: Đơn nghỉ phép"));

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith("n1"));
    expect(navigate).toHaveBeenCalledWith("/projects/p1/workflows/wf1/run/inst-1");
  });

  it("does not re-mark a notification that is already read", async () => {
    renderWithQuery(<NotificationBell />);
    fireEvent.click(await screen.findByLabelText("Thông báo (2 chưa đọc)"));
    fireEvent.click(await screen.findByText("Việc đã chuyển bước: Đơn cũ"));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it("marks everything read from the panel header", async () => {
    renderWithQuery(<NotificationBell />);
    fireEvent.click(await screen.findByLabelText("Thông báo (2 chưa đọc)"));
    fireEvent.click(await screen.findByText("Đánh dấu tất cả đã đọc"));

    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalled());
  });

  it("says so when there is nothing to show", async () => {
    api.getUnreadCount.mockResolvedValue(0);
    api.listNotifications.mockResolvedValue([]);
    renderWithQuery(<NotificationBell />);
    fireEvent.click(await screen.findByLabelText("Thông báo"));

    expect(await screen.findByText("Chưa có thông báo")).toBeTruthy();
  });
});
