import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FormRenderer } from "./FormRenderer.js";

const schema = {
  formVersion: 3,
  id: "i18n",
  title: "Survey",
  fields: [
    {
      type: "text",
      name: "email",
      label: "Email",
      i18n: { label: { vi: "Thư điện tử" } },
    },
    {
      type: "radio",
      name: "gender",
      label: "Gender",
      i18n: { label: { vi: "Giới tính" } },
      options: [{ label: "Male", value: "m", i18n: { vi: "Nam" } }],
    },
  ],
};

describe("FormRenderer i18n", () => {
  it("renders the authored default strings when no locale is given", () => {
    render(<FormRenderer schema={schema} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByText("Male")).toBeInTheDocument();
    expect(screen.queryByText("Thư điện tử")).not.toBeInTheDocument();
  });

  it("renders localized labels and option text for the active locale", () => {
    render(<FormRenderer schema={schema} locale="vi" />);
    expect(screen.getByLabelText("Thư điện tử")).toBeInTheDocument();
    expect(screen.getByText("Giới tính")).toBeInTheDocument();
    expect(screen.getByText("Nam")).toBeInTheDocument();
    // The English defaults are gone once localized.
    expect(screen.queryByText("Male")).not.toBeInTheDocument();
  });

  it("localizes the default validation message for the active locale (P3)", async () => {
    const user = userEvent.setup();
    const vForm = {
      formVersion: 3,
      id: "v",
      title: "V",
      fields: [{ type: "text", name: "name", label: "Tên", required: true }],
    };
    render(<FormRenderer schema={vForm} locale="vi" />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Tên là bắt buộc")).toBeInTheDocument();
  });

  it("keeps English validation messages when no locale is given (EN parity)", async () => {
    const user = userEvent.setup();
    const enForm = {
      formVersion: 3,
      id: "v",
      title: "V",
      fields: [{ type: "text", name: "name", label: "Name", required: true }],
    };
    render(<FormRenderer schema={enForm} />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });
});
