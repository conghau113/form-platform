import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { Notification } from "./client";
import * as api from "./client";

/**
 * Data hooks for the notification bell (Phase E3b). react-query as everywhere else; `fetch` lives in
 * `client.ts`.
 *
 * Freshness without a socket: the repo has no push infrastructure, so the badge polls. 60s, and only
 * the COUNT — one integer, on a query the server answers from a single index. The feed itself is
 * fetched when the dropdown opens and not polled at all, and every mutation invalidates both keys,
 * so the caller's own actions still land instantly. These options are set per-query rather than on
 * `createQueryClient`, whose deliberate editor defaults (no window-focus refetch) are right for the
 * rest of the app and wrong only here.
 */

const POLL_MS = 60_000;
const EMPTY: Notification[] = [];

/** Unread count for the badge. Polls; refetches when the tab regains focus. */
export function useUnreadNotificationCount(): number {
  const query = useQuery({
    queryKey: qk.notificationsUnread,
    queryFn: api.getUnreadCount,
    refetchInterval: POLL_MS,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return query.data ?? 0;
}

/** The feed. `open` gates it: a closed dropdown fetches nothing. */
export function useNotificationFeed(open: boolean): {
  items: Notification[];
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.listNotifications(),
    enabled: open,
    staleTime: 0,
  });
  return {
    items: query.data ?? EMPTY,
    loading: open && query.isPending,
    error: query.error ? (query.error as Error).message : null,
  };
}

/** Mark one read (opening it). Invalidates the badge as well as the feed. */
export function useMarkNotificationRead(): (id: string) => Promise<void> {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread });
    },
  });
  return async (id) => {
    await mutation.mutateAsync(id);
  };
}

/** Mark everything in the active workspace read. */
export function useMarkAllNotificationsRead(): () => Promise<void> {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread });
    },
  });
  return async () => {
    await mutation.mutateAsync();
  };
}
