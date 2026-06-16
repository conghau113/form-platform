import type { FormSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { type PresetLike, type PresetResolver, resolveLinkedFields } from "./presets.js";

const form = (fields: unknown[]): FormSchema =>
  ({ formVersion: 3, id: "f", title: "F", fields }) as FormSchema;

const resolverFrom =
  (presets: Record<string, PresetLike>): PresetResolver =>
  (id) =>
    presets[id];

describe("resolveLinkedFields", () => {
  it("re-syncs a linked field: preset patch is the base, overrides win", () => {
    const input = form([
      {
        type: "text",
        name: "org",
        label: "stale snapshot label",
        placeholder: "stale",
        presetId: "org_select",
        overrides: { label: "Org (custom)" },
      },
    ]);
    const {
      form: out,
      missing,
      mismatched,
    } = resolveLinkedFields(
      input,
      resolverFrom({
        org_select: {
          fieldType: "text",
          patch: { label: "Organization", placeholder: "Pick one" },
        },
      }),
    );
    const f = out.fields[0] as Record<string, unknown>;
    // preset propagates (placeholder), override wins over preset (label), identity preserved.
    expect(f.placeholder).toBe("Pick one");
    expect(f.label).toBe("Org (custom)");
    expect(f.name).toBe("org");
    expect(f.type).toBe("text");
    expect(f.presetId).toBe("org_select");
    expect(missing).toEqual([]);
    expect(mismatched).toEqual([]);
  });

  it("freezes to the snapshot and reports a missing preset", () => {
    const input = form([
      { type: "text", name: "org", label: "Frozen", presetId: "gone", overrides: {} },
    ]);
    const { form: out, missing } = resolveLinkedFields(input, resolverFrom({}));
    expect((out.fields[0] as Record<string, unknown>).label).toBe("Frozen");
    expect(missing).toEqual(["gone"]);
  });

  it("freezes and reports a type-mismatched preset (never applies a wrong patch)", () => {
    const input = form([
      { type: "number", name: "qty", label: "Qty", presetId: "p", overrides: {} },
    ]);
    const { form: out, mismatched } = resolveLinkedFields(
      input,
      resolverFrom({ p: { fieldType: "text", patch: { label: "Search", allowClear: true } } }),
    );
    const f = out.fields[0] as Record<string, unknown>;
    expect(f.label).toBe("Qty"); // unchanged
    expect(f.allowClear).toBeUndefined(); // text patch not applied to a number
    expect(mismatched).toEqual(["p"]);
  });

  it("resolves a linked field nested inside container children and array itemFields", () => {
    const input = form([
      {
        type: "card",
        children: [{ type: "text", name: "a", label: "x", presetId: "p", overrides: {} }],
      },
      {
        type: "array",
        name: "rows",
        label: "Rows",
        itemFields: [{ type: "text", name: "b", label: "y", presetId: "p", overrides: {} }],
      },
    ]);
    const { form: out } = resolveLinkedFields(
      input,
      resolverFrom({ p: { fieldType: "text", patch: { label: "From preset" } } }),
    );
    const child = (out.fields[0] as any).children[0];
    const item = (out.fields[1] as any).itemFields[0];
    expect(child.label).toBe("From preset");
    expect(item.label).toBe("From preset");
  });

  it("does not mutate the input form and leaves unlinked fields untouched", () => {
    const plain = { type: "text", name: "plain", label: "Plain" };
    const input = form([plain]);
    const { form: out } = resolveLinkedFields(input, resolverFrom({}));
    expect(out).not.toBe(input);
    expect(out.fields[0]).toBe(plain); // unchanged subtree shared by reference
  });
});
