import type { TreeOption } from "@org/form-schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TreeOptionsEditor } from "./TreeOptionsEditor";

const tree: TreeOption[] = [
  {
    label: "Vietnam",
    value: "vn",
    children: [{ label: "Hanoi", value: "hn" }],
  },
  { label: "Laos", value: "la" },
];

function setup(options: TreeOption[] = tree) {
  const onChange = vi.fn();
  render(<TreeOptionsEditor options={options} onChange={onChange} />);
  return onChange;
}

describe("TreeOptionsEditor", () => {
  it("renders one label/value row per node, including nested children", () => {
    setup();
    const labels = screen.getAllByPlaceholderText("nhãn") as HTMLInputElement[];
    expect(labels.map((i) => i.value)).toEqual(["Vietnam", "Hanoi", "Laos"]);
  });

  it("edits a nested node's label immutably", async () => {
    const user = userEvent.setup();
    const onChange = setup();

    const hanoi = (screen.getAllByPlaceholderText("nhãn") as HTMLInputElement[])[1];
    await user.type(hanoi, "!");

    expect(onChange).toHaveBeenLastCalledWith([
      { label: "Vietnam", value: "vn", children: [{ label: "Hanoi!", value: "hn" }] },
      { label: "Laos", value: "la" },
    ]);
    // The original tree is untouched (pure update).
    expect(tree[0]?.children?.[0]?.label).toBe("Hanoi");
  });

  it("adds a child under the chosen node", async () => {
    const user = userEvent.setup();
    const onChange = setup();

    // One "+ child" per row; the last belongs to Laos (childless so far).
    const addChild = screen.getAllByRole("button", { name: "+ con" });
    await user.click(addChild[addChild.length - 1] as HTMLElement);

    expect(onChange).toHaveBeenLastCalledWith([
      tree[0],
      { label: "Laos", value: "la", children: [{ label: "", value: "" }] },
    ]);
  });

  it("removes a node together with its subtree", async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getAllByRole("button", { name: "✕" })[0] as HTMLElement);

    expect(onChange).toHaveBeenLastCalledWith([{ label: "Laos", value: "la" }]);
  });

  it("appends a root option", async () => {
    const user = userEvent.setup();
    const onChange = setup();

    await user.click(screen.getByRole("button", { name: "Thêm tùy chọn" }));

    expect(onChange).toHaveBeenLastCalledWith([...tree, { label: "", value: "" }]);
  });
});
