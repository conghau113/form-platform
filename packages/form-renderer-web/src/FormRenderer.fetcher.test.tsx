import { CURRENT_FORM_VERSION } from "@org/form-schema";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

// A minimal fetch Response stub good enough for the renderer (ok/status/json).
function jsonResponse(data: unknown, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(data) } as Response);
}

const base = { formVersion: CURRENT_FORM_VERSION, id: "f", title: "Test" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FormRenderer fetcher (injectable fetch)", () => {
  it("uses the injected fetcher for a remote dataSource (not the global fetch)", async () => {
    const global = vi.fn();
    vi.stubGlobal("fetch", global);
    const fetcher = vi.fn().mockReturnValue(jsonResponse([{ name: "Vietnam", code: "VN" }]));
    const schema = {
      ...base,
      fields: [
        {
          type: "select",
          name: "country",
          label: "Country",
          dataSource: { url: "https://api.test/countries", labelKey: "name", valueKey: "code" },
        },
      ],
    };

    render(<FormRenderer schema={schema} fetcher={fetcher as unknown as typeof fetch} />);

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("https://api.test/countries"));
    expect(global).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Vietnam")).toBeInTheDocument();
  });

  it("uses the injected fetcher for an asyncValidator check (not the global fetch)", async () => {
    const user = userEvent.setup();
    const global = vi.fn();
    vi.stubGlobal("fetch", global);
    const fetcher = vi.fn().mockReturnValue(jsonResponse({ valid: false, message: "Taken" }));
    const onSubmit = vi.fn();
    const schema = {
      ...base,
      fields: [
        {
          type: "text",
          name: "username",
          label: "Username",
          asyncValidator: { url: "https://api.test/check", debounceMs: 0 },
        },
      ],
    };

    render(
      <FormRenderer
        schema={schema}
        onSubmit={onSubmit}
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );

    await user.type(screen.getByRole("textbox"), "ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Taken")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith("https://api.test/check?value=ada&name=username");
    expect(global).not.toHaveBeenCalled();
  });

  it("falls back to the global fetch when no fetcher prop is passed", async () => {
    const global = vi.fn().mockReturnValue(jsonResponse([{ name: "Vietnam", code: "VN" }]));
    vi.stubGlobal("fetch", global);
    const schema = {
      ...base,
      fields: [
        {
          type: "select",
          name: "country",
          label: "Country",
          dataSource: { url: "https://api.test/countries", labelKey: "name", valueKey: "code" },
        },
      ],
    };

    render(<FormRenderer schema={schema} />);

    await waitFor(() => expect(global).toHaveBeenCalledWith("https://api.test/countries"));
  });
});
