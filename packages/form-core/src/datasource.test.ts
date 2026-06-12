import { describe, expect, it, vi } from "vitest";
import {
  buildDataSourceUrl,
  dataSourceDeps,
  dataSourceReady,
  fetchDataSourceOptions,
  type SelectDataSource,
} from "./datasource.js";

const countries: SelectDataSource = {
  url: "https://api.test/countries",
  labelKey: "name",
  valueKey: "code",
};
const cities: SelectDataSource = {
  url: "https://api.test/cities",
  labelKey: "name",
  valueKey: "id",
  dependsOn: "country",
};
// Level 2: two params from other fields, with names decoupled from the field names.
const districts: SelectDataSource = {
  url: "https://api.test/districts",
  labelKey: "name",
  valueKey: "id",
  params: [
    { name: "country", from: "country" },
    { name: "city", from: "cityField" },
  ],
};

describe("dataSourceDeps", () => {
  it("is empty for a static dataSource", () => {
    expect(dataSourceDeps(countries)).toEqual([]);
  });

  it("includes the dependsOn parent", () => {
    expect(dataSourceDeps(cities)).toEqual(["country"]);
  });

  it("includes every params[].from, deduped, dependsOn first", () => {
    const ds = { ...districts, dependsOn: "region" };
    expect(dataSourceDeps(ds)).toEqual(["region", "country", "cityField"]);
  });
});

describe("dataSourceReady", () => {
  it("is ready when there are no deps", () => {
    expect(dataSourceReady(countries, {})).toBe(true);
  });

  it("is not ready until every dep has a present value", () => {
    expect(dataSourceReady(districts, { country: "VN" })).toBe(false);
    expect(dataSourceReady(districts, { country: "VN", cityField: "" })).toBe(false);
    expect(dataSourceReady(districts, { country: "VN", cityField: null })).toBe(false);
    expect(dataSourceReady(districts, { country: "VN", cityField: 7 })).toBe(true);
  });
});

describe("buildDataSourceUrl", () => {
  it("returns the url unchanged when there are no deps", () => {
    expect(buildDataSourceUrl(countries, {})).toBe("https://api.test/countries");
  });

  it("appends the dependsOn parent as a query param named after the field", () => {
    expect(buildDataSourceUrl(cities, { country: "VN" })).toBe(
      "https://api.test/cities?country=VN",
    );
  });

  it("appends every params[] entry as name=<value of from>", () => {
    expect(buildDataSourceUrl(districts, { country: "VN", cityField: 7 })).toBe(
      "https://api.test/districts?country=VN&city=7",
    );
  });

  it("preserves an existing query string on the url", () => {
    const ds = { ...cities, url: "https://api.test/cities?active=1" };
    expect(buildDataSourceUrl(ds, { country: "US" })).toBe(
      "https://api.test/cities?active=1&country=US",
    );
  });

  it("keeps relative urls relative", () => {
    const ds = { ...cities, url: "/api/cities" };
    expect(buildDataSourceUrl(ds, { country: "VN" })).toBe("/api/cities?country=VN");
  });
});

describe("fetchDataSourceOptions", () => {
  it("maps rows via labelKey/valueKey", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ name: "Vietnam", code: "VN" }]),
    } as Response);

    const options = await fetchDataSourceOptions(countries, {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("https://api.test/countries");
    expect(options).toEqual([{ label: "Vietnam", value: "VN" }]);
  });

  it("maps nested rows recursively when childrenKey is set", async () => {
    const ds: SelectDataSource = { ...countries, childrenKey: "regions" };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            name: "Vietnam",
            code: "VN",
            regions: [
              { name: "Ho Chi Minh", code: "HCM", regions: [{ name: "D1", code: "D1" }] },
              { name: "Hanoi", code: "HN" },
            ],
          },
        ]),
    } as Response);

    const options = await fetchDataSourceOptions(ds, {}, fetchImpl);

    expect(options).toEqual([
      {
        label: "Vietnam",
        value: "VN",
        children: [
          { label: "Ho Chi Minh", value: "HCM", children: [{ label: "D1", value: "D1" }] },
          { label: "Hanoi", value: "HN" },
        ],
      },
    ]);
  });

  it("emits no children key on flat sources, even if rows carry extra arrays", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ name: "Vietnam", code: "VN", regions: [{ name: "X" }] }]),
    } as Response);

    const options = await fetchDataSourceOptions(countries, {}, fetchImpl);

    expect(options).toEqual([{ label: "Vietnam", value: "VN" }]);
    expect("children" in (options[0] as object)).toBe(false);
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve(null),
    } as Response);

    await expect(fetchDataSourceOptions(countries, {}, fetchImpl)).rejects.toThrow(
      "Request failed (500)",
    );
  });
});
