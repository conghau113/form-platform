import { migrate } from "@org/form-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesignCanvas, DesignerProvider, type DesignerValue } from "./DesignCanvas";
import { schemaToTree, treeToSchema } from "./engine/transform";
import type { TreeNode } from "./engine/tree";

const src = {
  formVersion: 3,
  id: "t",
  title: "T",
  fields: [{ type: "text", name: "a", label: "A" }],
};

function setup(overrides: Partial<DesignerValue> = {}, tree?: TreeNode) {
  const t = tree ?? schemaToTree(migrate(src));
  const schema = treeToSchema(t);
  const value: DesignerValue = {
    selected: [],
    drag: null,
    beginMove: vi.fn(),
    beginCreate: vi.fn(),
    copy: vi.fn(),
    remove: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    resizeColSpan: vi.fn(),
    ...overrides,
  };
  const result = render(
    <DesignerProvider value={value}>
      <DesignCanvas schema={schema} json={JSON.stringify(schema)} tree={t} />
    </DesignerProvider>,
  );
  return { ...result, value, tree: t };
}

describe("DesignCanvas", () => {
  it("wraps each rendered node in a shell carrying its tree uid", () => {
    const { container, tree } = setup();
    const uid = tree.children[0].uid;
    const shell = container.querySelector(`[data-designer-node-id="${uid}"]`);
    expect(shell).not.toBeNull();
    // The real antd input is rendered inside the shell (true WYSIWYG, not a summary row).
    expect(screen.getByLabelText("A")).toBeTruthy();
  });

  it("starts a move drag on pointer-down over a node shell", () => {
    const { container, tree, value } = setup();
    const uid = tree.children[0].uid;
    const shell = container.querySelector(`[data-designer-node-id="${uid}"]`) as HTMLElement;
    fireEvent.pointerDown(shell);
    // Single node: drag set is [uid] and the click-select uid is the pressed node.
    expect(value.beginMove).toHaveBeenCalledWith([uid], expect.anything(), uid);
  });

  it("shows the selection toolbar (copy/delete) for the selected node", () => {
    const tree = schemaToTree(migrate(src));
    const uid = tree.children[0].uid;
    setup({ selected: [uid] }, tree);
    expect(screen.getByTitle("Delete")).toBeTruthy();
    expect(screen.getByTitle("Copy")).toBeTruthy();
  });

  it("shows a grid-resize handle for a selected leaf field", () => {
    const tree = schemaToTree(migrate(src));
    const uid = tree.children[0].uid;
    setup({ selected: [uid] }, tree);
    expect(screen.getByTitle("Drag to resize column")).toBeTruthy();
  });

  it("drag-resizing the handle writes the active breakpoint's colSpan", () => {
    const tree = schemaToTree(migrate(src));
    const uid = tree.children[0].uid;
    const { container, value } = setup({ selected: [uid] }, tree);
    const shell = container.querySelector(`[data-designer-node-id="${uid}"]`) as HTMLElement;
    const col = shell.parentElement as HTMLElement;
    const row = col.closest(".ant-row") as HTMLElement;
    // 24 cols across 240px → 10px/col. Start at half width (12), drag to full (24).
    const rect = (width: number) =>
      ({
        width,
        height: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    row.getBoundingClientRect = () => rect(240);
    col.getBoundingClientRect = () => rect(120);
    const handle = screen.getByTitle("Drag to resize column");
    // jsdom's PointerEvent drops clientX; a MouseEvent typed as a pointer event keeps it.
    const fire = (target: HTMLElement | Window, type: string, clientX = 0) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX }));
    fire(handle, "pointerdown", 120);
    fire(window, "pointermove", 240); // +120px over a 10px/col grid → span 24
    expect(value.resizeColSpan).toHaveBeenCalledWith(uid, "lg", 24, expect.any(String));
    fire(window, "pointerup");
  });

  it("shows the empty-state legend when the form has no fields", () => {
    const tree = schemaToTree(migrate({ formVersion: 3, id: "e", title: "E", fields: [] }));
    setup({}, tree);
    expect(screen.getByText(/Drag a field from the palette/i)).toBeTruthy();
  });

  it("keeps the empty form card as a root drop target so fields can be dragged back in", () => {
    const tree = schemaToTree(migrate({ formVersion: 3, id: "e", title: "E", fields: [] }));
    const { container } = setup({}, tree);
    // The card carries the ROOT uid; without it an emptied form has no hit-test target.
    const card = container.querySelector(`[data-designer-node-id="${tree.uid}"]`);
    expect(card).not.toBeNull();
    expect(card?.textContent).toMatch(/Drag a field from the palette/i);
  });
});
