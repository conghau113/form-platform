import { describe, expect, it, vi } from "vitest";
import { buildDataSourceUrl, fetchDataSourceOptions, type SelectDataSource } from "./datasource.js";

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

describe("buildDataSourceUrl", () => {
  it("returns the url unchanged when there is no dependsOn", () => {
    expect(buildDataSourceUrl(countries, "VN")).toBe("https://api.test/countries");
  });

  it("appends the parent value as a query param named after dependsOn", () => {
    expect(buildDataSourceUrl(cities, "VN")).toBe("https://api.test/cities?country=VN");
  });

  it("preserves an existing query string on the url", () => {
    const ds = { ...cities, url: "https://api.test/cities?active=1" };
    expect(buildDataSourceUrl(ds, "US")).toBe("https://api.test/cities?active=1&country=US");
  });

  it("keeps relative urls relative", () => {
    const ds = { ...cities, url: "/api/cities" };
    expect(buildDataSourceUrl(ds, "VN")).toBe("/api/cities?country=VN");
  });
});

describe("fetchDataSourceOptions", () => {
  it("maps rows via labelKey/valueKey", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ name: "Vietnam", code: "VN" }]),
    } as Response);

    const options = await fetchDataSourceOptions(countries, undefined, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("https://api.test/countries");
    expect(options).toEqual([{ label: "Vietnam", value: "VN" }]);
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve(null),
    } as Response);

    await expect(fetchDataSourceOptions(countries, undefined, fetchImpl)).rejects.toThrow(
      "Request failed (500)",
    );
  });
});
