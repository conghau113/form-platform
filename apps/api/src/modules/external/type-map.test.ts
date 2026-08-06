import { FIELD_TYPES, type FieldNode, fieldNodeSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import {
  EVN_CREATE_RENDERER_CODES,
  EVN_ROOT_RENDERABLE_CODES,
  EVN_TEMPLATE_USAGE,
} from "./evn-vocabulary.js";
import { createUsageOf, mapNodeType, TYPES_WITHOUT_NAME, UNEXERCISED_TARGETS } from "./type-map.js";

/**
 * One minimal node per contract type, in the contract's own order.
 *
 * Hand-written on purpose: the point of the coverage test below is that adding a node type to
 * `@org/form-schema` and forgetting to decide its EVN target breaks the build here, and a sample
 * generated from the schema would just add itself silently.
 */
const SAMPLES: Record<FieldNode["type"], FieldNode> = {
  text: { type: "text", name: "f", label: "F" },
  textarea: { type: "textarea", name: "f", label: "F" },
  number: { type: "number", name: "f", label: "F" },
  select: { type: "select", name: "f", label: "F" },
  lookup: { type: "lookup", name: "f", label: "F" },
  "checkbox-group": { type: "checkbox-group", name: "f", label: "F" },
  upload: { type: "upload", name: "f", label: "F" },
  cascader: { type: "cascader", name: "f", label: "F" },
  "tree-select": { type: "tree-select", name: "f", label: "F" },
  date: { type: "date", name: "f", label: "F" },
  time: { type: "time", name: "f", label: "F" },
  "date-range": { type: "date-range", name: "f", label: "F" },
  "time-range": { type: "time-range", name: "f", label: "F" },
  checkbox: { type: "checkbox", name: "f", label: "F" },
  switch: { type: "switch", name: "f", label: "F" },
  radio: { type: "radio", name: "f", label: "F" },
  password: { type: "password", name: "f", label: "F" },
  slider: { type: "slider", name: "f", label: "F" },
  rate: { type: "rate", name: "f", label: "F" },
  color: { type: "color", name: "f", label: "F" },
  "display-text": { type: "display-text", content: "hi" },
  group: { type: "group", name: "g", children: [] },
  array: { type: "array", name: "a", itemFields: [] },
  tabs: { type: "tabs", children: [] },
  "tab-pane": { type: "tab-pane", label: "One", children: [] },
  collapse: { type: "collapse", children: [] },
  "collapse-panel": { type: "collapse-panel", label: "One", children: [] },
  card: { type: "card", children: [] },
  grid: { type: "grid", children: [] },
  space: { type: "space", children: [] },
  steps: { type: "steps", children: [] },
  step: { type: "step", label: "One", children: [] },
  "form-layout": { type: "form-layout", children: [] },
};

/**
 * The variant branches, which `SAMPLES` cannot reach — a bare `select` never yields `SELECT_TAGS`.
 * Several targets are reachable ONLY from here, so the "which codes do we emit" tests would be
 * blind to them without this list.
 */
const VARIANTS: FieldNode[] = [
  { type: "select", name: "f", label: "F", tags: true },
  { type: "select", name: "f", label: "F", multiple: true },
  { type: "tree-select", name: "f", label: "F", multiple: true },
  { type: "date", name: "f", label: "F", showTime: true },
  { type: "group", name: "g", label: "Thông tin", children: [] },
];

/** Every `typeCode` this table can emit, across plain nodes and variant branches alike. */
const mappedCodes = () =>
  [...FIELD_TYPES.map((t) => SAMPLES[t]), ...VARIANTS]
    .map(mapNodeType)
    .flatMap((m) => (m.kind === "map" ? [m.typeCode] : []));

describe("EVN vocabulary (generated data)", () => {
  /**
   * The generator reads two source trees outside this repo, so it cannot run in CI. These anchors
   * are what stands between a mis-parse and a vocabulary that silently permits anything: an
   * over-wide set would let `GROUP` back in, and the "target is in the vocabulary" test below would
   * happily pass.
   */
  it("pins the create-renderer vocabulary to what was measured", () => {
    expect(EVN_CREATE_RENDERER_CODES).toHaveLength(38);
  });

  it.each([
    "GROUP",
    "CHECK_BOX",
    "DATE_TIME_PICKER",
    "TEXT_AREA",
    "FILE_LIST",
    "LABEL",
    "SWITCH_ACTION",
  ])("excludes %s, which only the detail renderer paints", (code) => {
    // Each of these appears in the shipped templates — that is exactly why the parent plan proposed
    // some of them as targets. They belong to the DETAIL renderer; the create renderer has no
    // `case` for them and falls through to a blank field.
    expect(EVN_TEMPLATE_USAGE[code]?.detail ?? 0).toBeGreaterThan(0);
    expect(EVN_TEMPLATE_USAGE[code]?.create ?? 0).toBe(0);
    expect(EVN_CREATE_RENDERER_CODES).not.toContain(code);
  });

  it("pins the root-renderable set, which is narrower than the vocabulary", () => {
    // Measured from the `case` branches of `WorkOrderRenderFormItem.tsx` alone. A code outside this
    // set renders as nothing at all when placed at the root of `formItems[]`, because that switch's
    // `default:` draws a node's children and not the node — which is why the exporter wraps stray
    // root leaves. Widening this by accident would turn that safety net off silently.
    expect(EVN_ROOT_RENDERABLE_CODES).toHaveLength(11);
    expect([...EVN_ROOT_RENDERABLE_CODES].sort()).toEqual([...EVN_ROOT_RENDERABLE_CODES]);
  });

  it("keeps every root-renderable code inside the create vocabulary", () => {
    // They are the same enum read two ways; if one drifts from the other, one of the two parses is
    // wrong rather than the renderer having changed.
    for (const code of EVN_ROOT_RENDERABLE_CODES) {
      expect(EVN_CREATE_RENDERER_CODES).toContain(code);
    }
  });

  it("excludes the plain input codes from the root-renderable set", () => {
    // The point of the distinction: these are perfectly good targets *inside* a container and
    // vanish at the root. If this ever passes trivially, the measurement collapsed.
    for (const code of ["TEXT_INPUT", "SELECT", "NUMBER_INPUT", "TEXTAREA", "RADIO"]) {
      expect(EVN_CREATE_RENDERER_CODES).toContain(code);
      expect(EVN_ROOT_RENDERABLE_CODES).not.toContain(code);
    }
  });
});

describe("mapNodeType", () => {
  it("decides an outcome for every type in the contract", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...FIELD_TYPES].sort());
    for (const type of FIELD_TYPES) {
      const mapping = mapNodeType(SAMPLES[type]);
      expect(["map", "unwrap", "reject"]).toContain(mapping.kind);
    }
  });

  it("only ever targets codes the create renderer can paint", () => {
    // Cardinality first: without it an empty result would satisfy the loop and this test would
    // report success while measuring nothing.
    expect(mappedCodes().length).toBe(25);
    for (const code of mappedCodes()) {
      expect(EVN_CREATE_RENDERER_CODES).toContain(code);
    }
  });

  it("targets unproven codes only from the reviewed allowlist", () => {
    // "Supported by the renderer" and "proven in production" are different claims. Everything we
    // emit must satisfy the first; whatever fails the second has to be listed deliberately.
    const unproven = [...new Set(mappedCodes().filter((c) => createUsageOf(c) === 0))].sort();
    expect(unproven).toEqual([...UNEXERCISED_TARGETS].sort());
  });

  it("keeps EVN's vocabulary out of every string we hand back", () => {
    // Rejection reasons become the 422 body at P2h and warnings surface to the same caller at P2f,
    // so both may name our own field types and nothing of the recipient's internals.
    const foreignCodes = Object.keys(EVN_TEMPLATE_USAGE).concat([...EVN_CREATE_RENDERER_CODES]);
    let rejections = 0;
    for (const node of [...FIELD_TYPES.map((t) => SAMPLES[t]), ...VARIANTS]) {
      const mapping = mapNodeType(node);
      const strings = mapping.kind === "reject" ? [mapping.reason] : [...mapping.warnings];
      if (mapping.kind === "reject") {
        rejections += 1;
        expect(mapping.reason.length).toBeGreaterThan(10);
      }
      for (const text of strings) {
        for (const code of foreignCodes) expect(text).not.toContain(code);
      }
    }
    expect(rejections).toBe(10);
  });

  it("flags exactly the node types that carry no name of their own", () => {
    // Derived from the contract rather than declared twice: a type is nameless if its own schema
    // still accepts the node once `name` is removed. P2e needs this list to know which nodes must
    // be given a generated `code`, and `display-text` is the one that hides — a leaf among
    // containers.
    const nameless = FIELD_TYPES.filter((type) => {
      const { name: _dropped, ...withoutName } = SAMPLES[type] as Record<string, unknown>;
      return fieldNodeSchema.safeParse(withoutName).success;
    });
    expect([...nameless].sort()).toEqual([...TYPES_WITHOUT_NAME].sort());
  });

  it("builds its samples from nodes the contract actually accepts", () => {
    // Guards the test above: if a sample were invalid for some unrelated reason, the "nameless"
    // derivation would silently classify it as named.
    for (const type of FIELD_TYPES) {
      expect(fieldNodeSchema.safeParse(SAMPLES[type]).success).toBe(true);
    }
  });
});

describe("mapNodeType — variants", () => {
  it("lets free-tagging win over multiple, matching our own renderer", () => {
    expect(
      mapNodeType({ type: "select", name: "f", label: "F", tags: true, multiple: true }),
    ).toMatchObject({
      typeCode: "SELECT_TAGS",
    });
    expect(mapNodeType({ type: "select", name: "f", label: "F", multiple: true })).toMatchObject({
      typeCode: "SELECT_MULTIPLE",
    });
    expect(mapNodeType({ type: "select", name: "f", label: "F" })).toMatchObject({
      typeCode: "SELECT",
    });
  });

  it("sends a date with a time-of-day to the date+time control", () => {
    expect(mapNodeType({ type: "date", name: "f", label: "F", showTime: true })).toMatchObject({
      typeCode: "DATETIME_PICKER",
    });
    expect(mapNodeType({ type: "date", name: "f", label: "F" })).toMatchObject({
      typeCode: "DATE_PICKER",
    });
  });

  it("keeps a month picker mapped, but says the granularity is gone", () => {
    const mapping = mapNodeType({ type: "date", name: "f", label: "F", picker: "month" });
    expect(mapping).toMatchObject({ kind: "map", typeCode: "DATE_PICKER" });
    expect(mapping.kind === "map" && mapping.warnings.join(" ")).toContain("month");
  });

  it.each(["date", "date-range"] as const)("warns that %s cannot select the past", (type) => {
    const mapping = mapNodeType(SAMPLES[type]);
    expect(mapping.kind === "map" && mapping.warnings.join(" ")).toContain("quá khứ");
  });

  it.each(["number", "slider", "rate"] as const)("warns that %s cannot submit zero", (type) => {
    // Their validator rejects `0` in both paths, required or not — so a rate of no stars, or any
    // number whose floor is zero, is authored fine here and unsubmittable there.
    const mapping = mapNodeType(SAMPLES[type]);
    expect(mapping.kind === "map" && mapping.warnings.join(" ")).toContain("giá trị 0");
  });

  it.each(["text", "textarea"] as const)("warns that %s is capped at 10k characters", (type) => {
    const mapping = mapNodeType(SAMPLES[type]);
    expect(mapping.kind === "map" && mapping.warnings.join(" ")).toContain("10.000 ký tự");
  });

  it("warns when a vertical stack would be exported lying on its side", () => {
    const vertical = mapNodeType({ type: "space", direction: "vertical", children: [] });
    expect(vertical.kind === "map" && vertical.warnings.join(" ")).toContain("hàng NGANG");
    const horizontal = mapNodeType({ type: "space", direction: "horizontal", children: [] });
    expect(horizontal.kind === "map" && horizontal.warnings.join(" ")).not.toContain("hàng NGANG");
  });

  it("routes a labelled group to the only container that renders a label", () => {
    // `CARD` is passed no title by their renderer, so a labelled group mapped there loses its
    // heading with nothing to show for it.
    expect(
      mapNodeType({ type: "group", name: "g", label: "Thông tin", children: [] }),
    ).toMatchObject({ typeCode: "COLLAPSE" });
    expect(mapNodeType({ type: "group", name: "g", children: [] })).toMatchObject({
      typeCode: "CARD",
    });
  });

  it("says so when a card's title would be dropped", () => {
    const titled = mapNodeType({ type: "card", title: "Phần A", children: [] });
    expect(titled).toMatchObject({ kind: "map", typeCode: "CARD" });
    expect(titled.kind === "map" && titled.warnings).toHaveLength(1);
    const plain = mapNodeType({ type: "card", children: [] });
    expect(plain.kind === "map" && plain.warnings).toHaveLength(0);
  });

  it("warns that every choice control will render empty for now", () => {
    for (const type of ["select", "tree-select", "radio", "checkbox-group", "cascader"] as const) {
      const mapping = mapNodeType(SAMPLES[type]);
      expect(mapping.kind === "map" && mapping.warnings.join(" ")).toContain("lựa chọn");
    }
  });

  it("dissolves the wrappers that have no counterpart", () => {
    for (const type of ["collapse", "form-layout", "grid"] as const) {
      expect(mapNodeType(SAMPLES[type]).kind).toBe("unwrap");
    }
  });
});
