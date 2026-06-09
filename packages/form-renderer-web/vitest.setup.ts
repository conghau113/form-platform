import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// RTL doesn't auto-clean without vitest globals; unmount between tests so
// document.body has a single render to query.
afterEach(cleanup);

// antd's responsive Row/Col read window.matchMedia, which jsdom doesn't provide.
// Stub it so the renderer mounts without throwing.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
