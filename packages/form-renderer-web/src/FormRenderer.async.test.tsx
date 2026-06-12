import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

/** A minimal current-version form around the given fields. */
function form(fields: unknown[], extra: Record<string, unknown> = {}) {
  return { formVersion: 3, id: "t", title: "T", fields, ...extra };
}

/** A username field with a remote check; debounceMs 0 keeps tests deterministic. */
function usernameField(over: Record<string, unknown> = {}) {
  return {
    type: "text",
    name: "username",
    label: "Username",
    asyncValidator: { url: "https://api.test/check", debounceMs: 0 },
    ...over,
  };
}

function jsonResponse(data: unknown, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(data) } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("FormRenderer asyncValidator", () => {
  it("valid:false blocks submit and shows the server message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ valid: false, message: "Taken" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FormRenderer onSubmit={onSubmit} schema={form([usernameField()])} />);

    await user.type(screen.getByRole("textbox"), "ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Taken")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/check?value=ada&name=username");
  });

  it("valid:true lets submit through", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(jsonResponse({ valid: true })));
    render(<FormRenderer onSubmit={onSubmit} schema={form([usernameField()])} />);

    await user.type(screen.getByRole("textbox"), "ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ username: "ada" });
  });

  it("fails OPEN when the endpoint is down (submit succeeds)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<FormRenderer onSubmit={onSubmit} schema={form([usernameField()])} />);

    await user.type(screen.getByRole("textbox"), "ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("never fires for an empty value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<FormRenderer onSubmit={onSubmit} schema={form([usernameField()])} />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("memoizes per value: a second submit with the same value fetches once", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ valid: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FormRenderer onSubmit={onSubmit} schema={form([usernameField()])} />);

    await user.type(screen.getByRole("textbox"), "ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a zod error on the field skips the remote check", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FormRenderer
        schema={form([
          usernameField({
            validations: [{ type: "min", value: 5, message: "Too short" }],
          }),
        ])}
      />,
    );

    await user.type(screen.getByRole("textbox"), "abc");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Too short")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks fields inside array rows at their dotted path", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ valid: false, message: "Dup" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          {
            type: "array",
            name: "members",
            label: "Members",
            itemFields: [
              {
                type: "text",
                name: "email",
                label: "Email",
                asyncValidator: { url: "https://api.test/email", debounceMs: 0 },
              },
            ],
          },
        ])}
        initialValues={{ members: [{ email: "a@b.c" }] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Dup")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/email?value=a%40b.c&name=email");
  });
});
