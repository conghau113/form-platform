import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

const requiredOnly = {
  formVersion: 3,
  id: "req",
  title: "Required",
  fields: [{ type: "text", name: "fullName", label: "Full name", required: true }],
};

describe("FormRenderer validation", () => {
  it("blocks submit and shows an error when a required field is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={requiredOnly} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a typed payload once the required field is filled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={requiredOnly} onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ fullName: "Ada Lovelace" });
  });

  it("does not validate a field hidden by visibleWhen", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const schema = {
      formVersion: 3,
      id: "cond",
      title: "Conditional",
      fields: [
        { type: "select", name: "country", label: "Country" },
        {
          type: "text",
          name: "otherCountry",
          label: "Specify country",
          required: true,
          visibleWhen: { rule: { "==": [{ var: "country" }, "OTHER"] } },
        },
      ],
    };
    render(<FormRenderer schema={schema} onSubmit={onSubmit} />);

    // The required field is hidden (country !== "OTHER"), so submit succeeds and
    // the hidden value is absent from the clean payload.
    expect(screen.queryByText("Specify country")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});
