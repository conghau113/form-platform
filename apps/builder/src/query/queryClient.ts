import { QueryClient } from "@tanstack/react-query";

/**
 * The builder's single QueryClient (server state for workspace + presets, and later form/theme).
 *
 * Conservative editor defaults: this is a focused authoring tool, not a dashboard, so we don't
 * want surprise background refetches while someone is dragging fields. Window-focus refetch is
 * off, data stays fresh for a short while, and we don't retry — a failed workspace call should
 * surface its error immediately rather than silently re-hammering the API.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
      },
      mutations: { retry: false },
    },
  });
}
