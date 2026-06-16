import type { FieldNode, Preset } from "@org/form-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresetLink } from "./PresetLink";

const preset: Preset = {
  id: "org_select",
  fieldType: "text",
  name: "Organization",
  patch: { label: "Organization", placeholder: "Pick one" },
};

const field = (extra: Record<string, unknown> = {}): FieldNode =>
  ({ type: "text", name: "org", label: "Org", ...extra }) as FieldNode;

describe("PresetLink", () => {
  it("renders nothing when there are no presets of this type and no link", () => {
    const { container } = render(<PresetLink field={field()} presets={[]} set={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the linked preset name and the propagation hint", () => {
    render(
      <PresetLink field={field({ presetId: "org_select" })} presets={[preset]} set={vi.fn()} />,
    );
    // getByText throws if absent, so a successful call is the assertion.
    expect(screen.getByText("Organization")).toBeTruthy();
    expect(screen.getByText(/lưu thành override/)).toBeTruthy();
  });

  it("flags a stale link when the preset is missing", () => {
    render(<PresetLink field={field({ presetId: "gone" })} presets={[preset]} set={vi.fn()} />);
    expect(screen.getByText(/không khả dụng/)).toBeTruthy();
  });

  it("flags a stale link when the preset's type no longer matches", () => {
    const numeric: Preset = { ...preset, fieldType: "number" };
    render(
      <PresetLink field={field({ presetId: "org_select" })} presets={[numeric]} set={vi.fn()} />,
    );
    expect(screen.getByText(/không khả dụng/)).toBeTruthy();
  });

  it("unlinks (clearing the link metadata) on the unlink button", () => {
    const set = vi.fn();
    render(<PresetLink field={field({ presetId: "org_select" })} presets={[preset]} set={set} />);
    fireEvent.click(screen.getByLabelText("Unlink preset"));
    expect(set).toHaveBeenCalledWith({ presetId: undefined, overrides: undefined });
  });
});
