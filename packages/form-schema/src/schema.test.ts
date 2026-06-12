import { describe, expect, it } from "vitest";
import {
  childrenKeyOf,
  childrenOf,
  type FieldNode,
  formSchema,
  isLayoutContainer,
  LAYOUT_CONTAINER_TYPES,
  migrate,
} from "./index.js";

describe("schema field types", () => {
  it("accepts a textarea field (additive type)", () => {
    const doc = {
      formVersion: 3,
      id: "with-textarea",
      title: "With textarea",
      fields: [
        { type: "textarea", name: "bio", label: "Bio", rows: 5, maxLength: 500 },
        { type: "text", name: "name", label: "Name" },
      ],
    };
    const out = formSchema.parse(doc);
    expect(out.fields[0]).toMatchObject({ type: "textarea", rows: 5 });
  });

  it("accepts the new control field types (additive)", () => {
    const doc = {
      formVersion: 3,
      id: "controls",
      title: "Controls",
      fields: [
        { type: "radio", name: "plan", label: "Plan", options: [{ label: "Pro", value: "pro" }] },
        { type: "switch", name: "active", label: "Active", defaultValue: true },
        { type: "slider", name: "vol", label: "Volume", min: 0, max: 100, step: 5 },
        { type: "rate", name: "stars", label: "Rating", count: 5, allowHalf: true },
        { type: "password", name: "pw", label: "Password", maxLength: 64 },
        { type: "time", name: "at", label: "At" },
        { type: "color", name: "brand", label: "Brand", tooltip: "Hex color", disabled: true },
      ],
    };
    const out = formSchema.parse(doc);
    expect(out.fields.map((f) => f.type)).toEqual([
      "radio",
      "switch",
      "slider",
      "rate",
      "password",
      "time",
      "color",
    ]);
  });

  it("accepts the additive common props on existing types", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "common",
      title: "Common",
      fields: [
        { type: "text", name: "n", label: "N", tooltip: "hi", disabled: true, defaultValue: "x" },
      ],
    });
    expect(out.fields[0]).toMatchObject({ tooltip: "hi", disabled: true, defaultValue: "x" });
  });

  it("accepts an array (Form List) node with recursive itemFields", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "with-array",
      title: "With array",
      fields: [
        {
          type: "array",
          name: "contacts",
          label: "Contacts",
          minItems: 1,
          maxItems: 5,
          itemFields: [
            { type: "text", name: "fullName", label: "Full name", required: true },
            { type: "number", name: "age", label: "Age" },
          ],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "array", minItems: 1, maxItems: 5 });
    expect(out.fields[0]).toHaveProperty("itemFields");
  });

  it("accepts the optional table variant on an array node", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "array-table",
      title: "Array table",
      fields: [
        {
          type: "array",
          name: "rows",
          label: "Rows",
          variant: "table",
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "array", variant: "table" });
  });

  it("rejects an array whose itemFields is not an array", () => {
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad-array",
        title: "Bad array",
        fields: [{ type: "array", name: "rows", label: "Rows", itemFields: "nope" }],
      }),
    ).toThrow();
  });

  it("accepts reactions[] with all four effects (± value)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "with-reactions",
      title: "With reactions",
      fields: [
        {
          type: "select",
          name: "kind",
          label: "Kind",
          options: [{ label: "Company", value: "company" }],
          reactions: [
            {
              when: { rule: { "==": [{ var: "kind" }, "company"] } },
              target: "vat",
              effect: "visible",
            },
            {
              when: { rule: { "==": [{ var: "kind" }, "company"] } },
              target: "note",
              effect: "disabled",
              value: true,
            },
            {
              when: { rule: { "==": [{ var: "kind" }, "company"] } },
              target: "tier",
              effect: "value",
              value: "gold",
            },
            {
              when: { rule: { "==": [{ var: "kind" }, "company"] } },
              target: "city",
              effect: "options",
              value: [{ label: "HN", value: "hn" }],
            },
          ],
        },
      ],
    });
    expect(out.fields[0]).toHaveProperty("reactions");
    const r = (out.fields[0] as { reactions: unknown[] }).reactions;
    expect(r).toHaveLength(4);
  });

  it("rejects a reaction with a bad effect or missing target", () => {
    const base = { when: { rule: { "==": [1, 1] } } };
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad-effect",
        title: "Bad effect",
        fields: [
          {
            type: "text",
            name: "n",
            label: "N",
            reactions: [{ ...base, target: "x", effect: "glow" }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "no-target",
        title: "No target",
        fields: [
          { type: "text", name: "n", label: "N", reactions: [{ ...base, effect: "visible" }] },
        ],
      }),
    ).toThrow();
  });

  it("parses legacy v3 JSON without reactions and migrate keeps reactions intact", () => {
    const legacy = {
      formVersion: 3,
      id: "legacy",
      title: "Legacy",
      fields: [{ type: "text", name: "n", label: "N" }],
    };
    expect(formSchema.parse(legacy).fields[0]).not.toHaveProperty("reactions");

    const withReactions = {
      formVersion: 3,
      id: "keep",
      title: "Keep",
      fields: [
        {
          type: "text",
          name: "n",
          label: "N",
          reactions: [{ when: { rule: { "==": [1, 1] } }, target: "m", effect: "visible" }],
        },
      ],
    };
    const migrated = migrate(withReactions);
    expect((migrated.fields[0] as { reactions: unknown[] }).reactions).toHaveLength(1);
  });

  it("rejects an unknown field type", () => {
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad",
        title: "Bad",
        fields: [{ type: "bogus", name: "q", label: "Q" }],
      }),
    ).toThrow();
  });
});

describe("layout containers (additive)", () => {
  const wrap = (fields: unknown[]) => ({
    formVersion: 3,
    id: "containers",
    title: "Containers",
    fields,
  });

  it("accepts every container type, nested three deep, without names", () => {
    const out = formSchema.parse(
      wrap([
        {
          type: "tabs",
          children: [
            {
              type: "tab-pane",
              label: "Main",
              children: [
                {
                  type: "card",
                  title: "Inner",
                  children: [
                    {
                      type: "grid",
                      cols: 3,
                      children: [{ type: "text", name: "a", label: "A" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "collapse",
          accordion: true,
          children: [
            {
              type: "collapse-panel",
              label: "More",
              children: [
                {
                  type: "space",
                  direction: "vertical",
                  children: [{ type: "switch", name: "b", label: "B" }],
                },
              ],
            },
          ],
        },
      ]),
    );
    expect(out.fields.map((f) => f.type)).toEqual(["tabs", "collapse"]);
  });

  it("accepts visibleWhen/permissions on containers and panes", () => {
    const out = formSchema.parse(
      wrap([
        {
          type: "card",
          visibleWhen: { rule: { "==": [{ var: "x" }, 1] } },
          permissions: { viewRoles: ["admin"] },
          children: [],
        },
        {
          type: "tabs",
          children: [
            {
              type: "tab-pane",
              label: "T",
              visibleWhen: { rule: { "==": [1, 1] } },
              children: [],
            },
          ],
        },
      ]),
    );
    expect(out.fields).toHaveLength(2);
  });

  it("rejects a non-pane child directly inside tabs", () => {
    expect(() =>
      formSchema.parse(
        wrap([{ type: "tabs", children: [{ type: "text", name: "x", label: "X" }] }]),
      ),
    ).toThrow();
  });

  it("rejects a non-panel child directly inside collapse", () => {
    expect(() =>
      formSchema.parse(
        wrap([{ type: "collapse", children: [{ type: "text", name: "x", label: "X" }] }]),
      ),
    ).toThrow();
  });

  it("requires a label on tab-pane", () => {
    expect(() =>
      formSchema.parse(wrap([{ type: "tabs", children: [{ type: "tab-pane", children: [] }] }])),
    ).toThrow();
  });

  it("rejects grid cols outside 1..24", () => {
    expect(() => formSchema.parse(wrap([{ type: "grid", cols: 0, children: [] }]))).toThrow();
    expect(() => formSchema.parse(wrap([{ type: "grid", cols: 25, children: [] }]))).toThrow();
  });

  it("accepts root layoutProps and per-field decoratorProps (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "layout",
      title: "Layout",
      layoutProps: {
        layout: "horizontal",
        labelCol: { span: 6 },
        wrapperCol: { span: 12, offset: 1 },
        size: "small",
        colon: false,
        labelAlign: "left",
        labelWrap: true,
      },
      fields: [
        {
          type: "text",
          name: "n",
          label: "N",
          decoratorProps: { labelCol: { span: 8 }, colon: true, labelAlign: "right" },
        },
      ],
    });
    expect(out.layoutProps).toMatchObject({ layout: "horizontal", labelCol: { span: 6 } });
    expect(out.fields[0]).toMatchObject({ decoratorProps: { labelCol: { span: 8 } } });
  });

  it("still parses a root without layoutProps and rejects a bad layout enum", () => {
    expect(
      formSchema.parse({ formVersion: 3, id: "plain", title: "Plain", fields: [] }).layoutProps,
    ).toBeUndefined();
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad",
        title: "Bad",
        layoutProps: { layout: "diagonal" },
        fields: [],
      }),
    ).toThrow();
  });

  it("classifies containers/array/leaves via the shared helpers", () => {
    const text: FieldNode = { type: "text", name: "t", label: "T" };
    const card: FieldNode = { type: "card", children: [text] };
    const arr: FieldNode = { type: "array", name: "rows", itemFields: [text] };

    for (const type of LAYOUT_CONTAINER_TYPES) {
      expect(childrenKeyOf(type)).toBe("children");
    }
    expect(childrenKeyOf("array")).toBe("itemFields");
    expect(childrenKeyOf("text")).toBeNull();

    expect(isLayoutContainer(card)).toBe(true);
    expect(isLayoutContainer(arr)).toBe(false);
    expect(isLayoutContainer(text)).toBe(false);

    expect(childrenOf(card)).toEqual([text]);
    expect(childrenOf(arr)).toEqual([text]);
    expect(childrenOf(text)).toBeNull();
  });
});
