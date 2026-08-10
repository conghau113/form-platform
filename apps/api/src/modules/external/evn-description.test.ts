import type { FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { defaultValueExported, descriptionOf, lockedStateExported } from "./evn-description.js";
import { EVN_CREATE_RENDERER_CODES, EVN_TEMPLATE_USAGE } from "./evn-vocabulary.js";
import { mapNodeType } from "./type-map.js";

/**
 * Every assertion here is anchored to a line in EVN's create renderer, because the whole point of
 * `description` is that its keys are only worth emitting if something over there reads them. The
 * measurements are recorded in `~/.claude/plans/evn-p2c-description.md` §1.
 */

/** Route a node through the real type map, so a test never invents a `typeCode` by hand. */
function describeNode(node: FieldNode): ReturnType<typeof descriptionOf> {
  const mapping = mapNodeType(node);
  if (mapping.kind !== "map") throw new Error(`expected a mappable node, got ${mapping.kind}`);
  return descriptionOf(node, mapping.typeCode);
}

describe("descriptionOf — options", () => {
  it("nests the static list, because a bare array leaves a radio empty and silent", () => {
    // `RadioItemHandle.tsx:82` reads `handleCheckDataInDescription(description)?.data?.data`, and
    // that helper (`:32-42`) hands back `{...description, data}`. With `data` a bare array,
    // `array.data` is `undefined` and the radio renders zero options with no error anywhere.
    // The select family (`SelectItemHandle.tsx:467`) reads `data?.data ?? data` and takes either,
    // so the nested shape is the only one that works for all four consumers.
    const result = describeNode({
      type: "radio",
      name: "gioiTinh",
      label: "gioiTinh",
      options: [
        { label: "Nam", value: "M" },
        { label: "Nữ", value: "F" },
      ],
    });

    expect(result.description).toEqual({
      isApi: false,
      data: {
        data: [
          { label: "Nam", value: "M" },
          { label: "Nữ", value: "F" },
        ],
      },
    });
    expect(Array.isArray(result.description?.data)).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("uses the same nested shape for every select variant", () => {
    const options = [{ label: "A", value: "a" }];
    for (const node of [
      { type: "select", name: "f", label: "f", options },
      { type: "select", name: "f", label: "f", multiple: true, options },
      { type: "select", name: "f", label: "f", tags: true, options },
      { type: "tree-select", name: "f", label: "f", options },
      { type: "tree-select", name: "f", label: "f", multiple: true, options },
    ] as FieldNode[]) {
      expect(describeNode(node).description).toMatchObject({
        isApi: false,
        data: { data: options },
      });
    }
  });

  it("keeps a tree's nesting and drops per-option translations", () => {
    const result = describeNode({
      type: "tree-select",
      name: "khuVuc",
      label: "khuVuc",
      options: [
        {
          label: "Miền Bắc",
          value: "MB",
          i18n: { en: "North" },
          children: [{ label: "Hà Nội", value: "HN" }],
        },
      ],
    });

    expect(result.description?.data).toEqual({
      data: [{ label: "Miền Bắc", value: "MB", children: [{ label: "Hà Nội", value: "HN" }] }],
    });
  });

  it("warns per field when a choice control has nothing to send", () => {
    const result = describeNode({ type: "select", name: "f", label: "f" });
    expect(result.description).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("rỗng");
  });

  it("says a remote option source cannot travel, without naming the URL", () => {
    // `description.data.path` is fetched by THEIR backend against THEIR base URL, so our endpoint
    // is meaningless there. The warning reaches an external caller, so it must not carry the URL.
    const result = describeNode({
      type: "select",
      name: "f",
      label: "f",
      dataSource: { url: "https://internal.example/api/depts", labelKey: "name", valueKey: "id" },
    });

    expect(result.description).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).not.toContain("internal.example");
    expect(result.warnings[0]).toContain("từ xa");
  });

  it("prefers the static list when a field has both", () => {
    const result = describeNode({
      type: "select",
      name: "f",
      label: "f",
      options: [{ label: "A", value: "a" }],
      dataSource: { url: "https://internal.example/x", labelKey: "n", valueKey: "i" },
    });
    expect(result.description?.data).toEqual({ data: [{ label: "A", value: "a" }] });
    expect(result.warnings).toEqual([]);
  });
});

describe("descriptionOf — disable", () => {
  it("carries the locked state for every code whose renderer reads it", () => {
    // Measured branch by branch. An earlier draft assumed the choice controls ignored `disable`
    // and would have dropped it for every select, tree-select and upload — while `disable` is the
    // second most used description key in EVN's own create templates.
    const nodes: FieldNode[] = [
      { type: "text", name: "f", label: "f", disabled: true },
      { type: "textarea", name: "f", label: "f", disabled: true },
      { type: "number", name: "f", label: "f", disabled: true },
      {
        type: "select",
        name: "f",
        label: "f",
        options: [{ label: "A", value: "a" }],
        disabled: true,
      },
      {
        type: "select",
        name: "f",
        label: "f",
        tags: true,
        options: [{ label: "A", value: "a" }],
        disabled: true,
      },
      {
        type: "tree-select",
        name: "f",
        label: "f",
        options: [{ label: "A", value: "a" }],
        disabled: true,
      },
      { type: "upload", name: "f", label: "f", disabled: true },
    ];
    for (const node of nodes) expect(describeNode(node).description?.disable).toBe(true);
  });

  it("treats read-only as disabled — their control has no third state", () => {
    expect(
      describeNode({ type: "text", name: "f", label: "f", readOnly: true }).description?.disable,
    ).toBe(true);
  });

  it("omits it for the codes that ignore it", () => {
    // `RadioItemHandle.tsx` never reads `disable`; the date branches
    // (`CheckTyprCodeRenderItem.tsx:392,436,515`) pass only the form-wide flag.
    const radio = describeNode({
      type: "radio",
      name: "f",
      label: "f",
      options: [{ label: "A", value: "a" }],
      disabled: true,
    });
    expect(radio.description?.disable).toBeUndefined();
    expect(
      describeNode({ type: "date", name: "f", label: "f", disabled: true }).description,
    ).toBeUndefined();
  });

  it("never emits disable: false — an absent key already means editable", () => {
    expect(
      describeNode({ type: "text", name: "f", label: "f", disabled: false }).description,
    ).toBeUndefined();
  });
});

describe("descriptionOf — numbers", () => {
  it("warns about the floor of 1 that appears when no minimum is authored", () => {
    // `CheckTyprCodeRenderItem.tsx:305` destructures `min = 1`, so omitting the key IS a minimum.
    // We cannot express "no minimum" in their vocabulary, so the only honest move is to say so.
    const result = describeNode({ type: "number", name: "f", label: "f" });
    expect(result.description).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("chặn dưới ở 1");
  });

  it("emits authored bounds and warns that out-of-range input resets to 1", () => {
    const result = describeNode({ type: "number", name: "f", label: "f", min: 5, max: 10 });
    expect(result.description).toMatchObject({ min: 5, max: 10 });
    expect(result.warnings.join(" ")).toContain("đặt lại thành 1");
    expect(result.warnings.join(" ")).not.toContain("chặn dưới ở 1");
  });

  it("carries a zero minimum rather than treating it as absent", () => {
    const result = describeNode({ type: "number", name: "f", label: "f", min: 0 });
    expect(result.description?.min).toBe(0);
    expect(result.warnings.join(" ")).not.toContain("chặn dưới ở 1");
  });

  it("follows their truthiness gate for the reset, not the presence of the keys", () => {
    // `CheckTyprCodeRenderItem.tsx:311` is `if (max && min)`, evaluated AFTER `min` has defaulted
    // to 1. Warning on "both keys present" gets both edges backwards.
    const zeroMin = describeNode({ type: "number", name: "f", label: "f", min: 0, max: 10 });
    expect(zeroMin.warnings.join(" ")).not.toContain("đặt lại thành 1");

    const maxOnly = describeNode({ type: "number", name: "f", label: "f", max: 10 });
    expect(maxOnly.warnings.join(" ")).toContain("đặt lại thành 1");
    expect(maxOnly.warnings.join(" ")).toContain("chặn dưới ở 1");

    // `max: 0` is falsy on their side too, so nothing resets. Pinned so a later "simplification"
    // to `max !== undefined` cannot regress it silently.
    const zeroMax = describeNode({ type: "number", name: "f", label: "f", min: 1, max: 0 });
    expect(zeroMax.warnings.join(" ")).not.toContain("đặt lại thành 1");

    // Negative bounds are truthy over there and non-zero here — the reset does happen.
    const negative = describeNode({ type: "number", name: "f", label: "f", min: -10, max: -1 });
    expect(negative.warnings.join(" ")).toContain("đặt lại thành 1");
  });

  it("passes the stepper toggle through only when it is switched off", () => {
    expect(
      describeNode({ type: "number", name: "f", label: "f", min: 1, controls: false }).description,
    ).toMatchObject({
      controls: false,
    });
    expect(
      describeNode({ type: "number", name: "f", label: "f", min: 1, controls: true }).description
        ?.controls,
    ).toBeUndefined();
  });

  it("reads a rate's upper bound from its star count", () => {
    // `rateFieldSchema` has no min/max; `count` is the only honest source for `max`.
    expect(
      describeNode({ type: "rate", name: "f", label: "f", count: 10 }).description,
    ).toMatchObject({
      max: 10,
    });
  });
});

describe("descriptionOf — uploads", () => {
  it("always emits a non-empty description, or their create screen throws", () => {
    // `CheckTyprCodeRenderItem.tsx:557` destructures `handleCheckDataInDescription(description)`
    // with NO `?? {}` guard, and that helper returns `undefined` whenever `_.size(description)` is
    // 0 — absent and `{}` alike. Without this, every exported upload field is a TypeError on their
    // side. An empty `acceptFile` reaches `accept` (`SharedUploadFile.tsx:225`) meaning "any file".
    const result = describeNode({ type: "upload", name: "f", label: "f" });
    expect(result.description).toEqual({ acceptFile: "" });
  });

  it("carries the authored file constraints", () => {
    const result = describeNode({
      type: "upload",
      name: "f",
      label: "f",
      accept: ".pdf,.docx",
      maxCount: 3,
    });
    expect(result.description).toMatchObject({ acceptFile: ".pdf,.docx", max: 3 });
    expect(result.warnings).toEqual([]);
  });

  it("rewrites accept into the extension list their matcher can match", () => {
    // `SharedUploadFile.tsx:73-79` does `ext.replace('.','')` — first dot only, no trim — then an
    // exact match against the lowercased extension (`fileUtil.ts:6-9,30-34`). So `image/*` matches
    // nothing, `.PDF` fails against `pdf`, and `" .docx"` keeps its leading space. Passing our HTML
    // `accept` through verbatim yields an upload field that accepts NO file at all.
    const result = describeNode({
      type: "upload",
      name: "f",
      label: "f",
      accept: "image/*, .PDF ,.docx",
    });
    expect(result.description?.acceptFile).toBe(".pdf,.docx");
    expect(result.warnings.join(" ")).toContain("image/*");
    expect(result.warnings.join(" ")).toContain("phần mở rộng");
  });

  it("requires the leading dot — a bare extension is not the shape their split produces", () => {
    // Pins the escape in the segment pattern. An unescaped `.` in that regex still rejects
    // `image/*`, so every other case here would keep passing while `pdf` silently became a kept
    // segment — a difference no other assertion in this file can see.
    const result = describeNode({ type: "upload", name: "f", label: "f", accept: "pdf,.docx" });
    expect(result.description?.acceptFile).toBe(".docx");
    expect(result.warnings.join(" ")).toContain("pdf");
  });

  it("falls back to accepting anything, and says THAT rather than the opposite", () => {
    // Every segment is a MIME type: a filter of `""` (any file) is strictly better for the user
    // than one that rejects everything. But `""` is falsy on their side, so the field ends up
    // UNRESTRICTED — the warning must not be the narrowing one, which would tell the author their
    // users can no longer pick images when in fact they can now pick anything at all.
    const result = describeNode({
      type: "upload",
      name: "f",
      label: "f",
      accept: "image/*,application/pdf",
    });
    expect(result.description?.acceptFile).toBe("");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("MỌI định dạng");
    expect(result.warnings[0]).not.toContain("không chọn được");
  });

  it("collapses duplicate extensions", () => {
    const result = describeNode({ type: "upload", name: "f", label: "f", accept: ".pdf,.PDF" });
    expect(result.description?.acceptFile).toBe(".pdf");
    expect(result.warnings).toEqual([]);
  });

  it("keeps the narrowing wording when some extensions do survive", () => {
    const result = describeNode({ type: "upload", name: "f", label: "f", accept: "image/*,.pdf" });
    expect(result.description?.acceptFile).toBe(".pdf");
    expect(result.warnings[0]).toContain("không chọn được");
    expect(result.warnings[0]).not.toContain("MỌI định dạng");
  });
});

describe("descriptionOf — textarea and defaults", () => {
  it("emits bounded auto-grow but not the unbounded form", () => {
    // Their default is a bounded `{minRows:1,maxRows:5}` (`TextareaHandle.tsx:18`); inventing
    // bounds for `autoSize: true` would cap a field the author deliberately left unbounded.
    expect(
      describeNode({
        type: "textarea",
        name: "f",
        label: "f",
        autoSize: { minRows: 2, maxRows: 6 },
      }).description,
    ).toEqual({ autoSize: { minRows: 2, maxRows: 6 } });
    expect(
      describeNode({ type: "textarea", name: "f", label: "f", autoSize: true }).description,
    ).toBeUndefined();
  });

  it("carries a scalar default on a text field", () => {
    // `InputItemhandle.tsx:140` uses `description.value` as `initialValue`.
    expect(
      describeNode({ type: "text", name: "f", label: "f", defaultValue: "Hà Nội" }).description,
    ).toEqual({
      value: "Hà Nội",
    });
    expect(
      defaultValueExported(
        { type: "text", name: "f", label: "f", defaultValue: "x" },
        "TEXT_INPUT",
      ),
    ).toBe(true);
  });

  it("refuses a default that collides with their reserved prefix", () => {
    const result = describeNode({
      type: "text",
      name: "f",
      label: "f",
      defaultValue: "KEY_ORGANIZATIONCODE",
    });
    expect(result.description).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("KEY_");
    expect(
      defaultValueExported(
        { type: "text", name: "f", label: "f", defaultValue: "KEY_X" },
        "TEXT_INPUT",
      ),
    ).toBe(false);
  });

  it("does not put a default on a select, where the key means a field reference", () => {
    // `SelectItemHandle.tsx:68` reads `description.value` as `KEY_`-stripped pointer at another
    // field, so a literal default there is read as a name, not a value.
    const result = describeNode({
      type: "select",
      name: "f",
      label: "f",
      options: [{ label: "A", value: "a" }],
      defaultValue: "a",
    });
    expect(result.description?.value).toBeUndefined();
    expect(
      defaultValueExported({ type: "select", name: "f", label: "f", defaultValue: "a" }, "SELECT"),
    ).toBe(false);
  });

  it("does not export a non-scalar default", () => {
    expect(
      defaultValueExported(
        { type: "text", name: "f", label: "f", defaultValue: ["a"] } as unknown as FieldNode,
        "TEXT_INPUT",
      ),
    ).toBe(false);
  });
});

describe("descriptionOf — invariants", () => {
  it("never returns an empty object", () => {
    const result = describeNode({ type: "date", name: "f", label: "f" });
    expect(result.description).toBeUndefined();
  });

  it("keeps EVN's vocabulary out of every warning", () => {
    // Warnings reach the external caller through `external.service.ts`, so they may name our own
    // fields and nothing of the recipient's internals.
    const foreign = Object.keys(EVN_TEMPLATE_USAGE).concat([...EVN_CREATE_RENDERER_CODES]);
    const nodes: FieldNode[] = [
      { type: "select", name: "f", label: "f" },
      {
        type: "select",
        name: "f",
        label: "f",
        dataSource: { url: "https://x/y", labelKey: "n", valueKey: "i" },
      },
      { type: "number", name: "f", label: "f" },
      { type: "number", name: "f", label: "f", min: 1, max: 2 },
      { type: "text", name: "f", label: "f", defaultValue: "KEY_X" },
      { type: "radio", name: "f", label: "f" },
      { type: "tree-select", name: "f", label: "f" },
      { type: "cascader", name: "f", label: "f" },
      { type: "checkbox-group", name: "f", label: "f" },
      { type: "upload", name: "f", label: "f" },
    ];
    for (const node of nodes) {
      for (const warning of describeNode(node).warnings) {
        for (const code of foreign) expect(warning).not.toContain(code);
      }
    }
  });

  it("reports read-pretty as unexported even on a code that takes disable", () => {
    // Their create renderer has no review mode, so `readPretty` has nowhere to land regardless of
    // the target code — the "locked state was dropped" warning must still fire for it.
    expect(
      lockedStateExported({ type: "text", name: "f", label: "f", readPretty: true }, "TEXT_INPUT"),
    ).toBe(false);
    expect(
      lockedStateExported({ type: "text", name: "f", label: "f", disabled: true }, "TEXT_INPUT"),
    ).toBe(true);
  });
});
