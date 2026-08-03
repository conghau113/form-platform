import { apiFetch } from "../lib/apiFetch";
import { API_BASE, ownerHeaders } from "../workspace/config";

/**
 * Thin client for the notification inbox (`/notifications/*`, product-roadmap Phase E3b). Mirrors
 * `operate/client.ts`: `fetch` lives only here, a non-OK response throws the server message, and the
 * active workspace rides along as the `X-Tenant-Id` header {@link apiFetch} stamps — the feed is
 * per-workspace, so switching one changes what the bell shows.
 *
 * No endpoint here takes a user id: the server answers every one of them for the authenticated
 * caller only.
 */

/** One notification as the server stored it — title/body/link are snapshots of the event. */
export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  /** In-app route to the thing this is about, or null. */
  link: string | null;
  /** ISO instant when the caller read it, or null while unread. */
  readAt: string | null;
  createdAt: string;
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

/** The caller's feed in the active workspace, newest first. */
export async function listNotifications(limit = 20): Promise<Notification[]> {
  const res = await apiFetch(`${API_BASE}/notifications?limit=${limit}`, {
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Tải thông báo thất bại: ${await readError(res)}`);
  return (await res.json()) as Notification[];
}

/** Unread count for the badge — the only call that polls. */
export async function getUnreadCount(): Promise<number> {
  const res = await apiFetch(`${API_BASE}/notifications/unread-count`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`Đếm thông báo chưa đọc thất bại: ${await readError(res)}`);
  return ((await res.json()) as { count: number }).count;
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Đánh dấu đã đọc thất bại: ${await readError(res)}`);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/notifications/read-all`, {
    method: "POST",
    headers: ownerHeaders(),
  });
  if (!res.ok) throw new Error(`Đánh dấu tất cả đã đọc thất bại: ${await readError(res)}`);
}
