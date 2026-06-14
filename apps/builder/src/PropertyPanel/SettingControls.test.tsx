import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SettingDescriptor } from "../field-registry";
import { SettingControls } from "./TypeSettings";

/** Render a single descriptor against a value bag + a spy, returning the spy. */
function setup(settings: SettingDescriptor[], values: Record<string, unknown> = {}) {
  const set = vi.fn();
  render(<SettingControls settings={settings} get={(k) => values[k]} set={set} />);
  return set;
}

describe("SettingControls — X1 setter vocabulary", () => {
  it("segmented: writes the picked choice value", async () => {
    const user = userEvent.setup();
    const set = setup([
      {
        key: "direction",
        label: "Direction",
        control: "segmented",
        choices: [
          { label: "Horizontal", value: "horizontal" },
          { label: "Vertical", value: "vertical" },
        ],
      },
    ]);
    await user.click(screen.getByText("Vertical"));
    expect(set).toHaveBeenCalledWith("direction", "vertical");
  });

  it("segmented: an unset value highlights no segment", () => {
    setup([
      {
        key: "size",
        label: "Size",
        control: "segmented",
        choices: [
          { label: "Small", value: "small" },
          { label: "Large", value: "large" },
        ],
      },
    ]);
    // antd marks the selected option with aria-checked; nothing is checked when unset.
    const checked = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(0);
  });

  it("slider: forwards min/max and the current value", () => {
    setup([{ key: "cols", label: "Columns", control: "slider", min: 1, max: 12, step: 1 }], {
      cols: 4,
    });
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuemin")).toBe("1");
    expect(slider.getAttribute("aria-valuemax")).toBe("12");
    expect(slider.getAttribute("aria-valuenow")).toBe("4");
  });

  it("slider: falls back to min when the value is unset", () => {
    setup([{ key: "cols", label: "Columns", control: "slider", min: 1, max: 12, step: 1 }]);
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("1");
  });

  it("number: forwards descriptor bounds to the input", () => {
    setup([{ key: "count", label: "Count", control: "number", min: 1, max: 10 }], { count: 5 });
    const input = screen.getByRole("spinbutton");
    expect(input.getAttribute("aria-valuemin")).toBe("1");
    expect(input.getAttribute("aria-valuemax")).toBe("10");
  });
});
