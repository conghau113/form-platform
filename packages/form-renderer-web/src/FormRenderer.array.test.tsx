import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

const withArray = {
  formVersion: 3,
  id: "list",
  title: "List",
  fields: [
    {
      type: "array",
      name: "contacts",
      label: "Contacts",
      itemFields: [{ type: "text", name: "fullName", label: "Full name", required: true }],
    },
  ],
};

describe("FormRenderer array (Form List)", () => {
  it("appends a row and submits the nested array value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={withArray} onSubmit={onSubmit} />);

    // No rows yet -> no item input is shown.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Add Contacts/i }));
    await user.type(screen.getByRole("textbox"), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ contacts: [{ fullName: "Ada" }] });
  });

  it("validates a required item field within a row", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={withArray} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /Add Contacts/i }));
    // Row added but the required item left empty -> submit blocked.
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the table variant with column headers and submits rows", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const tableSchema = {
      formVersion: 3,
      id: "tlist",
      title: "Table list",
      fields: [
        {
          type: "array",
          name: "people",
          label: "People",
          variant: "table",
          itemFields: [
            { type: "text", name: "fullName", label: "Full name", required: true },
            { type: "number", name: "age", label: "Age" },
          ],
        },
      ],
    };
    render(<FormRenderer schema={tableSchema} onSubmit={onSubmit} />);

    // Column headers come from the item-field labels.
    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Add People/i }));
    await user.type(screen.getByRole("textbox"), "Grace");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ people: [{ fullName: "Grace" }] });
  });

  it("removes a row", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={withArray} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /Add Contacts/i }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // Empty optional array submits cleanly.
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ contacts: [] });
  });
});
