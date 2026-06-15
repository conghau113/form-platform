import { migrate } from "@org/form-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  boxesIntersect,
  DesignCanvas,
  DesignerProvider,
  type DesignerValue,
  edgeScroll,
  normalizeBox,
  springLoadTarget,
} from "./DesignCanvas";
import { schemaToTree, treeToSchema } from "./engine/transform";
import type { TreeNode } from "./engine/tree";
import type { DragState } from "./useDragon";
import { HoverProvider } from "./workbench/hover";

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

  it("computes edge auto-scroll deltas only inside the edge band (D3)", () => {
    const rect = { top: 0, bottom: 600, left: 0, right: 800 };
    // Comfortably inside → no scroll.
    expect(edgeScroll({ x: 400, y: 300 }, rect, 56, 20)).toEqual({ dx: 0, dy: 0 });
    // Near the top edge → scroll up (negative dy), ramped (not yet max).
    const up = edgeScroll({ x: 400, y: 10 }, rect, 56, 20);
    expect(up.dy).toBeLessThan(0);
    expect(up.dy).toBeGreaterThan(-20);
    // At/over the bottom edge → scroll down at max speed.
    expect(edgeScroll({ x: 400, y: 600 }, rect, 56, 20).dy).toBe(20);
    // Past the right edge → max rightward scroll, clamped.
    expect(edgeScroll({ x: 900, y: 300 }, rect, 56, 20).dx).toBe(20);
  });

  it("normalizes corner points and tests box intersection (D7)", () => {
    expect(normalizeBox({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({
      left: 0,
      top: 5,
      right: 10,
      bottom: 20,
    });
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(boxesIntersect(a, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(true);
    expect(boxesIntersect(a, { left: 20, top: 20, right: 30, bottom: 30 })).toBe(false);
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

  it("spring-loads only CLOSED tab/collapse headers (D4)", () => {
    const make = (html: string) => {
      const root = document.createElement("div");
      root.innerHTML = html;
      return root.firstElementChild as HTMLElement;
    };
    // Inactive tab → springs; active tab → no.
    const inactiveTab = make('<div class="ant-tabs-tab"><span>T</span></div>');
    expect(springLoadTarget(inactiveTab.querySelector("span"))).toBe(inactiveTab);
    const activeTab = make('<div class="ant-tabs-tab ant-tabs-tab-active"><span>T</span></div>');
    expect(springLoadTarget(activeTab.querySelector("span"))).toBeNull();
    // Collapsed panel header → springs; expanded → no.
    const closed = make(
      '<div class="ant-collapse-item"><div class="ant-collapse-header">H</div></div>',
    );
    expect(springLoadTarget(closed.querySelector(".ant-collapse-header"))).toBe(
      closed.querySelector(".ant-collapse-header"),
    );
    const open = make(
      '<div class="ant-collapse-item ant-collapse-item-active"><div class="ant-collapse-header">H</div></div>',
    );
    expect(springLoadTarget(open.querySelector(".ant-collapse-header"))).toBeNull();
    expect(springLoadTarget(null)).toBeNull();
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
