import { describe, expect, it } from "vitest";
import { filterLookupRows, type LookupField, lookupColumns, lookupPatch } from "./lookup.js";

const customer: LookupField = {
  type: "lookup",
  name: "customer",
  label: "Customer",
  dataSource: { url: "/api/customers", labelKey: "name", valueKey: "code" },
  mapping: [
    { from: "taxCode", to: "taxCode" },
    { from: "address", to: "address" },
  ],
};

const rows = [
  { code: "C1", name: "Alpha Ltd", taxCode: "0101", address: "1 Main St" },
  { code: "C2", name: "Beta Co", taxCode: "0202" },
];

describe("lookupColumns", () => {
  it("derives label/value keys plus every mapped key when none are authored", () => {
    expect(lookupColumns(customer)).toEqual([
      { key: "name", title: "name" },
      { key: "code", title: "code" },
      { key: "taxCode", title: "taxCode" },
      { key: "address", title: "address" },
    ]);
  });

  it("dedupes a mapped key that is already the label or value key", () => {
    const node: LookupField = { ...customer, mapping: [{ from: "name", to: "customerName" }] };
    expect(lookupColumns(node).map((c) => c.key)).toEqual(["name", "code"]);
  });

  it("uses authored columns as-is", () => {
    const node: LookupField = { ...customer, columns: [{ key: "code", title: "Mã" }] };
    expect(lookupColumns(node)).toEqual([{ key: "code", title: "Mã" }]);
  });

  it("returns nothing for an unconfigured lookup", () => {
    expect(lookupColumns({ type: "lookup", name: "l1", label: "L" })).toEqual([]);
  });
});

describe("lookupPatch", () => {
  it("maps response keys onto target field names", () => {
    expect(lookupPatch(rows[0], customer.mapping)).toEqual({
      taxCode: "0101",
      address: "1 Main St",
    });
  });

  it("assigns undefined for a key the picked row lacks, so a stale value is CLEARED", () => {
    const patch = lookupPatch(rows[1], customer.mapping);
    expect(patch).toEqual({ taxCode: "0202", address: undefined });
    expect("address" in patch).toBe(true);
  });

  it("is empty without a mapping", () => {
    expect(lookupPatch(rows[0], undefined)).toEqual({});
  });
});

describe("filterLookupRows", () => {
  const columns = lookupColumns(customer);

  it("keeps everything for an empty query", () => {
    expect(filterLookupRows(rows, columns, "   ")).toHaveLength(2);
  });

  it("matches any displayed column, case-insensitively", () => {
    expect(filterLookupRows(rows, columns, "alpha")).toEqual([rows[0]]);
    expect(filterLookupRows(rows, columns, "0202")).toEqual([rows[1]]);
  });

  it("ignores keys that are not displayed columns", () => {
    expect(filterLookupRows(rows, [{ key: "code", title: "Code" }], "alpha")).toEqual([]);
  });
});
