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
    clearSelection: vi.fn(),
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
    expect(value.beginMove).toHaveBeenCalledWith([uid], expect.anything());
  });

  it("shows the selection toolbar (copy/delete) for the selected node", () => {
    const tree = schemaToTree(migrate(src));
    const uid = tree.children[0].uid;
    setup({ selected: [uid] }, tree);
    expect(screen.getByTitle("Delete")).toBeTruthy();
    expect(screen.getByTitle("Copy")).toBeTruthy();
  });

  it("shows the empty-state legend when the form has no fields", () => {
    const tree = schemaToTree(migrate({ formVersion: 3, id: "e", title: "E", fields: [] }));
    setup({}, tree);
    expect(screen.getByText(/Drag a field from the palette/i)).toBeTruthy();
  });
});
