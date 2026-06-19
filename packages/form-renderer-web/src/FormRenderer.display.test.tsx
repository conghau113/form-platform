import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

const schema = {
  formVersion: 3 as const,
  id: "display",
  title: "Display",
  fields: [
    { type: "display-text" as const, content: "Welcome", variant: "title" as const, level: 2 },
    { type: "display-text" as const, content: "Fill in the form below." },
    { type: "text" as const, name: "name", label: "Name", required: true },
  ],
};

describe("FormRenderer display-text", () => {
  it("renders authored static content as typography (heading + paragraph), no form control", () => {
    render(<FormRenderer schema={schema} />);
    // The title renders as a level-2 heading carrying the authored content.
    expect(screen.getByRole("heading", { level: 2, name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("Fill in the form below.")).toBeInTheDocument();
    // It owns no value → no labelled control for the display node.
    expect(screen.queryByLabelText("Welcome")).not.toBeInTheDocument();
  });

  it("contributes nothing to the submitted value object", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={schema} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ name: "Ada" });
  });
});
