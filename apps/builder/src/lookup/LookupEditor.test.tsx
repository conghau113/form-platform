import type { LookupField } from "@org/form-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LookupEditor } from "./LookupEditor";

const DS = { url: "u", labelKey: "name", valueKey: "id" };

function lookupField(over: Partial<LookupField> = {}): LookupField {
  return { type: "lookup", name: "customer", label: "Khách hàng", ...over };
}

function setup(field: LookupField, set = vi.fn()) {
  render(
    <LookupEditor
      field={field}
      sourceNames={["region"]}
      targetNames={["taxCode", "address"]}
      set={set}
    />,
  );
  return set;
}

describe("LookupEditor", () => {
  it("edits the remote source without emitting an `options` key (a lookup has none)", async () => {
    const user = userEvent.setup();
    const set = setup(lookupField());

    // url / labelKey / valueKey are the only textboxes on a fresh, unmapped lookup.
    await user.type(screen.getAllByRole("textbox")[0], "u");

    expect(set).toHaveBeenLastCalledWith({
      dataSource: { url: "u", labelKey: "", valueKey: "" },
    });
  });

  it("adds a column row", async () => {
    const user = userEvent.setup();
    const set = setup(lookupField({ dataSource: DS }));

    await user.click(screen.getByRole("button", { name: "Thêm cột" }));

    expect(set).toHaveBeenLastCalledWith({ columns: [{ key: "", title: "" }] });
  });

  it("edits a column title", async () => {
    const user = userEvent.setup();
    const set = setup(lookupField({ dataSource: DS, columns: [{ key: "taxCode", title: "MST" }] }));

    await user.type(screen.getByPlaceholderText("tiêu đề cột"), "X");

    expect(set).toHaveBeenLastCalledWith({ columns: [{ key: "taxCode", title: "MSTX" }] });
  });

  it("removing the last column writes `undefined`, not an empty list (absent = derive)", async () => {
    const user = userEvent.setup();
    const set = setup(lookupField({ dataSource: DS, columns: [{ key: "taxCode", title: "MST" }] }));

    await user.click(screen.getByRole("button", { name: "Xóa" }));

    expect(set).toHaveBeenLastCalledWith({ columns: undefined });
  });

  it("seeds a new mapping row from targetNames", async () => {
    const user = userEvent.setup();
    const set = setup(lookupField({ dataSource: DS }));

    await user.click(screen.getByRole("button", { name: "Thêm ánh xạ" }));

    // `to` comes from targetNames (form-wide / row-wide scope), not the container siblings.
    expect(set).toHaveBeenLastCalledWith({ mapping: [{ from: "", to: "taxCode" }] });
  });

  it("offers every target name — including fields outside this container — as a target", async () => {
    const user = userEvent.setup();
    setup(lookupField({ mapping: [{ from: "tax_code", to: "taxCode" }] }));

    await user.click(screen.getByRole("combobox"));

    expect(
      screen.getByText("address", { selector: ".ant-select-item-option-content" }),
    ).toBeTruthy();
  });

  it("never offers the lookup itself as an Apply target", async () => {
    const user = userEvent.setup();
    const set = vi.fn();
    render(
      <LookupEditor
        field={lookupField({ name: "org" })}
        sourceNames={[]}
        targetNames={["org", "orgName"]}
        set={set}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Thêm ánh xạ" }));

    // "org" is this field's own name — it holds the picked row's valueKey already.
    expect(set).toHaveBeenLastCalledWith({ mapping: [{ from: "", to: "orgName" }] });
  });

  it("edits the response key of an existing mapping row", async () => {
    const user = userEvent.setup();
    const set = setup(lookupField({ mapping: [{ from: "tax", to: "taxCode" }] }));

    await user.type(screen.getAllByPlaceholderText("khóa trong phản hồi")[0], "X");

    expect(set).toHaveBeenLastCalledWith({ mapping: [{ from: "taxX", to: "taxCode" }] });
  });
});
