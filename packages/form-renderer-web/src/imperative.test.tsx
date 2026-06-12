import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRenderer, type FormRendererHandle } from "./FormRenderer.js";
import { openFormDialog, openFormDrawer } from "./imperative.js";

const simple = {
  formVersion: 3,
  id: "popup",
  title: "Popup",
  fields: [{ type: "text", name: "name", label: "Name", required: true }],
};

// Popups mount on detached hosts appended to document.body; clean them up between tests.
afterEach(() => {
  document.body.innerHTML = "";
});

describe("FormRenderer imperative handle", () => {
  it("submits via ref.submit() and hides the built-in button with hideSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const ref = createRef<FormRendererHandle>();
    render(<FormRenderer ref={ref} schema={simple} hideSubmit onSubmit={onSubmit} />);

    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "Ada");
    ref.current?.submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Ada" }));
  });
});

describe("openFormDialog", () => {
  it("resolves the typed values when OK is clicked after a valid submit", async () => {
    const user = userEvent.setup();
    const promise = openFormDialog(simple, { title: "Edit" });

    await user.type(await screen.findByLabelText("Name"), "Grace");
    await user.click(screen.getByRole("button", { name: "OK" }));

    await expect(promise).resolves.toEqual({ name: "Grace" });
  });

  it("resolves undefined when cancelled", async () => {
    const user = userEvent.setup();
    const promise = openFormDialog(simple);

    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(promise).resolves.toBeUndefined();
  });

  it("stays open and does not resolve when validation fails", async () => {
    const user = userEvent.setup();
    let settled = false;
    const promise = openFormDialog(simple);
    promise.then(() => {
      settled = true;
    });

    await screen.findByLabelText("Name"); // required, left empty
    await user.click(screen.getByRole("button", { name: "OK" }));

    // The required error shows and the dialog is still mounted; nothing resolved.
    await screen.findByText("Name is required");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(settled).toBe(false);
  });
});

describe("openFormDrawer", () => {
  it("resolves the typed values when OK is clicked", async () => {
    const user = userEvent.setup();
    const promise = openFormDrawer(simple, { title: "Edit" });

    await user.type(await screen.findByLabelText("Name"), "Edsger");
    await user.click(screen.getByRole("button", { name: "OK" }));

    await expect(promise).resolves.toEqual({ name: "Edsger" });
  });
});

const tableSchema = {
  formVersion: 3,
  id: "t",
  title: "T",
  fields: [
    {
      type: "array",
      name: "rows",
      label: "Rows",
      variant: "table",
      editInDialog: true,
      itemFields: [{ type: "text", name: "v", label: "V" }],
    },
  ],
};

describe("array table editInDialog", () => {
  it("edits a row in a dialog and writes the value back into the form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={tableSchema} onSubmit={onSubmit} />);

    // Add an (empty) row, then open it in the dialog.
    await user.click(screen.getByRole("button", { name: /Add Rows/i }));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    await user.type(await screen.findByLabelText("V"), "hello");
    await user.click(screen.getByRole("button", { name: "OK" }));

    // The dialog closed and the read-only cell now shows the written value.
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ rows: [{ v: "hello" }] }));
  });
});
