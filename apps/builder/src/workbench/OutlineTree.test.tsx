import { migrate } from "@org/form-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesignerProvider, type DesignerValue } from "../canvas/DesignerContext";
import { schemaToTree } from "../engine/transform";
import type { TreeNode } from "../engine/tree";
import { HoverProvider, useHover } from "./hover";
import { OutlineTree } from "./OutlineTree";

const src = {
  formVersion: 3,
  id: "t",
  title: "My form",
  fields: [
    { type: "card", title: "Profile card", children: [{ type: "text", name: "a", label: "A" }] },
    { type: "text", name: "b", label: "B" },
  ],
};

/** Exposes the shared hover uid so tests can assert outline↔canvas sync. */
function HoverProbe() {
  const { hovered } = useHover();
  return <div data-testid="hovered">{hovered ?? "none"}</div>;
}

function setup(overrides: Partial<DesignerValue> = {}) {
  const tree: TreeNode = schemaToTree(migrate(src));
  const value: DesignerValue = {
    selected: [],
    drag: null,
    beginMove: vi.fn(),
    beginCreate: vi.fn(),
    copy: vi.fn(),
    remove: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setSelected: vi.fn(),
    resizeColSpan: vi.fn(),
    ...overrides,
  };
  const result = render(
    <DesignerProvider value={value}>
      <HoverProvider>
        <OutlineTree root={tree} />
        <HoverProbe />
      </HoverProvider>
    </DesignerProvider>,
  );
  return { ...result, value, tree };
}

function rowOf(container: HTMLElement, uid: string): HTMLElement {
  const row = container.querySelector(`[data-designer-node-id="${uid}"]`);
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

describe("OutlineTree", () => {
  it("renders a labeled row for every node in the tree", () => {
    setup();
    for (const label of ["My form", "Profile card", "A", "B"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("starts a move drag on a draggable row, sharing the canvas engine", () => {
    const { container, tree, value } = setup();
    const uid = tree.children[1].uid; // field "b"
    fireEvent.pointerDown(rowOf(container, uid));
    expect(value.beginMove).toHaveBeenCalledWith([uid], expect.anything(), uid);
  });

  it("selects (never drags) the non-draggable Form root", () => {
    const { container, tree, value } = setup();
    fireEvent.pointerDown(rowOf(container, tree.uid));
    // jsdom's synthetic pointer event has no modifier keys — assert "not additive"
    // as falsy rather than a literal false.
    expect(value.select).toHaveBeenCalledTimes(1);
    const [uid, additive] = vi.mocked(value.select).mock.calls[0];
    expect(uid).toBe(tree.uid);
    expect(additive).toBeFalsy();
    expect(value.beginMove).not.toHaveBeenCalled();
  });

  it("publishes hover to the shared context and clears it on leave", () => {
    const { container, tree } = setup();
    const uid = tree.children[0].uid;
    fireEvent.pointerOver(rowOf(container, uid));
    expect(screen.getByTestId("hovered").textContent).toBe(uid);
    const panel = rowOf(container, tree.uid).parentElement?.parentElement as HTMLElement;
    fireEvent.pointerLeave(panel);
    expect(screen.getByTestId("hovered").textContent).toBe("none");
  });

  it("collapses and re-expands a container's children", () => {
    const { tree, value } = setup();
    const card = tree.children[0];
    // Collapse the Card row: its child "A" disappears, nothing is deleted.
    fireEvent.click(screen.getAllByLabelText("Collapse")[1]);
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.getByText("Profile card")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Expand"));
    expect(screen.getByText("A")).toBeTruthy();
    expect(value.remove).not.toHaveBeenCalled();
    expect(card.children).toHaveLength(1);
  });
});
