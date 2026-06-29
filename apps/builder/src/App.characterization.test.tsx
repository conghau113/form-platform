import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import example from "../../../examples/form.v1.json";
import { App } from "./App";
// R4: App now reads presets via react-query, so it must render under a QueryClientProvider.
// `renderWithQuery` adds that wrapper; the assertions below are unchanged from R0.
import { renderWithQuery } from "./query/testing";

/**
 * Characterization tests (Refactor R0). These PIN the current behaviour of the parts of
 * `App.tsx` that the R3 decomposition will extract into hooks — specifically the surfaces that
 * have no other coverage today:
 *   - form + theme persistence (save order, the `provideSave` stable-save ref, success/failure),
 *   - load-on-mount via the `formId` prop,
 *   - the dirty signal at mount (`onDirtyChange`),
 *   - install/cleanup of the global keydown listener (the shortcut wiring).
 *
 * They assert *current* behaviour exactly. When R3 moves this logic into
 * `useFormPersistence` / `useNavigationGuard` / `useEditorShortcuts`, these must still pass
 * UNCHANGED — that is the contract the refactor preserves. The pure editor logic (history,
 * selection, clipboard, tree ops) is already covered by `engine/*.test.ts`.
 */

const ok = (json: unknown) => ({ ok: true, statusText: "OK", json: async () => json });
const fail = (statusText = "Boom") => ({ ok: false, statusText, json: async () => ({}) });

interface MockOptions {
  /** Make the form save (`POST /forms`) fail. */
  saveFormFails?: boolean;
  /** Body returned by `GET /forms/:id` (load). Defaults to the example form. */
  loadedForm?: unknown;
  /** Whether a saved theme exists for `GET /themes/:id`. */
  themeExists?: boolean;
}

/** Routes every fetch App makes on mount + during save/load. Method + URL based, mirroring
 *  `presets/usePresets.test.ts`. Returns the spy so tests can assert calls. */
function mockFetch(opts: MockOptions = {}) {
  const { saveFormFails = false, loadedForm = example, themeExists = false } = opts;
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as Request)?.url ?? input ?? "");
    const method = init?.method ?? "GET";
    // Preset library load on mount (usePresets) — keep it empty.
    if (url.includes("/presets")) return Promise.resolve(ok([]));
    // Publish badge load on mount (PublishControl, when a formId is set) — empty body ⇒ "never
    // published". `getActiveVersion` reads `.text()`, so this branch must precede the `/forms` one.
    if (url.includes("/active-version")) {
      return Promise.resolve({ ok: true, statusText: "OK", text: async () => "" });
    }
    if (url.includes("/themes/")) {
      if (method === "POST") return Promise.resolve(ok({}));
      return Promise.resolve(themeExists ? ok({}) : fail("Not found"));
    }
    if (url.includes("/forms")) {
      if (method === "POST") {
        return Promise.resolve(saveFormFails ? fail("Invalid") : ok({ id: "saved-form-id" }));
      }
      return Promise.resolve(ok(loadedForm)); // GET /forms/:id
    }
    return Promise.resolve(ok({}));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App — persistence & lifecycle characterization (R0)", () => {
  it("reports not-dirty at mount", async () => {
    mockFetch();
    const onDirtyChange = vi.fn();
    renderWithQuery(<App onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalled());
    // The very first signal is the clean baseline: history cursor === savedIndex, tokens unchanged.
    expect(onDirtyChange.mock.calls[0][0]).toBe(false);
  });

  it("provideSave saves the form THEN the theme under the returned id, and reports success", async () => {
    const fetchFn = mockFetch();
    let save: (() => Promise<boolean>) | undefined;
    const onSaved = vi.fn();
    renderWithQuery(<App provideSave={(fn) => (save = fn)} onSaved={onSaved} />);
    await waitFor(() => expect(save).toBeTypeOf("function"));

    let result: boolean | undefined;
    await act(async () => {
      result = await save?.();
    });

    expect(result).toBe(true);
    expect(onSaved).toHaveBeenCalledTimes(1);
    const posts = fetchFn.mock.calls.filter(([, init]) => init?.method === "POST");
    // form save first, then the theme under the id the server returned.
    expect(posts[0][0]).toMatch(/\/forms$/);
    expect(posts[1][0]).toContain("/themes/saved-form-id");
  });

  it("provideSave returns false and skips the theme write when the form save fails", async () => {
    const fetchFn = mockFetch({ saveFormFails: true });
    let save: (() => Promise<boolean>) | undefined;
    const onSaved = vi.fn();
    renderWithQuery(<App provideSave={(fn) => (save = fn)} onSaved={onSaved} />);
    await waitFor(() => expect(save).toBeTypeOf("function"));

    let result: boolean | undefined;
    await act(async () => {
      result = await save?.();
    });

    expect(result).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    const themePosts = fetchFn.mock.calls.filter(
      ([url, init]) => init?.method === "POST" && String(url).includes("/themes/"),
    );
    expect(themePosts).toHaveLength(0);
  });

  it("loads the form AND its theme on mount when given a formId", async () => {
    const fetchFn = mockFetch({ themeExists: true });
    renderWithQuery(<App formId="contact-request" />);
    await waitFor(() => {
      const urls = fetchFn.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes("/forms/contact-request"))).toBe(true);
      expect(urls.some((u) => u.includes("/themes/contact-request"))).toBe(true);
    });
  });
});

describe("App — keyboard shortcut wiring characterization (R0)", () => {
  beforeEach(() => {
    mockFetch();
  });

  it("installs a global keydown listener and removes it on unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderWithQuery(<App />);
    const installed = add.mock.calls.find(([type]) => type === "keydown");
    expect(installed).toBeDefined();
    unmount();
    const removed = remove.mock.calls.find(([type]) => type === "keydown");
    expect(removed).toBeDefined();
  });
});
