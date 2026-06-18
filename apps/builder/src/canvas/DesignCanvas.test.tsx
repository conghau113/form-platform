import { migrate } from "@org/form-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { schemaToTree, treeToSchema } from "../engine/transform";
import type { TreeNode } from "../engine/tree";
import { HoverProvider } from "../workbench/hover";
import { DesignCanvas } from "./DesignCanvas";
import { DesignerProvider, type DesignerValue } from "./DesignerContext";
import type { DragState } from "./useDragon";

/** A minimal in-flight drag (D2/ghost tests only care about `valid`). */
function dragState(valid: boolean): DragState {
  return {
    source: { kind: "create", fieldType: "text" },
    point: { x: 0, y: 0 },
    intent: null,
    axis: "vertical",
    valid,
    label: "Text",
    copy: false,
    ghost: null,
  };
}

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
    setSelected: vi.fn(),
    resizeColSpan: vi.fn(),
    ...overrides,
  };
  const result = render(
    <HoverProvider>
      <DesignerProvider value={value}>
        <DesignCanvas schema={schema} json={JSON.stringify(schema)} tree={t} />
      </DesignerProvider>
    </HoverProvider>,
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

  it("exposes a drag handle on the hover name tag (D2 discoverability)", () => {
    const { container, tree, value } = setup();
    const uid = tree.children[0].uid;
    const shell = container.querySelector(`[data-designer-node-id="${uid}"]`) as HTMLElement;
    // Hover the node → the name tag becomes an explicit grab handle.
    fireEvent.pointerOver(shell);
    const handle = screen.getByTitle("Drag to move");
    expect(handle.style.cursor).toBe("grab");
    fireEvent.pointerDown(handle);
    expect(value.beginMove).toHaveBeenCalledWith([uid], expect.anything(), uid);
  });

  it("shows a global grabbing / no-drop cursor while a drag is in flight (D2)", () => {
    const { unmount } = setup({ drag: dragState(true) });
    expect(document.body.style.cursor).toBe("grabbing");
    unmount();
    // A drag over an invalid target switches the whole canvas to no-drop.
    setup({ drag: dragState(false) });
    expect(document.body.style.cursor).toBe("no-drop");
  });

  it("marquee-selects the node shells it sweeps over (D7)", () => {
    const { container, tree, value } = setup();
    const uid = tree.children[0].uid;
    const shell = container.querySelector(`[data-designer-node-id="${uid}"]`) as HTMLElement;
    shell.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 40 }) as DOMRect;
    const scroll = container.firstElementChild as HTMLElement;
    const fire = (target: HTMLElement | Window, type: string, x: number, y: number) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }),
      );
    fire(scroll, "pointerdown", -5, -5);
    fire(window, "pointermove", 60, 60); // crosses the threshold → rubber-band
    fire(window, "pointerup", 60, 60);
    expect(value.setSelected).toHaveBeenCalledWith([uid]);
  });

  it("a no-move press on empty canvas clears the selection instead of a marquee (D7)", () => {
    const { container, value } = setup();
    const scroll = container.firstElementChild as HTMLElement;
    const fire = (target: HTMLElement | Window, type: string, x: number, y: number) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }),
      );
    fire(scroll, "pointerdown", 10, 10);
    fire(window, "pointerup", 10, 10);
    expect(value.clearSelection).toHaveBeenCalled();
    expect(value.setSelected).not.toHaveBeenCalled();
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
