import type { Reaction } from "@org/form-schema";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReactionsEditor } from "./ReactionsEditor";

const eq = (field: string, value: string): Reaction["when"] => ({
  rule: { "==": [{ var: field }, value] },
});

function setup(reactions: Reaction[], onChange = vi.fn()) {
  render(
    <ReactionsEditor
      reactions={reactions}
      fieldName="self"
      targetNames={["self", "a", "b"]}
      sourceNames={["x", "y"]}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("ReactionsEditor", () => {
  it("emits a default reaction patch on Add", async () => {
    const user = userEvent.setup();
    const onChange = setup([]);

    await user.click(screen.getByRole("button", { name: "Add reaction" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { when: eq("x", ""), target: "a", effect: "visible", value: true },
    ]);
  });

  it("resets the value when the effect kind changes", async () => {
    const user = userEvent.setup();
    const onChange = setup([{ when: eq("x", "co"), target: "a", effect: "value", value: "hello" }]);

    // [0]=source field, [1]=target, [2]=effect
    const effectSelect = screen.getAllByRole("combobox")[2];
    await user.click(effectSelect);
    await user.click(await screen.findByText("Show / hide"));

    expect(onChange).toHaveBeenCalledWith([
      { when: eq("x", "co"), target: "a", effect: "visible", value: true },
    ]);
  });

  it("excludes the host field from the target candidates", async () => {
    const user = userEvent.setup();
    setup([{ when: eq("x", "co"), target: "a", effect: "visible", value: true }]);

    // open the target select ([1]) and inspect its options
    const targetSelect = screen.getAllByRole("combobox")[1];
    await user.click(targetSelect);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).queryByText("self")).toBeNull();
    expect(within(listbox).getByText("b")).toBeTruthy();
  });

  it("removes a reaction", async () => {
    const user = userEvent.setup();
    const onChange = setup([{ when: eq("x", "co"), target: "a", effect: "visible", value: true }]);

    await user.click(screen.getByRole("button", { name: "✕" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("switches to the required effect with a Require/Optional value control", async () => {
    const user = userEvent.setup();
    const onChange = setup([{ when: eq("x", "co"), target: "a", effect: "visible", value: true }]);

    // [0]=source field, [1]=target, [2]=effect
    const effectSelect = screen.getAllByRole("combobox")[2];
    await user.click(effectSelect);
    await user.click(await screen.findByText("Require / optional"));

    expect(onChange).toHaveBeenCalledWith([
      { when: eq("x", "co"), target: "a", effect: "required", value: true },
    ]);
  });

  it("shows a read-only hint for a non-simple condition", () => {
    setup([{ when: { rule: { ">": [{ var: "x" }, 5] } }, target: "a", effect: "visible" }]);

    expect(screen.getByText(/edit via the JSON panel/i)).toBeTruthy();
  });
});
