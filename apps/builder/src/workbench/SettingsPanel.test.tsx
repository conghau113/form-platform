import { migrate } from "@org/form-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { schemaToTree } from "../engine/transform";
import type { FormProps, TreeNode } from "../engine/tree";
import { PropertyPanel } from "../PropertyPanel";
import { SettingsPanel } from "./SettingsPanel";

const src = {
  formVersion: 3,
  id: "t",
  title: "My form",
  fields: [
    { type: "card", title: "Card", children: [{ type: "text", name: "a", label: "A" }] },
    { type: "text", name: "b", label: "B" },
  ],
};

function setup(selectedUid: (tree: TreeNode) => string | null, children?: React.ReactNode) {
  const tree = schemaToTree(migrate(src));
  const onSelect = vi.fn();
  render(
    <SettingsPanel tree={tree} selectedUid={selectedUid(tree)} onSelect={onSelect}>
      {children ?? <div data-testid="panel-body" />}
    </SettingsPanel>,
  );
  return { tree, onSelect };
}

describe("SettingsPanel", () => {
  beforeEach(() => localStorage.clear());

  it("shows the selected node's ancestor breadcrumb and navigates on crumb click", () => {
    const { tree, onSelect } = setup((t) => t.children[0].children[0].uid); // field "a"
    // Path crumbs: My form / Card / A (the leaf is plain text, ancestors are links).
    expect(screen.getByText("A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /My form/ }));
    expect(onSelect).toHaveBeenCalledWith(tree.uid);
    fireEvent.click(screen.getByRole("button", { name: /Card/ }));
    expect(onSelect).toHaveBeenCalledWith(tree.children[0].uid);
  });

  it("collapses to a slim rail and reopens, keeping the body mounted only while open", () => {
    setup(() => null);
    expect(screen.getByTestId("panel-body")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close settings"));
    expect(screen.queryByTestId("panel-body")).toBeNull();
    fireEvent.click(screen.getByLabelText("Open settings"));
    expect(screen.getByTestId("panel-body")).toBeTruthy();
  });

  it("edits the root Form's identity and layout settings when it is selected", () => {
    const tree = schemaToTree(migrate(src));
    const onChangeForm = vi.fn();
    render(
      <SettingsPanel tree={tree} selectedUid={tree.uid} onSelect={vi.fn()}>
        <PropertyPanel
          selected={null}
          form={tree.node as FormProps}
          siblingNames={[]}
          fieldNames={[]}
          onChange={vi.fn()}
          onChangeForm={onChangeForm}
        />
      </SettingsPanel>,
    );

    // Identity: the title input is pre-filled from the root node.
    fireEvent.change(screen.getByDisplayValue("My form"), { target: { value: "Renamed" } });
    expect(onChangeForm).toHaveBeenCalledWith({ title: "Renamed" });

    // Layout: a FORM_META descriptor control maps onto layoutProps.
    fireEvent.click(screen.getByLabelText("Show colon"));
    expect(onChangeForm).toHaveBeenCalledWith({ layoutProps: { colon: true } });
  });
});
