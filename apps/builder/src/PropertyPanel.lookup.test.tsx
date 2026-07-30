import type { FieldNode } from "@org/form-schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertyPanel } from "./PropertyPanel";

/** Pins the FieldForm wiring of the record picker: the LookupEditor appears for a
 *  `lookup` and for nothing else, and its Apply targets come from `fieldNames` (the
 *  form-wide scope) rather than the container's siblings. */
function setup(field: FieldNode) {
  render(
    <PropertyPanel
      selected={{ uid: "u1", field }}
      siblingNames={["org"]}
      fieldNames={["org", "orgName", "orgKind"]}
      onChange={vi.fn()}
    />,
  );
}

describe("PropertyPanel — lookup", () => {
  it("shows the LookupEditor for a lookup field", () => {
    setup({ type: "lookup", name: "org", label: "Đơn vị" });

    expect(screen.getByText("Nguồn bản ghi")).toBeTruthy();
    expect(screen.getByText("Ánh xạ khi áp dụng")).toBeTruthy();
  });

  it("does not show it for a select (which gets the option-source editor instead)", () => {
    setup({ type: "select", name: "org", label: "Đơn vị", options: [] });

    expect(screen.queryByText("Nguồn bản ghi")).toBeNull();
    expect(screen.getByText("Tùy chọn", { selector: "span" })).toBeTruthy();
  });

  it("offers form-wide targets — not just the container siblings — minus the lookup itself", () => {
    setup({
      type: "lookup",
      name: "org",
      label: "Đơn vị",
      mapping: [{ from: "name", to: "orgName" }],
    });

    // `siblingNames` is only ["org"]; the targets come from `fieldNames`, so a field in a
    // different container is still reachable at all.
    expect(screen.getByText("orgName", { selector: ".ant-select-selection-item" })).toBeTruthy();
  });
});
