import type { LeafField } from "@org/form-schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataSourceEditor } from "./DataSourceEditor";

type SelectField = Extract<LeafField, { type: "select" }>;

function selectField(over: Partial<SelectField> = {}): SelectField {
  return { type: "select", name: "city", label: "City", ...over };
}

function setup(field: SelectField, set = vi.fn()) {
  render(<DataSourceEditor field={field} sourceNames={["country", "region"]} set={set} />);
  return set;
}

describe("DataSourceEditor", () => {
  it("starts in Static mode and edits options", async () => {
    const user = userEvent.setup();
    const set = setup(selectField({ options: [{ label: "Hanoi", value: "hn" }] }));

    expect((screen.getByText("Static").closest("label") as HTMLElement).className).toContain(
      "ant-segmented-item-selected",
    );
    await user.click(screen.getByRole("button", { name: "Add option" }));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ dataSource: undefined, options: expect.any(Array) }),
    );
  });

  it("switching to Remote seeds a dataSource and clears options", async () => {
    const user = userEvent.setup();
    const set = setup(selectField({ options: [{ label: "Hanoi", value: "hn" }] }));

    await user.click(screen.getByText("Remote (data source)"));

    expect(set).toHaveBeenCalledWith({
      options: undefined,
      dataSource: { url: "", labelKey: "", valueKey: "" },
    });
  });

  it("edits url / keys / ttl in Remote mode (clearing options)", async () => {
    const user = userEvent.setup();
    const ds = { url: "https://api.test/cities", labelKey: "name", valueKey: "id" };
    const set = setup(selectField({ dataSource: ds }));

    await user.type(screen.getByRole("spinbutton"), "5");

    expect(set).toHaveBeenLastCalledWith({
      options: undefined,
      dataSource: { ...ds, ttlMs: 5 },
    });
  });

  it("adds a param row bound to a source field", async () => {
    const user = userEvent.setup();
    const ds = { url: "u", labelKey: "name", valueKey: "id" };
    const set = setup(selectField({ dataSource: ds }));

    await user.click(screen.getByRole("button", { name: "Add param" }));

    expect(set).toHaveBeenLastCalledWith({
      options: undefined,
      dataSource: { ...ds, params: [{ name: "", from: "country" }], dependsOn: undefined },
    });
  });

  it("surfaces a legacy dependsOn as a param row and normalizes it on edit", async () => {
    const user = userEvent.setup();
    const ds = { url: "u", labelKey: "name", valueKey: "id", dependsOn: "country" };
    const set = setup(selectField({ dataSource: ds }));

    // The legacy `dependsOn` surfaces as a single param row, seeded name = the field.
    const nameInput = screen.getByPlaceholderText("query name") as HTMLInputElement;
    expect(nameInput.value).toBe("country");
    expect(screen.getByText("country", { selector: ".ant-select-selection-item" })).toBeTruthy();

    // Editing the row writes `params` and drops `dependsOn`.
    await user.type(nameInput, "X");

    expect(set).toHaveBeenLastCalledWith({
      options: undefined,
      dataSource: {
        url: "u",
        labelKey: "name",
        valueKey: "id",
        dependsOn: undefined,
        params: [{ name: "countryX", from: "country" }],
      },
    });
  });
});
