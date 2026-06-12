import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

/** A minimal current-version form around the given fields. */
function form(fields: unknown[], extra: Record<string, unknown> = {}) {
  return { formVersion: 3, id: "t", title: "T", fields, ...extra };
}

describe("FormRenderer warning severity", () => {
  it("shows a warning message but still submits", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          {
            type: "text",
            name: "bio",
            label: "Bio",
            validations: [{ type: "min", value: 10, severity: "warning", message: "Quite short" }],
          },
        ])}
        initialValues={{ bio: "tiny" }}
      />,
    );

    expect(screen.getByText("Quite short")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ bio: "tiny" });
  });

  it("an error wins the help slot over a warning on the same field", async () => {
    const user = userEvent.setup();
    render(
      <FormRenderer
        schema={form([
          {
            type: "text",
            name: "bio",
            label: "Bio",
            required: true,
            validations: [{ type: "min", value: 10, severity: "warning", message: "Quite short" }],
          },
        ])}
      />,
    );

    // Empty: the warning channel reports nothing (warning-min skips empty values),
    // and submit surfaces the blocking required error.
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Bio is required")).toBeInTheDocument();
    expect(screen.queryByText("Quite short")).not.toBeInTheDocument();
  });

  it("warns inside an array row via the dotted path", async () => {
    render(
      <FormRenderer
        schema={form([
          {
            type: "array",
            name: "rows",
            label: "Rows",
            itemFields: [
              {
                type: "text",
                name: "code",
                label: "Code",
                validations: [{ type: "len", value: 3, severity: "warning", message: "3 chars" }],
              },
            ],
          },
        ])}
        initialValues={{ rows: [{ code: "abcd" }] }}
      />,
    );

    expect(await screen.findByText("3 chars")).toBeInTheDocument();
  });

  it("a warning cross rule never blocks submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          { type: "number", name: "start", label: "Start" },
          {
            type: "number",
            name: "end",
            label: "End",
            validations: [
              {
                type: "cross",
                rule: { "<=": [{ var: "start" }, { var: "end" }] },
                severity: "warning",
                message: "Ends before it starts",
              },
            ],
          },
        ])}
        initialValues={{ start: 5, end: 3 }}
      />,
    );

    expect(screen.getByText("Ends before it starts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("an error cross rule blocks submit with its message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FormRenderer
        onSubmit={onSubmit}
        schema={form([
          { type: "number", name: "start", label: "Start" },
          {
            type: "number",
            name: "end",
            label: "End",
            validations: [
              {
                type: "cross",
                rule: { "<=": [{ var: "start" }, { var: "end" }] },
                message: "End must be after start",
              },
            ],
          },
        ])}
        initialValues={{ start: 5, end: 3 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("End must be after start")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
