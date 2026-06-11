import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormRenderer, type NodeWrapperContext } from "./FormRenderer.js";

/** A schema exercising leaves + every container + an array, with hand-checkable paths:
 *  [0] text · [1] card > ([1,0] text, [1,1] grid > [1,1,0] text) · [2] tabs >
 *  ([2,0] pane > [2,0,0] text, [2,1] pane) · [3] array (itemFields NOT walked). */
const schema = {
  formVersion: 3,
  id: "design",
  title: "Design",
  fields: [
    { type: "text", name: "a", label: "A" },
    {
      type: "card",
      title: "Card",
      children: [
        { type: "text", name: "b", label: "B" },
        { type: "grid", cols: 2, children: [{ type: "text", name: "c", label: "C" }] },
      ],
    },
    {
      type: "tabs",
      children: [
        { type: "tab-pane", label: "One", children: [{ type: "text", name: "d", label: "D" }] },
        { type: "tab-pane", label: "Two", children: [] },
      ],
    },
    {
      type: "array",
      name: "arr",
      label: "Arr",
      itemFields: [{ type: "text", name: "x", label: "X" }],
    },
  ],
};

/** Collect every (type, path) the wrapper sees, and stamp a locatable shell. */
function collectingWrapper(seen: Array<{ type: string; path: string }>) {
  return (rendered: React.ReactNode, { node, path }: NodeWrapperContext) => {
    seen.push({ type: node.type, path: path.join("-") });
    return (
      <div data-designer-node-id={path.join("-")} data-designer-type={node.type}>
        {rendered}
      </div>
    );
  };
}

describe("FormRenderer design mode", () => {
  it("invokes nodeWrapper once per authorable node with the correct positional path", () => {
    const seen: Array<{ type: string; path: string }> = [];
    render(<FormRenderer schema={schema} nodeWrapper={collectingWrapper(seen)} />);

    // The form re-renders (RHF `watch`), so the wrapper fires repeatedly; assert on the
    // de-duplicated (path → type) map rather than raw call counts.
    const byPath = new Map(seen.map((s) => [s.path, s.type]));
    expect(byPath.get("0")).toBe("text");
    expect(byPath.get("1")).toBe("card");
    expect(byPath.get("1-0")).toBe("text");
    expect(byPath.get("1-1")).toBe("grid");
    expect(byPath.get("1-1-0")).toBe("text");
    expect(byPath.get("2")).toBe("tabs");
    expect(byPath.get("2-0")).toBe("tab-pane");
    expect(byPath.get("2-0-0")).toBe("text");
    expect(byPath.get("2-1")).toBe("tab-pane");
    expect(byPath.get("3")).toBe("array");

    // Exactly those 10 nodes are wrapped — array item fields (rendered per-row, not
    // authored on the canvas) are never wrapped, so no path descends into [3].
    expect([...byPath.keys()].sort()).toEqual(
      ["0", "1", "1-0", "1-1", "1-1-0", "2", "2-0", "2-0-0", "2-1", "3"].sort(),
    );
  });

  it("stamps data-designer-node-id on the rendered shell", () => {
    const seen: Array<{ type: string; path: string }> = [];
    const { container } = render(
      <FormRenderer schema={schema} nodeWrapper={collectingWrapper(seen)} />,
    );
    expect(container.querySelector('[data-designer-node-id="0"]')).not.toBeNull();
    expect(container.querySelector('[data-designer-type="card"]')).not.toBeNull();
  });

  it("keeps original sibling paths when a pane is hidden by visibleWhen", () => {
    const hidden = {
      formVersion: 3,
      id: "hidden-pane",
      title: "Hidden pane",
      fields: [
        {
          type: "tabs",
          children: [
            {
              type: "tab-pane",
              label: "Shown",
              visibleWhen: { rule: { "==": [1, 0] } },
              children: [],
            },
            {
              type: "tab-pane",
              label: "Visible",
              children: [{ type: "text", name: "v", label: "V" }],
            },
          ],
        },
      ],
    };
    const seen: Array<{ type: string; path: string }> = [];
    render(<FormRenderer schema={hidden} nodeWrapper={collectingWrapper(seen)} />);
    // The first pane is hidden; the second keeps its ORIGINAL index 1 (not collapsed to 0),
    // so its child stays at [0,1,0] — the designer can still map it to the right uid.
    expect(seen.find((s) => s.path === "0-1")?.type).toBe("tab-pane");
    expect(seen.find((s) => s.path === "0-1-0")?.type).toBe("text");
    expect(seen.some((s) => s.path === "0-0")).toBe(false);
  });

  it("renders inputs fully visible but pointer-inert in design mode, and hides Submit", () => {
    render(<FormRenderer schema={schema} designMode />);
    const input = screen.getByLabelText("A");
    expect(input).toBeVisible();
    const inert = input.closest('[style*="pointer-events: none"]');
    expect(inert).not.toBeNull();
    expect(inert).toContainElement(input);
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("is inert-free and unchanged without designMode/nodeWrapper (runtime regression)", () => {
    const { container } = render(<FormRenderer schema={schema} />);
    expect(container.querySelector("[data-designer-node-id]")).toBeNull();
    expect(container.querySelector('[style*="pointer-events: none"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });
});
