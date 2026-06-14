import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

// A two-step wizard: step 1 has a required Email, step 2 a free-text Nickname.
const wizard = {
  formVersion: 3,
  id: "wiz",
  title: "Wizard",
  fields: [
    {
      type: "steps",
      children: [
        {
          type: "step",
          label: "Account",
          description: "Login details",
          children: [{ type: "text", name: "email", label: "Email", required: true }],
        },
        {
          type: "step",
          label: "Profile",
          children: [{ type: "text", name: "nickname", label: "Nickname" }],
        },
      ],
    },
  ],
};

describe("FormRenderer steps wizard", () => {
  it("mounts every step (forceRender) but shows only the current one", () => {
    render(<FormRenderer schema={wizard} />);
    // Both step headers + descriptions render.
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Login details")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    // Step 1 is visible; step 2's field is mounted (RHF registered) but hidden.
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.getByLabelText("Nickname")).not.toBeVisible();
  });

  it("Next validates ONLY the current step and blocks on an invalid required field", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={wizard} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    // Current step's required error surfaces; the wizard stays on step 1.
    await waitFor(() => expect(screen.getByText("Email is required")).toBeInTheDocument());
    expect(screen.getByLabelText("Nickname")).not.toBeVisible();
  });

  it("advances to the next step once the current step is valid", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={wizard} />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByLabelText("Nickname")).toBeVisible());
    expect(screen.getByLabelText("Email")).not.toBeVisible();
  });

  it("shows Submit only on the last step and posts a flat payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={wizard} onSubmit={onSubmit} />);

    // No Submit while on step 1; the global submit row is suppressed by `steps`.
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByLabelText("Nickname")).toBeVisible());

    await user.type(screen.getByLabelText("Nickname"), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      email: "ada@example.com",
      nickname: "Ada",
    });
  });

  it("jumps back to the first errored step on a failed submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={wizard} onSubmit={onSubmit} />);

    // Reach the last step with step 1 valid…
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByLabelText("Nickname")).toBeVisible());
    // …then clear the required field and submit: validation fails and we land back on step 1.
    await user.clear(screen.getByLabelText("Email"));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(screen.getByLabelText("Email")).toBeVisible());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
