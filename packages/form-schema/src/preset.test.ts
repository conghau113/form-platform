import { describe, expect, it } from "vitest";
import { type Preset, parsePreset } from "./index.js";

const valid: Preset = {
  id: "builtin-search",
  fieldType: "text",
  name: "Search input",
  icon: "antd:SearchOutlined",
  patch: { prefixIcon: "antd:SearchOutlined", placeholder: "Search" },
};

describe("parsePreset", () => {
  it("accepts a valid preset and round-trips it", () => {
    expect(parsePreset(valid)).toEqual(valid);
  });

  it("accepts a preset without an icon", () => {
    const { icon, ...noIcon } = valid;
    expect(parsePreset(noIcon)).toEqual(noIcon);
  });

  it("rejects a missing name", () => {
    const { name, ...rest } = valid;
    expect(() => parsePreset(rest)).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => parsePreset({ ...valid, name: "" })).toThrow();
  });

  it("rejects an id that is not a simple identifier", () => {
    expect(() => parsePreset({ ...valid, id: "bad id!" })).toThrow();
  });

  it("rejects a non-object patch", () => {
    expect(() => parsePreset({ ...valid, patch: "nope" })).toThrow();
  });

  it("accepts a global preset without a projectId", () => {
    const global: Preset = { ...valid, scope: "global" };
    expect(parsePreset(global)).toEqual(global);
  });

  it("accepts a project-scoped preset with a projectId", () => {
    const scoped: Preset = { ...valid, scope: "project", projectId: "proj-1" };
    expect(parsePreset(scoped)).toEqual(scoped);
  });

  it("rejects a project-scoped preset without a projectId", () => {
    expect(() => parsePreset({ ...valid, scope: "project" })).toThrow();
  });

  it("rejects an unknown scope", () => {
    expect(() => parsePreset({ ...valid, scope: "team" })).toThrow();
  });
});
