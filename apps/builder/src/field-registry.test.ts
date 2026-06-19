import { fieldNodeSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import {
  canInsert,
  describeNode,
  FIELD_REGISTRY,
  FIELD_TYPES,
  type FieldType,
  metaGuard,
  newField,
  PALETTE_TYPES,
  paletteEntries,
} from "./field-registry";

describe("field registry", () => {
  it("every registered type seeds a node the contract accepts", () => {
    for (const type of FIELD_TYPES) {
      const field = newField(type);
      expect(() => fieldNodeSchema.parse(field), `type ${type}`).not.toThrow();
    }
  });

  it("named types seed unique, non-empty names; nameless containers seed none", () => {
    const taken = new Set<string>();
    for (const meta of FIELD_REGISTRY) {
      const field = newField(meta.type as FieldType, taken) as { name?: string };
      if (meta.named) {
        expect(field.name, `type ${meta.type}`).toBeTruthy();
        expect(taken.has(field.name as string)).toBe(false);
        taken.add(field.name as string);
      } else {
        expect(field.name, `type ${meta.type}`).toBeUndefined();
      }
    }
  });
});

describe("setting descriptors", () => {
  it("choice controls carry choices; sliders carry a valid numeric range", () => {
    const all = [...FIELD_REGISTRY, describeNode("form")];
    for (const meta of all) {
      for (const s of meta.settings) {
        if (s.control === "select" || s.control === "segmented") {
          expect(s.choices?.length, `${meta.type}.${s.key}`).toBeGreaterThan(0);
        }
        if (s.control === "slider") {
          expect(typeof s.min, `${meta.type}.${s.key} min`).toBe("number");
          expect(typeof s.max, `${meta.type}.${s.key} max`).toBe("number");
          expect((s.max as number) > (s.min as number), `${meta.type}.${s.key} range`).toBe(true);
        }
      }
    }
  });
});

describe("palette freeze", () => {
  it("offers exactly today's authorable types, in registry order (R1: layout containers surfaced)", () => {
    expect(PALETTE_TYPES).toEqual([
      "text",
      "textarea",
      "password",
      "number",
      "select",
      "checkbox-group",
      "radio",
      "cascader",
      "tree-select",
      "checkbox",
      "switch",
      "slider",
      "rate",
      "date",
      "date-range",
      "time",
      "time-range",
      "color",
      "upload",
      "array",
      "tabs",
      "collapse",
      "card",
      "grid",
      "space",
      "form-layout",
      "steps",
      "display-text",
    ]);
  });

  it("expands paletteVariants into one chip per variant, seeding the same type + patch", () => {
    const arrays = paletteEntries().find((g) => g.category === "Arrays");
    expect(arrays?.items.map((e) => e.id)).toEqual(["array:list", "array:card", "array:table"]);
    // every array chip seeds the single `array` type with a distinct variant patch
    expect(arrays?.items.every((e) => e.type === "array")).toBe(true);
    expect(arrays?.items.map((e) => e.patch?.variant)).toEqual(["auto", "card", "table"]);

    const inputs = paletteEntries().find((g) => g.category === "Inputs");
    const upload = inputs?.items.filter((e) => e.type === "upload");
    expect(upload?.map((e) => e.id)).toEqual(["upload:button", "upload:dragger"]);
    expect(upload?.map((e) => e.patch?.dragger)).toEqual([undefined, true]);
  });

  it("seeds a node from a palette variant's patch (variant/dragger applied)", () => {
    const cards = newField("array", new Set(), { variant: "card" }) as { variant?: string };
    expect(cards.variant).toBe("card");
    const dragger = newField("upload", new Set(), { dragger: true }) as { dragger?: boolean };
    expect(dragger.dragger).toBe(true);
    // a patch never overrides the generated unique name
    const named = newField("text", new Set(["text1"]), { name: "ignored" }) as { name: string };
    expect(named.name).toBe("text2");
  });

  it("keeps only the nameless sub-containers out of the palette", () => {
    // tab-pane/collapse-panel/step are seeded by their parent and `group` is internal —
    // none are dropped directly, so they stay out of the palette.
    for (const type of ["group", "tab-pane", "collapse-panel", "step"] as const) {
      expect(describeNode(type).showInPalette, type).toBe(false);
      expect(PALETTE_TYPES).not.toContain(type);
    }
  });
});

describe("form meta", () => {
  it("is a droppable, undraggable, undeletable, nameless root never in the palette", () => {
    const form = describeNode("form");
    expect(form.behavior.droppable).toBe(true);
    expect(form.behavior.draggable).toBe(false);
    expect(form.behavior.cloneable).toBe(false);
    expect(form.behavior.deletable).toBe(false);
    expect(form.named).toBe(false);
    expect(form.showInPalette).toBe(false);
    expect(form.settings.length).toBeGreaterThan(0); // layoutProps descriptors for F4
  });
});

describe("canInsert matrix", () => {
  it("enforces pane placement, droppability and the unmovable form root", () => {
    // tabs accept only panes
    expect(canInsert("tabs", "tab-pane")).toBe(true);
    expect(canInsert("tabs", "text")).toBe(false);
    // collapse accept only panels
    expect(canInsert("collapse", "collapse-panel")).toBe(true);
    expect(canInsert("collapse", "text")).toBe(false);
    // a pane only lives under its container
    expect(canInsert("card", "tab-pane")).toBe(false);
    expect(canInsert("form", "tab-pane")).toBe(false);
    // a generic container accepts any non-pane node
    expect(canInsert("tab-pane", "array")).toBe(true);
    expect(canInsert("card", "text")).toBe(true);
    expect(canInsert("form", "text")).toBe(true);
    // leaves are not droppable
    expect(canInsert("text", "text")).toBe(false);
    // the form root can never be inserted anywhere
    expect(canInsert("card", "form")).toBe(false);
  });
});

describe("metaGuard", () => {
  it("lifts canInsert to TreeNodes by reading each node's type", () => {
    const guard = metaGuard();
    const tabs = { uid: "a", node: { type: "tabs" as const }, children: [] };
    const pane = { uid: "b", node: { type: "tab-pane" as const, label: "T" }, children: [] };
    const text = { uid: "c", node: { type: "text" as const, name: "t", label: "T" }, children: [] };
    expect(guard(tabs, pane)).toBe(true);
    expect(guard(tabs, text)).toBe(false);
  });
});
