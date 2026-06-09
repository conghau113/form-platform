import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

// The real saved fixture (formVersion 1). FormRenderer migrates it internally,
// so this exercises the contract end-to-end through the shared form-core logic.
// vitest/turbo run this package's script from the package dir; the fixture lives
// two levels up at the repo root.
const example = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../examples/form.v1.json"), "utf8"),
);

describe("FormRenderer (web)", () => {
  it("renders the fixture: text fields and the select", () => {
    render(<FormRenderer schema={example} access={{ roles: ["admin"] }} />);
    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
    // antd Select renders a combobox even before its dropdown is opened.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("hides the visibleWhen field while country !== 'OTHER'", () => {
    // roles include admin so RBAC can't be the reason it's hidden — only the rule.
    render(<FormRenderer schema={example} access={{ roles: ["admin"] }} />);
    expect(screen.queryByText("Specify country")).not.toBeInTheDocument();
  });

  it("shows the visibleWhen field when country === 'OTHER'", () => {
    render(
      <FormRenderer
        schema={example}
        access={{ roles: ["admin"] }}
        initialValues={{ country: "OTHER" }}
      />,
    );
    expect(screen.getByText("Specify country")).toBeInTheDocument();
  });

  it("hides the admin-only field when access.roles is empty", () => {
    render(<FormRenderer schema={example} access={{ roles: [] }} />);
    expect(screen.queryByText("Internal note")).not.toBeInTheDocument();
  });

  it("shows the admin-only field for an admin", () => {
    render(<FormRenderer schema={example} access={{ roles: ["admin"] }} />);
    expect(screen.getByText("Internal note")).toBeInTheDocument();
  });
});
