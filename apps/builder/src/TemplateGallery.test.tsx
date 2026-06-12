import type { FormSchema } from "@org/form-schema";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemplateGallery } from "./TemplateGallery";
import { BUILTIN_TEMPLATES, type Template } from "./templates";

function setup(overrides: Partial<React.ComponentProps<typeof TemplateGallery>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onUse: vi.fn(),
    userTemplates: [] as Template[],
    onSaveCurrent: vi.fn(),
    onDeleteUser: vi.fn(),
    ...overrides,
  };
  render(<TemplateGallery {...props} />);
  return props;
}

/** The antd Card whose title is `title`, scoped for within() queries. */
function card(title: string): HTMLElement {
  return screen.getByText(title).closest(".ant-card") as HTMLElement;
}

describe("TemplateGallery", () => {
  it("renders the built-in starter cards", () => {
    setup();
    for (const t of BUILTIN_TEMPLATES) expect(screen.getByText(t.title)).toBeTruthy();
  });

  it("Use applies the template schema and closes", () => {
    const { onUse, onClose } = setup();
    const contact = BUILTIN_TEMPLATES.find((t) => t.id === "contact") as Template;
    fireEvent.click(within(card(contact.title)).getByText("Use"));
    expect(onUse).toHaveBeenCalledWith(contact.schema);
    expect(onClose).toHaveBeenCalled();
  });

  it("Save current form as template is gated on a name", () => {
    const { onSaveCurrent } = setup();
    const button = screen.getByRole("button", { name: "Save current form as template" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Template name"), {
      target: { value: "My preset" },
    });
    fireEvent.click(button);
    expect(onSaveCurrent).toHaveBeenCalledWith("My preset");
  });

  it("lists user templates with a working delete", () => {
    const schema = { formVersion: 3, id: "x", title: "X", fields: [] } as FormSchema;
    const user: Template = { id: "user-1", title: "Saved one", description: "d", schema };
    const { onDeleteUser } = setup({ userTemplates: [user] });
    expect(screen.getByText("Saved one")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Delete Saved one"));
    expect(onDeleteUser).toHaveBeenCalledWith("user-1");
  });
});
