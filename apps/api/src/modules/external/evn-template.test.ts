import type { FieldNode, FormSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import {
  type EvnExportResult,
  type EvnFormItem,
  FORBIDDEN_OUTPUT_KEYS,
  toEvnTemplate,
} from "./evn-template.js";
import { EVN_ROOT_RENDERABLE_CODES } from "./evn-vocabulary.js";

/** The binding states the type name, so the "no display name" warning stays out of the way of
 *  tests that are about something else. `top level` covers the omitted case on purpose. */
const META = { formTypeCode: "PCT", formCode: "CPCT", formTypeName: "Công Tác" };

function formOf(fields: unknown[], extra: Record<string, unknown> = {}): FormSchema {
  return { formVersion: 1, id: "f1", title: "Tạo phiếu công tác", fields, ...extra } as FormSchema;
}

function exportOf(fields: unknown[], meta = META): EvnExportResult {
  return toEvnTemplate(formOf(fields), meta);
}

/** Unwrap the success case; failing here beats a cascade of `undefined` property errors. */
function ok(result: EvnExportResult): { items: EvnFormItem[]; warnings: string[] } {
  if (!result.ok) throw new Error(`expected success, got errors: ${JSON.stringify(result.errors)}`);
  return { items: result.template.formItems, warnings: result.warnings };
}

function errorsOf(result: EvnExportResult): { field: string; reason: string }[] {
  if (result.ok) throw new Error("expected failure, got a template");
  return result.errors;
}

const text = (name: string, label = name): FieldNode =>
  ({ type: "text", name, label }) as unknown as FieldNode;

describe("top level", () => {
  it("emits the six-key document EVN's CreateFormDto parses", () => {
    const result = toEvnTemplate(formOf([text("a")]), { ...META, formTypeName: "Công Tác" });
    if (!result.ok) throw new Error("expected success");
    expect(Object.keys(result.template).sort()).toEqual([
      "formCode",
      "formItems",
      "formName",
      "formTypeCode",
      "formTypeName",
      "layout",
    ]);
    expect(result.template.formTypeCode).toBe("PCT");
    expect(result.template.formCode).toBe("CPCT");
    expect(result.template.formName).toBe("Tạo phiếu công tác");
  });

  it("defaults layout to horizontal, matching 8/8 shipped create templates", () => {
    const plain = toEvnTemplate(formOf([text("a")]), META);
    const vertical = toEvnTemplate(
      formOf([text("a")], { layoutProps: { layout: "vertical" } }),
      META,
    );
    if (!plain.ok || !vertical.ok) throw new Error("expected success");
    expect(plain.template.layout).toBe("horizontal");
    expect(vertical.template.layout).toBe("vertical");
  });

  it("omits formTypeName rather than inventing one, and says so", () => {
    // Their `FormType.name` is NOT NULL and `saveFormType` upserts by code: a guessed name would
    // overwrite the display name of a ticket type they already have.
    const result = toEvnTemplate(formOf([text("a")]), {
      formTypeCode: "PCT",
      formCode: "CPCT",
    });
    if (!result.ok) throw new Error("expected success");
    expect(result.template).not.toHaveProperty("formTypeName");
    expect(result.warnings.some((w) => w.includes("tên hiển thị"))).toBe(true);
  });
});

describe("item shape", () => {
  it("emits code/typeCode/priority always, and optional keys only when filled", () => {
    const { items } = ok(
      exportOf([
        { type: "text", name: "full", label: "Họ tên", placeholder: "Nhập", required: true },
        { type: "text", name: "bare", label: "" },
      ]),
    );
    const inner = items[0].children ?? [];
    expect(inner[0]).toEqual({
      code: "full",
      typeCode: "TEXT_INPUT",
      priority: 1,
      label: "Họ tên",
      placeholder: "Nhập",
      required: true,
    });
    // No `label: ""`, no `required: false`, no `placeholder: undefined`, no `children: []`.
    expect(inner[1]).toEqual({ code: "bare", typeCode: "TEXT_INPUT", priority: 2 });
  });

  it("never emits itemCode — that key exists only on the renderer's side of their backend", () => {
    const serialized = JSON.stringify(ok(exportOf([text("a")])).items);
    expect(serialized).not.toContain("itemCode");
  });

  it("never emits an empty description — P2c fills it, and {} has no precedent in 522 nodes", () => {
    expect(JSON.stringify(ok(exportOf([text("a")])).items)).not.toContain("description");
  });

  it("routes display-text prose into label, and never marks it required", () => {
    // Their `TYPOGRAPHY` renders `label` and ignores any content field, and appends a red asterisk
    // when `required` is set — on a paragraph of prose that would be a validation marker for a
    // field that has no value.
    const { items } = ok(
      exportOf([{ type: "display-text", content: "Đọc kỹ trước khi ký", required: true }]),
    );
    const note = (items[0].children ?? [])[0];
    expect(note.typeCode).toBe("TYPOGRAPHY");
    expect(note.label).toBe("Đọc kỹ trước khi ký");
    expect(note).not.toHaveProperty("required");
  });
});

describe("priority", () => {
  it("numbers each sibling group 1..n, contiguous and unique", () => {
    // Their own templates do not: the ordering query has no tie-break and 64 of 135 sibling groups
    // carry duplicate or gapped priorities, so those forms are ordered by whatever Postgres yields.
    const { items } = ok(
      exportOf([
        {
          type: "group",
          name: "G",
          children: [text("a"), text("b"), text("c")],
        },
        { type: "group", name: "H", children: [text("d"), text("e")] },
      ]),
    );
    expect(items.map((i) => i.priority)).toEqual([1, 2]);
    expect((items[0].children ?? []).map((i) => i.priority)).toEqual([1, 2, 3]);
    expect((items[1].children ?? []).map((i) => i.priority)).toEqual([1, 2]);
  });

  it("numbers after unwrapping, not before", () => {
    const { items } = ok(
      exportOf([
        {
          type: "group",
          name: "G",
          children: [text("a"), { type: "grid", children: [text("b"), text("c")] }, text("d")],
        },
      ]),
    );
    const inner = items[0].children ?? [];
    expect(inner.map((i) => i.code)).toEqual(["a", "b", "c", "d"]);
    expect(inner.map((i) => i.priority)).toEqual([1, 2, 3, 4]);
  });
});

describe("the four mapping outcomes", () => {
  it("maps a leaf and attributes its warning to that field", () => {
    // Named honestly: `radio` is not warning-free — its options are not exported yet. What this
    // pins is that the warning is ATTRIBUTED, since an unattributed list of caveats is unactionable
    // on a form with fifty fields. (An earlier draft of this test asserted `every(w => w.length >
    // 0)`, which is true of any array of non-empty strings and measured nothing.)
    const { items, warnings } = ok(exportOf([{ type: "radio", name: "r", label: "R" }]));
    expect((items[0].children ?? [])[0].typeCode).toBe("RADIO");
    const mine = warnings.filter((w) => w.startsWith("r: "));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toContain("lựa chọn");
  });

  it("maps a lossy control AND warns, naming the field", () => {
    const { items, warnings } = ok(exportOf([{ type: "slider", name: "muc_do", label: "Mức độ" }]));
    expect((items[0].children ?? [])[0].typeCode).toBe("NUMBER_INPUT");
    expect(warnings.some((w) => w.startsWith("muc_do: ") && w.includes("Thanh trượt"))).toBe(true);
  });

  it("unwraps a collapse so its panels become the sections", () => {
    const { items } = ok(
      exportOf([
        {
          type: "collapse",
          children: [
            { type: "collapse-panel", label: "Mục 1", children: [text("a")] },
            { type: "collapse-panel", label: "Mục 2", children: [text("b")] },
          ],
        },
      ]),
    );
    expect(items.map((i) => i.typeCode)).toEqual(["COLLAPSE", "COLLAPSE"]);
    expect(items.map((i) => i.label)).toEqual(["Mục 1", "Mục 2"]);
  });

  it("rejects a type with no target, 422-ing with our field name and our words", () => {
    const errors = errorsOf(
      exportOf([
        { type: "password", name: "pin", label: "PIN" },
        { type: "time", name: "gio", label: "Giờ" },
      ]),
    );
    expect(errors.map((e) => e.field)).toEqual(["pin", "gio"]);
    expect(errors[0].reason).toContain("che ký tự");
  });

  it("blames the source position when a rejected node has no name", () => {
    // `tabs`/`steps` are both nameless and unmappable, so there is no code to blame — §2.3 only
    // generates codes for nodes that get emitted.
    const errors = errorsOf(
      exportOf([{ type: "group", name: "G", children: [{ type: "tabs", children: [] }] }]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("fields[0].children[0]");
  });

  it("collects every problem in one answer instead of stopping at the first", () => {
    const errors = errorsOf(
      exportOf([
        { type: "password", name: "p1", label: "A" },
        { type: "switch", name: "s1", label: "B" },
        { type: "checkbox", name: "c1", label: "C" },
      ]),
    );
    expect(errors.map((e) => e.field)).toEqual(["p1", "s1", "c1"]);
  });

  it("does not descend into a rejected container", () => {
    // The subtree's fate depends on how the author restructures the container, so listing its
    // children now would be advice about a tree that is about to change.
    const errors = errorsOf(
      exportOf([
        {
          type: "tabs",
          children: [
            { type: "tab-pane", label: "T", children: [{ type: "time", name: "t", label: "T" }] },
          ],
        },
      ]),
    );
    expect(errors).toHaveLength(1);
  });
});

describe("generated codes", () => {
  it("gives the same nameless container the same code on every export", () => {
    const fields = [{ type: "card", title: "Thẻ", children: [text("a")] }];
    const first = ok(exportOf(fields)).items[0].code;
    const second = ok(exportOf(fields)).items[0].code;
    expect(first).toBe(second);
    expect(first).toBe("GEN_CARD_0");
  });

  it("derives the code from the source path, so unwrapping does not renumber it", () => {
    const { items } = ok(
      exportOf([
        { type: "grid", children: [text("a")] },
        { type: "card", children: [text("b")] },
      ]),
    );
    // The `grid` dissolved, so the card is output index 1 — but its code follows source index 1.
    expect(items.map((i) => i.code)).toEqual(["GEN_ROOT_CARD_0", "GEN_CARD_1"]);
  });

  it("uses an authored name verbatim rather than folding it into UPPER_SNAKE", () => {
    // Normalising would collapse `ho.ten` and `ho_ten` into one code and then reject the form for a
    // collision the author never wrote. Their column is a plain varchar with no format constraint.
    const { items } = ok(exportOf([text("ho.ten"), text("ho_ten")]));
    expect((items[0].children ?? []).map((i) => i.code)).toEqual(["ho.ten", "ho_ten"]);
  });
});

describe("root placement", () => {
  it("wraps a bare leaf at the root, because the root renderer would drop it silently", () => {
    const { items, warnings } = ok(exportOf([text("a"), text("b")]));
    expect(items).toHaveLength(1);
    expect(items[0].typeCode).toBe("CARD");
    expect((items[0].children ?? []).map((i) => i.code)).toEqual(["a", "b"]);
    expect(warnings.some((w) => w.includes("gói vào một thẻ"))).toBe(true);
  });

  it("leaves a root of containers alone", () => {
    const { items, warnings } = ok(
      exportOf([
        { type: "group", name: "G", children: [text("a")] },
        { type: "card", children: [text("b")] },
      ]),
    );
    expect(items.map((i) => i.code)).toEqual(["G", "GEN_CARD_1"]);
    expect(warnings.some((w) => w.includes("gói vào một thẻ"))).toBe(false);
  });

  it("wraps per run — order survives and the two wrappers get different codes", () => {
    // One shared wrapper would move the trailing leaf across the author's own card, and two
    // wrappers sharing a code would trip the duplicate check and reject the very form the wrapping
    // exists to rescue.
    const { items } = ok(
      exportOf([text("a"), { type: "group", name: "G", children: [text("b")] }, text("c")]),
    );
    expect(items.map((i) => i.typeCode)).toEqual(["CARD", "CARD", "CARD"]);
    expect(items.map((i) => i.code)).toEqual(["GEN_ROOT_CARD_0", "G", "GEN_ROOT_CARD_2"]);
    expect(new Set(items.map((i) => i.code)).size).toBe(3);
    expect((items[0].children ?? [])[0].code).toBe("a");
    expect((items[2].children ?? [])[0].code).toBe("c");
  });

  it("treats every code the root switch handles as root-safe", () => {
    // An `array` maps to FORM_LIST, which the root switch renders — so it must NOT be wrapped.
    expect(EVN_ROOT_RENDERABLE_CODES).toContain("FORM_LIST");
    const { items, warnings } = ok(
      exportOf([{ type: "array", name: "rows", label: "Dòng", itemFields: [text("a")] }]),
    );
    expect(items.map((i) => i.code)).toEqual(["rows"]);
    expect(warnings.some((w) => w.includes("gói vào một thẻ"))).toBe(false);
  });
});

describe("containers inside an array", () => {
  const inArray = (child: unknown) => [
    { type: "array", name: "rows", label: "Dòng", itemFields: [child] },
  ];

  it("rejects a card — the column renderer has no branch and drops the subtree", () => {
    expect(
      errorsOf(exportOf(inArray({ type: "card", children: [text("a")] })))[0].reason,
    ).toContain("danh sách lặp");
  });

  it("rejects a labelled group — it is hijacked into the row's delete-button column", () => {
    const errors = errorsOf(
      exportOf(inArray({ type: "group", name: "G", label: "Nhóm", children: [text("a")] })),
    );
    expect(errors.map((e) => e.field)).toEqual(["G"]);
  });

  it("rejects a space — same hijack as COLLAPSE", () => {
    expect(errorsOf(exportOf(inArray({ type: "space", children: [text("a")] })))).toHaveLength(1);
  });

  it("allows a nested array — FORM_LIST does have a branch there", () => {
    const { items } = ok(
      exportOf(inArray({ type: "array", name: "sub", label: "Con", itemFields: [text("a")] })),
    );
    expect((items[0].children ?? [])[0].typeCode).toBe("FORM_LIST");
  });

  it("allows a grid, because it dissolves before it can be placed", () => {
    const { items } = ok(exportOf(inArray({ type: "grid", children: [text("a")] })));
    expect((items[0].children ?? []).map((i) => i.code)).toEqual(["a"]);
  });
});

describe("nested containers outside an array", () => {
  it("allows card inside card — the branch recurses through RenderFormItemInForm", () => {
    const result = exportOf([
      { type: "card", children: [{ type: "card", children: [text("a")] }] },
    ]);
    const { items, warnings } = ok(result);
    expect((items[0].children ?? [])[0].typeCode).toBe("CARD");
    // Nesting itself draws no complaint. (The leaf inside still warns about their 10 000-character
    // cap, which is about the leaf, not the placement.)
    expect(warnings.some((w) => w.includes("lồng") || w.includes("gói vào"))).toBe(false);
  });

  it("allows a container inside a horizontal space, and says nothing about it", () => {
    // The measurement that REV-1 of the plan got wrong: `COMPONENT_HORIZONAL` renders its children
    // via `RenderFormItemInForm`, which routes container codes straight back to the renderer that
    // draws them. It only breaks inside a FORM_LIST.
    //
    // The warning assertion is the point, not decoration: `space` used to carry a flat "a horizontal
    // row cannot hold a nested group" line, which is this same wrong measurement stated to the
    // tenant. It fired on EVERY space, pushing them to restructure a form around a limit that does
    // not exist — and contradicted the handover doc we sent EVN.
    const { items, warnings } = ok(
      exportOf([
        {
          type: "space",
          children: [{ type: "card", children: [text("a")] }],
        },
      ]),
    );
    expect(items[0].typeCode).toBe("COMPONENT_HORIZONAL");
    expect((items[0].children ?? [])[0].typeCode).toBe("CARD");
    expect(warnings.some((w) => w.includes("chỉ chứa được trường đơn"))).toBe(false);
  });

  it("still warns that a vertical space comes out laid on its side", () => {
    // Removing the false nesting warning must not take the true one with it: their horizontal row is
    // the only arrangement container the create renderer has, so `direction: "vertical"` really is
    // silently flipped.
    const { warnings } = ok(
      exportOf([{ type: "space", direction: "vertical", children: [text("a")] }]),
    );
    expect(warnings.some((w) => w.includes("hàng NGANG"))).toBe(true);
  });
});

describe("duplicate codes", () => {
  it("rejects two fields sharing a name", () => {
    const errors = errorsOf(exportOf([text("qty"), text("qty")]));
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("qty");
    expect(errors[0].reason).toContain("ghi đè");
  });

  it("rejects a name reused inside an array — a legal form here, a collision there", () => {
    // Our `array` scopes its item field names, so this is ordinary authoring. EVN keys `form_items`
    // on `(code, form_id)`, so the second row would UPDATE the first and the field would vanish.
    const errors = errorsOf(
      exportOf([
        text("qty"),
        { type: "array", name: "rows", label: "Dòng", itemFields: [text("qty")] },
      ]),
    );
    expect(errors.map((e) => e.field)).toEqual(["qty"]);
  });

  it("rejects an authored name that collides with a generated one", () => {
    const errors = errorsOf(
      exportOf([{ type: "card", children: [text("a")] }, text("GEN_CARD_0")]),
    );
    expect(errors.map((e) => e.field)).toEqual(["GEN_CARD_0"]);
  });

  it("reports a repeated code once, not once per repeat", () => {
    expect(errorsOf(exportOf([text("q"), text("q"), text("q")]))).toHaveLength(1);
  });
});

describe("what is dropped is named", () => {
  const cases: [string, unknown, string][] = [
    ["permissions", { permissions: { viewRoles: ["hr"] } }, "MỌI vai"],
    ["visibleWhen", { visibleWhen: { "==": [1, 1] } }, "ẩn/hiện"],
    ["validations", { validations: [{ kind: "min", value: 1 }] }, "kiểm tra dữ liệu"],
    ["readOnly", { readOnly: true }, "khoá/chỉ-đọc"],
    ["asyncValidator", { asyncValidator: { url: "https://x/y" } }, "Kiểm tra từ xa"],
    ["defaultValue", { defaultValue: 0 }, "Giá trị mặc định"],
    ["i18n", { i18n: { label: { en: "Name" } } }, "Bản dịch"],
  ];

  for (const [name, extra, expected] of cases) {
    it(`warns about ${name}`, () => {
      const { warnings } = ok(
        exportOf([{ type: "text", name: "a", label: "A", ...(extra as object) }]),
      );
      expect(warnings.some((w) => w.includes(expected))).toBe(true);
    });
  }

  it("stays quiet about features the form does not use", () => {
    const { warnings } = ok(exportOf([{ type: "card", children: [text("a")] }]));
    // Every message in `cases` above is a dropped-feature warning; none of them may appear for a
    // form that carries none of those features. (The text leaf still warns about their character
    // cap — that is a mapping caveat, not something we dropped.)
    for (const [, , expected] of cases) {
      expect(warnings.some((w) => w.includes(expected))).toBe(false);
    }
  });

  it("treats defaultValue: false as present — it is a real default, not an absence", () => {
    const { warnings } = ok(
      exportOf([{ type: "text", name: "a", label: "A", defaultValue: false }]),
    );
    expect(warnings.some((w) => w.includes("Giá trị mặc định"))).toBe(true);
  });
});

describe("nothing internal escapes", () => {
  it("has no forbidden key at any depth, by construction", () => {
    const result = exportOf([
      {
        type: "group",
        name: "G",
        permissions: { viewRoles: ["hr-admin"], editRoles: ["hr-admin"] },
        children: [
          {
            type: "select",
            name: "dept",
            label: "Phòng",
            dataSource: { url: "https://internal.example/api/departments", labelKey: "n" },
          },
        ],
      },
    ]);
    if (!result.ok) throw new Error("expected success");
    // The WHOLE template, not just `formItems` — `settings.submitUrl` lives at the top level of our
    // schema, so scanning only the items would miss precisely the leak that a review once caught.
    const serialized = JSON.stringify(result.template);
    for (const key of FORBIDDEN_OUTPUT_KEYS) expect(serialized).not.toContain(`"${key}"`);
    expect(serialized).not.toContain("hr-admin");
    expect(serialized).not.toContain("internal.example");
  });

  it("drops settings.submitUrl with the rest of the form's own envelope", () => {
    const result = toEvnTemplate(
      formOf([{ type: "card", children: [text("a")] }], {
        settings: { submitUrl: "https://internal.example/api/forms/f1/submissions" },
      }),
      META,
    );
    if (!result.ok) throw new Error("expected success");
    expect(JSON.stringify(result.template)).not.toContain("internal.example");
  });

  it("answers rather than throwing when a form carries no fields at all", () => {
    // Belt to the service's braces, and NOT the main defence — `external.service.ts` migrates the
    // frozen snapshot (so `formSchema.parse` runs) before this function ever sees it. That is what
    // keeps a stored `Json` blob from reaching the walk as a `TypeError`, which would be the only
    // non-deliberate status on this surface. Kept because a field-less form is legal input here.
    const result = toEvnTemplate({ formVersion: 1, id: "f1", title: "T" } as FormSchema, META);
    if (!result.ok) throw new Error("expected success");
    expect(result.template.formItems).toEqual([]);
  });

  it("does not mutate the form it was given", () => {
    const form = formOf([text("a")]);
    const before = JSON.stringify(form);
    toEvnTemplate(form, META);
    expect(JSON.stringify(form)).toBe(before);
  });
});

/**
 * The acceptance criterion of P2b: author a form here, export it, and diff against a template EVN
 * actually ships.
 *
 * The target is the `PCT_GENERAL` section of `CPCT.json`. Four of its nine children are omitted from
 * the fixture because they are unreachable — `INPUT_TABLE_DKCT`, `INPUT_TABLE_BBKSHT`,
 * `INPUT_TABLE_KHCT` and `TEXTAREA_CONDITION` are EVN-proprietary composites with no counterpart in
 * our contract, so no authored form can produce them.
 *
 * Of the five that remain, the expected value below is the real file byte-for-byte except for three
 * deliberate, explained differences:
 *   1. `description` is absent — that is P2c.
 *   2. `priority` is renumbered 1..5; the shipped values are `1,1,5,6,7` (this group is one of the
 *      64 whose priorities are duplicated or gapped, which their ordering query cannot resolve).
 *   3. `required: false` is omitted rather than emitted; their column is NOT NULL DEFAULT false, so
 *      the two are the same value.
 * Anything else differing fails this test — that is the point of writing it as a whole-object
 * comparison rather than a handful of spot checks.
 */
describe("diff against the real CPCT.json", () => {
  it("reproduces the PCT_GENERAL section", () => {
    const result = toEvnTemplate(
      formOf([
        {
          type: "group",
          name: "PCT_GENERAL",
          children: [
            {
              type: "select",
              name: "ORGANIZATIONCODE",
              label: "Đơn vị tạo phiếu",
              placeholder: "Chọn đơn vị tạo phiếu",
              required: true,
            },
            {
              type: "tree-select",
              name: "DEPARTMENTCODE",
              label: "Phòng/ tổ tạo phiếu",
              placeholder: "Chọn phòng/ tổ tạo phiếu",
              required: true,
            },
            {
              type: "select",
              name: "LEVEL_DANGEROUS",
              label: "Mức độ",
              placeholder: "Chọn Mức độ",
              required: true,
            },
            {
              type: "select",
              name: "TYPE_BUSINESS",
              label: "Loại hình công tác",
              placeholder: "Chọn Loại hình công tác",
              required: true,
            },
            {
              type: "text",
              name: "OUTAGE_SCHEDULE",
              label: "Lịch đăng ký cắt điện",
              required: false,
            },
          ],
        },
      ]),
      { formTypeCode: "PCT", formCode: "CPCT", formTypeName: "Công Tác" },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));

    expect(result.template.formItems).toEqual([
      {
        code: "PCT_GENERAL",
        typeCode: "CARD",
        priority: 1,
        children: [
          {
            code: "ORGANIZATIONCODE",
            label: "Đơn vị tạo phiếu",
            typeCode: "SELECT",
            placeholder: "Chọn đơn vị tạo phiếu",
            priority: 1,
            required: true,
          },
          {
            code: "DEPARTMENTCODE",
            label: "Phòng/ tổ tạo phiếu",
            typeCode: "SELECT_TREE_ONE",
            placeholder: "Chọn phòng/ tổ tạo phiếu",
            priority: 2,
            required: true,
          },
          {
            code: "LEVEL_DANGEROUS",
            label: "Mức độ",
            typeCode: "SELECT",
            placeholder: "Chọn Mức độ",
            priority: 3,
            required: true,
          },
          {
            code: "TYPE_BUSINESS",
            label: "Loại hình công tác",
            typeCode: "SELECT",
            placeholder: "Chọn Loại hình công tác",
            priority: 4,
            required: true,
          },
          {
            code: "OUTAGE_SCHEDULE",
            label: "Lịch đăng ký cắt điện",
            typeCode: "TEXT_INPUT",
            priority: 5,
          },
        ],
      },
    ]);

    // The top level of the real file, minus `formItems`.
    const { formItems: _ignored, ...head } = result.template;
    expect(head).toEqual({
      formTypeName: "Công Tác",
      formTypeCode: "PCT",
      formName: "Tạo phiếu công tác",
      formCode: "CPCT",
      layout: "horizontal",
    });
  });
});
