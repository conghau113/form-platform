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

describe("SettingControls — S1 setter vocabulary", () => {
  it("textarea: writes typed text and clears to undefined", async () => {
    const user = userEvent.setup();
    const set = setup([{ key: "help", label: "Help", control: "textarea" }], { help: "hi" });
    const box = screen.getByRole("textbox");
    await user.clear(box);
    expect(set).toHaveBeenLastCalledWith("help", undefined);
  });

  it("multiSelect: picking a choice writes an array", async () => {
    const user = userEvent.setup();
    const set = setup([
      {
        key: "tags",
        label: "Tags",
        control: "multiSelect",
        choices: [
          { label: "Red", value: "red" },
          { label: "Blue", value: "blue" },
        ],
      },
    ]);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Blue"));
    expect(set).toHaveBeenCalledWith("tags", ["blue"]);
  });

  it("icon: typing a token writes the raw token string", async () => {
    const user = userEvent.setup();
    const set = setup([{ key: "prefixIcon", label: "Prefix icon", control: "icon" }]);
    await user.type(screen.getByRole("combobox"), "x");
    expect(set).toHaveBeenLastCalledWith("prefixIcon", "x");
  });

  it("icon: offers built-in token suggestions with glyph previews (I2)", async () => {
    const user = userEvent.setup();
    setup([{ key: "prefixIcon", label: "Prefix icon", control: "icon" }]);
    await user.click(screen.getByRole("combobox"));
    // a built-in antd token shows up as an option, with its glyph resolved by the registry.
    expect(screen.getByRole("option", { name: /antd:SearchOutlined/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: "search" })).toBeTruthy();
  });

  it("color: renders the current hex value", () => {
    setup([{ key: "tint", label: "Tint", control: "color" }], { tint: "#ff0000" });
    expect(screen.getByText(/ff0000/i)).toBeTruthy();
  });

  it("keyValue: editing a value writes the updated pair list", async () => {
    const user = userEvent.setup();
    const set = setup([{ key: "meta", label: "Meta", control: "keyValue" }], {
      meta: [{ key: "a", value: "1" }],
    });
    const valueCell = screen.getAllByRole("textbox")[1];
    await user.type(valueCell, "2");
    expect(set).toHaveBeenLastCalledWith("meta", [{ key: "a", value: "12" }]);
  });

  it("keyValue: Add row appends an empty pair", async () => {
    const user = userEvent.setup();
    const set = setup([{ key: "meta", label: "Meta", control: "keyValue" }], {
      meta: [{ key: "a", value: "1" }],
    });
    await user.click(screen.getByText("Add row"));
    expect(set).toHaveBeenCalledWith("meta", [
      { key: "a", value: "1" },
      { key: "", value: "" },
    ]);
  });

  it("marks: the key cell is numeric", () => {
    setup([{ key: "marks", label: "Marks", control: "marks" }], {
      marks: [{ key: "0", value: "min" }],
    });
    // numericKeys ⇒ the key cell renders as a spinbutton (InputNumber).
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("json: valid JSON commits a parsed value", async () => {
    const user = userEvent.setup();
    const set = setup([{ key: "extra", label: "Extra", control: "json" }]);
    await user.type(screen.getByRole("textbox"), '{{"a":1}');
    expect(set).toHaveBeenLastCalledWith("extra", { a: 1 });
  });

  it("json: invalid JSON shows an error and does not commit", async () => {
    const user = userEvent.setup();
    const set = setup([{ key: "extra", label: "Extra", control: "json" }]);
    await user.type(screen.getByRole("textbox"), "{{not json");
    expect(set).not.toHaveBeenCalled();
    const error = document.querySelector(".ant-typography-danger");
    expect(error?.textContent ?? "").toMatch(/JSON|Unexpected|token|property/i);
  });
});
