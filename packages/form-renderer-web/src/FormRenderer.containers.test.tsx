import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

// The container fixture: tabs > (card > grid) + (array with a nested card),
// plus a collapse > panel > space. vitest runs from the package dir, so the
// repo-root fixture lives two levels up (same pattern as FormRenderer.test.tsx).
const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../examples/form.v3.json"), "utf8"),
);

describe("FormRenderer layout containers", () => {
  it("renders inputs from EVERY tab pane up front (forceRender keeps RHF registered)", () => {
    render(<FormRenderer schema={fixture} />);
    // Pane 1 content
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    // Pane 2 content exists in the DOM even though the tab is inactive (antd
    // marks it aria-hidden, hence `hidden: true`). Without forceRender the pane
    // would not mount and its RHF controllers would never register.
    expect(
      screen.getByRole("button", { name: /Add Previous jobs/i, hidden: true }),
    ).toBeInTheDocument();
    // Collapse panel content (open by default).
    expect(screen.getByLabelText("Remote")).toBeInTheDocument();
  });

  it("submits a flat value object hoisted out of tabs/card/grid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={fixture} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("First name"), "Ada");
    await user.type(screen.getByLabelText("Last name"), "Lovelace");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0];
    // Container children hoist to the top level; only the array nests.
    expect(values).toMatchObject({ firstName: "Ada", lastName: "Lovelace", jobs: [] });
  });

  it("supports an array inside a tab pane, with a container inside its rows", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={fixture} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("First name"), "A");
    await user.type(screen.getByLabelText("Last name"), "B");
    await user.click(screen.getByRole("tab", { name: "Experience" }));
    await user.click(screen.getByRole("button", { name: /Add Previous jobs/i }));
    // `company` is a direct item field; `role` lives inside a card in the row.
    await user.type(screen.getByLabelText("Company"), "ACME");
    await user.type(screen.getByLabelText("Role"), "Engineer");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].jobs).toEqual([{ company: "ACME", role: "Engineer" }]);
  });

  it("hides a card via visibleWhen and drops its required child from validation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const schema = {
      formVersion: 3,
      id: "hidden-card",
      title: "Hidden card",
      fields: [
        {
          type: "card",
          title: "Secret",
          visibleWhen: { rule: { "==": [1, 0] } },
          children: [{ type: "text", name: "secret", label: "Secret", required: true }],
        },
        { type: "text", name: "visible", label: "Visible" },
      ],
    };
    render(<FormRenderer schema={schema} onSubmit={onSubmit} />);

    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect("secret" in onSubmit.mock.calls[0][0]).toBe(false);
  });

  it("applies root layoutProps to the antd Form", () => {
    const schema = {
      formVersion: 3,
      id: "horizontal",
      title: "Horizontal",
      layoutProps: { layout: "horizontal", labelCol: { span: 6 }, wrapperCol: { span: 12 } },
      fields: [{ type: "text", name: "n", label: "N" }],
    };
    const { container } = render(<FormRenderer schema={schema} />);
    expect(container.querySelector(".ant-form-item-horizontal")).not.toBeNull();
    expect(container.querySelector(".ant-col-6")).not.toBeNull();
    expect(container.querySelector(".ant-col-12")).not.toBeNull();
  });

  it("scopes a form-layout region's label layout to its descendants and hoists their values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const schema = {
      formVersion: 3,
      id: "form-layout",
      title: "Form layout region",
      // Root form stays vertical; only the region's child gets a horizontal label.
      fields: [
        { type: "text", name: "outside", label: "Outside" },
        {
          type: "form-layout",
          formLayout: "horizontal",
          labelCol: { span: 6 },
          wrapperCol: { span: 18 },
          children: [{ type: "text", name: "inside", label: "Inside" }],
        },
      ],
    };
    const { container } = render(<FormRenderer schema={schema} onSubmit={onSubmit} />);
    // Exactly the in-region Form.Item is horizontal; the top-level field keeps the form default.
    expect(container.querySelectorAll(".ant-form-item-horizontal")).toHaveLength(1);
    // The region's labelCol/wrapperCol land on that item.
    expect(container.querySelector(".ant-col-6")).not.toBeNull();
    expect(container.querySelector(".ant-col-18")).not.toBeNull();
    // Value-transparent: the region contributes no key — `inside` hoists to the flat object.
    await user.type(screen.getByLabelText("Inside"), "x");
    await user.type(screen.getByLabelText("Outside"), "y");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ inside: "x", outside: "y" });
  });

  it("sizes grid cells from cols (3 cols -> md-8) with field colSpan overriding", () => {
    const schema = {
      formVersion: 3,
      id: "grid",
      title: "Grid",
      fields: [
        {
          type: "grid",
          cols: 3,
          children: [
            { type: "text", name: "a", label: "A" },
            { type: "text", name: "b", label: "B", layout: { colSpan: { md: 24 } } },
          ],
        },
      ],
    };
    const { container } = render(<FormRenderer schema={schema} />);
    expect(container.querySelector(".ant-col-md-8")).not.toBeNull();
    expect(container.querySelector(".ant-col-md-24")).not.toBeNull();
  });

  it("renders the card title and collapse/tab labels", () => {
    render(<FormRenderer schema={fixture} />);
    expect(screen.getByText("Identity")).toBeInTheDocument(); // card title
    expect(screen.getByText("Profile")).toBeInTheDocument(); // tab label
    expect(screen.getByText("Experience")).toBeInTheDocument(); // tab label
    expect(screen.getByText("Extras")).toBeInTheDocument(); // collapse panel label
  });

  it("hides a tab pane via visibleWhen", () => {
    const schema = {
      formVersion: 3,
      id: "hidden-pane",
      title: "Hidden pane",
      fields: [
        {
          type: "tabs",
          children: [
            { type: "tab-pane", label: "Shown", children: [] },
            {
              type: "tab-pane",
              label: "Hidden",
              visibleWhen: { rule: { "==": [1, 0] } },
              children: [],
            },
          ],
        },
      ],
    };
    render(<FormRenderer schema={schema} />);
    expect(screen.getByText("Shown")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});
