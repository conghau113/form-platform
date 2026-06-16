import type { FieldNode, Preset } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { computeOverrides, linkPatch, presetResolverFromList, UNLINK_PATCH } from "./link";

const preset: Preset = {
  id: "org_select",
  fieldType: "text",
  name: "Organization",
  patch: { label: "Organization", placeholder: "Pick one", allowClear: true },
};

describe("computeOverrides", () => {
  it("returns only the keys that diverge from the preset patch", () => {
    const field = {
      type: "text",
      name: "org",
      label: "Org (custom)", // diverges
      placeholder: "Pick one", // same as patch
      allowClear: true, // same as patch
      presetId: "org_select",
      overrides: {},
    } as unknown as FieldNode;
    expect(computeOverrides(field, preset.patch)).toEqual({ label: "Org (custom)" });
  });

  it("captures a key the preset does not define", () => {
    const field = {
      type: "text",
      name: "org",
      label: "Organization",
      maxLength: 50, // not in patch → an override
    } as unknown as FieldNode;
    expect(computeOverrides(field, preset.patch)).toEqual({ maxLength: 50 });
  });

  it("ignores instance-identity and link keys, and undefined values", () => {
    const field = {
      type: "text",
      name: "org",
      label: "Organization",
      placeholder: "Pick one",
      allowClear: true,
      helpText: undefined,
      presetId: "org_select",
      overrides: { stale: 1 },
    } as unknown as FieldNode;
    expect(computeOverrides(field, preset.patch)).toEqual({});
  });
});

describe("linkPatch / UNLINK_PATCH", () => {
  it("adopts the preset props, sets the link, and starts overrides empty", () => {
    expect(linkPatch(preset)).toEqual({
      label: "Organization",
      placeholder: "Pick one",
      allowClear: true,
      presetId: "org_select",
      overrides: {},
    });
  });

  it("clears the link metadata on unlink", () => {
    expect(UNLINK_PATCH).toEqual({ presetId: undefined, overrides: undefined });
  });
});

describe("presetResolverFromList", () => {
  it("resolves by id to the preset's fieldType + patch, undefined when unknown", () => {
    const resolve = presetResolverFromList([preset]);
    expect(resolve("org_select")).toEqual({ fieldType: "text", patch: preset.patch });
    expect(resolve("missing")).toBeUndefined();
  });
});
