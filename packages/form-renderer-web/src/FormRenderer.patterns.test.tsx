import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

/** A minimal current-version form around the given fields. */
function form(fields: unknown[]) {
  return { formVersion: 3, id: "t", title: "T", fields };
}

describe("FormRenderer interaction patterns", () => {
  it("readPretty renders the value as plain text, not an input", () => {
    render(
      <FormRenderer
        schema={form([{ type: "text", name: "summary", label: "Summary", readPretty: true }])}
        initialValues={{ summary: "Hello world" }}
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    // No editable control is rendered for a readPretty field.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("form-wide readPretty shows values as text and hides the Submit button", () => {
    render(
      <FormRenderer
        readPretty
        schema={form([{ type: "text", name: "name", label: "Name" }])}
        initialValues={{ name: "Ada" }}
      />,
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("readOnly keeps a text input but makes it non-editable", () => {
    render(
      <FormRenderer
        schema={form([{ type: "text", name: "ref", label: "Ref", readOnly: true }])}
        initialValues={{ ref: "R-1" }}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("a required reaction marks the target's label as required", () => {
    render(
      <FormRenderer
        schema={form([
          {
            type: "select",
            name: "kind",
            label: "Kind",
            reactions: [
              {
                when: { rule: { "==": [{ var: "kind" }, "company"] } },
                target: "vat",
                effect: "required",
              },
            ],
          },
          { type: "text", name: "vat", label: "VAT" },
        ])}
        initialValues={{ kind: "company" }}
      />,
    );
    const label = screen.getByText("VAT").closest("label");
    expect(label?.className).toContain("ant-form-item-required");
  });
});
