import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type RenderHookOptions,
  type RenderOptions,
  render,
  renderHook,
} from "@testing-library/react";
import { App as AntApp } from "antd";
import type { ReactElement, ReactNode } from "react";

/**
 * Test-only helpers (R4): react-query hooks/components need a `QueryClientProvider` in the tree.
 * Each test gets a *fresh* client with retries off and no caching window, so cases don't leak
 * state into one another. Mirrors the production defaults' intent (no retry) but resets per test.
 */
function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Render a component under a fresh QueryClientProvider + antd `<App>` (for `App.useApp()`). */
export function renderWithQuery(ui: ReactElement, options?: RenderOptions) {
  const client = freshClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AntApp>{children}</AntApp>
    </QueryClientProvider>
  );
  return render(ui, { wrapper, ...options });
}

/** `renderHook` under a fresh QueryClientProvider + antd `<App>` (for hook unit tests). */
export function renderHookWithQuery<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  const client = freshClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AntApp>{children}</AntApp>
    </QueryClientProvider>
  );
  return renderHook(callback, { wrapper, ...options });
}
