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

  it("accepts the readOnly/readPretty pattern flags and a required reaction effect (additive)", () => {
    const doc = {
      formVersion: 3,
      id: "patterns",
      title: "Patterns",
      fields: [
        { type: "text", name: "ref", label: "Ref", readOnly: true },
        { type: "text", name: "summary", label: "Summary", readPretty: true },
        {
          type: "select",
          name: "kind",
          label: "Kind",
          reactions: [
            {
              when: { rule: { "==": [{ var: "kind" }, "company"] } },
              target: "vat",
              effect: "required",
            },
          ],
        },
        { type: "text", name: "vat", label: "VAT" },
      ],
    };
    const out = formSchema.parse(doc);
    expect(out.fields[0]).toMatchObject({ readOnly: true });
    expect(out.fields[1]).toMatchObject({ readPretty: true });
    expect(out.fields[2]).toMatchObject({ reactions: [{ effect: "required" }] });
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

  it("accepts the Phase L field types and rich props (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "phase-l",
      title: "Phase L",
      fields: [
        {
          type: "upload",
          name: "docs",
          label: "Documents",
          accept: "image/*,.pdf",
          maxCount: 3,
          listType: "picture",
          multiple: true,
          directory: true,
          dragger: true,
          required: true,
        },
        {
          type: "checkbox-group",
          name: "perks",
          label: "Perks",
          options: [
            { label: "Lunch", value: "lunch" },
            { label: "Gym", value: "gym" },
          ],
        },
        {
          type: "checkbox-group",
          name: "cities",
          label: "Cities",
          dataSource: { url: "/api/cities", labelKey: "name", valueKey: "id" },
        },
        { type: "number", name: "qty", label: "Qty", step: 0.5, precision: 2 },
        {
          type: "select",
          name: "tagsel",
          label: "Tags",
          tags: true,
          showSearch: true,
          allowClear: true,
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({
      type: "upload",
      maxCount: 3,
      listType: "picture",
      multiple: true,
      directory: true,
      dragger: true,
    });
    expect(out.fields[1]).toMatchObject({ type: "checkbox-group" });
    expect(out.fields[2]).toMatchObject({
      type: "checkbox-group",
      dataSource: { url: "/api/cities" },
    });
    expect(out.fields[3]).toMatchObject({ type: "number", step: 0.5, precision: 2 });
    expect(out.fields[4]).toMatchObject({ type: "select", tags: true, showSearch: true });
  });

  it("accepts the Phase M hierarchical and range field types (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "phase-m",
      title: "Phase M",
      fields: [
        {
          type: "cascader",
          name: "region",
          label: "Region",
          required: true,
          options: [
            {
              label: "Vietnam",
              value: "vn",
              children: [
                { label: "Ho Chi Minh", value: "hcm", children: [{ label: "D1", value: "d1" }] },
              ],
            },
          ],
        },
        {
          type: "tree-select",
          name: "dept",
          label: "Department",
          multiple: true,
          dataSource: { url: "/api/depts", labelKey: "name", valueKey: "id", childrenKey: "subs" },
        },
        { type: "date-range", name: "stay", label: "Stay", picker: "month" },
        { type: "time-range", name: "shift", label: "Shift" },
        { type: "date", name: "week", label: "Week", picker: "week" },
      ],
    });
    expect(out.fields[0]).toMatchObject({
      type: "cascader",
      options: [{ value: "vn", children: [{ value: "hcm", children: [{ value: "d1" }] }] }],
    });
    expect(out.fields[1]).toMatchObject({
      type: "tree-select",
      multiple: true,
      dataSource: { childrenKey: "subs" },
    });
    expect(out.fields[2]).toMatchObject({ type: "date-range", picker: "month" });
    expect(out.fields[3]).toMatchObject({ type: "time-range" });
    expect(out.fields[4]).toMatchObject({ type: "date", picker: "week" });
  });

  it("rejects an unknown picker variant and a tree option missing its label", () => {
    const base = { formVersion: 3, id: "bad", title: "Bad" };
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "date", name: "d", label: "D", picker: "decade" }],
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "cascader", name: "c", label: "C", options: [{ value: "lonely" }] }],
      }).success,
    ).toBe(false);
  });

  it("accepts the Phase N validation-depth props (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "phase-n",
      title: "Phase N",
      settings: { validateTrigger: "onBlur" },
      fields: [
        {
          type: "text",
          name: "username",
          label: "Username",
          validations: [{ type: "min", value: 3, severity: "warning", message: "Quite short" }],
          asyncValidator: { url: "/api/check-username", message: "Taken", debounceMs: 200 },
        },
        { type: "date", name: "start", label: "Start" },
        {
          type: "date",
          name: "end",
          label: "End",
          validations: [
            {
              type: "cross",
              rule: { "<=": [{ var: "start" }, { var: "end" }] },
              message: "End must be after start",
            },
          ],
        },
      ],
    });
    expect(out.settings).toMatchObject({ validateTrigger: "onBlur" });
    expect(out.fields[0]).toMatchObject({
      validations: [{ severity: "warning" }],
      asyncValidator: { url: "/api/check-username", debounceMs: 200 },
    });
    expect(out.fields[2]).toMatchObject({
      validations: [{ type: "cross", rule: { "<=": [{ var: "start" }, { var: "end" }] } }],
    });
  });

  it("accepts the X2/X3 rich input + choice props (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "rich-props",
      title: "Rich props",
      fields: [
        {
          type: "text",
          name: "code",
          label: "Code",
          allowClear: true,
          showCount: true,
          prefix: "#",
          suffix: ".io",
          prefixIcon: "antd:SearchOutlined",
          suffixIcon: "antd:CheckCircleOutlined",
          addonBefore: "https://",
          addonAfter: ".com",
          size: "large",
          variant: "filled",
        },
        {
          type: "textarea",
          name: "bio",
          label: "Bio",
          autoSize: { minRows: 2, maxRows: 6 },
          showCount: true,
          size: "small",
        },
        { type: "textarea", name: "notes", label: "Notes", autoSize: true },
        {
          type: "number",
          name: "price",
          label: "Price",
          prefix: "$",
          prefixIcon: "antd:DollarOutlined",
          addonAfter: "USD",
          controls: false,
          keyboard: true,
          displayFormat: "currency",
          currency: "USD",
          size: "middle",
          variant: "borderless",
        },
        {
          type: "select",
          name: "tags",
          label: "Tags",
          multiple: true,
          placeholder: "Pick…",
          maxTagCount: "responsive",
          size: "large",
          variant: "filled",
        },
        {
          type: "radio",
          name: "plan",
          label: "Plan",
          optionType: "button",
          buttonStyle: "solid",
          size: "small",
          options: [{ label: "A", value: "a" }],
        },
        {
          type: "checkbox-group",
          name: "perms",
          label: "Perms",
          direction: "vertical",
          options: [{ label: "Read", value: "r" }],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({
      allowClear: true,
      prefix: "#",
      prefixIcon: "antd:SearchOutlined",
      suffixIcon: "antd:CheckCircleOutlined",
      variant: "filled",
    });
    expect(out.fields[1]).toMatchObject({ autoSize: { minRows: 2, maxRows: 6 } });
    expect(out.fields[2]).toMatchObject({ autoSize: true });
    expect(out.fields[3]).toMatchObject({ displayFormat: "currency", controls: false });
    expect(out.fields[4]).toMatchObject({ maxTagCount: "responsive", placeholder: "Pick…" });
    expect(out.fields[5]).toMatchObject({ optionType: "button", buttonStyle: "solid" });
    expect(out.fields[6]).toMatchObject({ direction: "vertical" });
  });

  it("accepts the X4 date/time picker props (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "datetime-props",
      title: "Date/time props",
      fields: [
        {
          type: "date",
          name: "due",
          label: "Due",
          picker: "date",
          format: "DD/MM/YYYY",
          showTime: true,
          allowClear: true,
          size: "large",
          variant: "filled",
        },
        {
          type: "date-range",
          name: "stay",
          label: "Stay",
          format: "YYYY-MM-DD",
          showTime: false,
          allowClear: true,
        },
        {
          type: "time",
          name: "at",
          label: "At",
          format: "hh:mm A",
          use12Hours: true,
          minuteStep: 15,
          allowClear: true,
          size: "small",
        },
        {
          type: "time-range",
          name: "shift",
          label: "Shift",
          format: "HH:mm",
          minuteStep: 5,
          variant: "borderless",
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({
      format: "DD/MM/YYYY",
      showTime: true,
      variant: "filled",
    });
    expect(out.fields[1]).toMatchObject({ format: "YYYY-MM-DD", allowClear: true });
    expect(out.fields[2]).toMatchObject({ use12Hours: true, minuteStep: 15, size: "small" });
    expect(out.fields[3]).toMatchObject({ format: "HH:mm", minuteStep: 5 });
  });

  it("accepts the X5 widget props (switch/slider/rate, additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "widget-props",
      title: "Widget props",
      fields: [
        {
          type: "switch",
          name: "active",
          label: "Active",
          checkedChildren: "ON",
          unCheckedChildren: "OFF",
          size: "small",
        },
        {
          type: "slider",
          name: "band",
          label: "Band",
          min: 0,
          max: 100,
          step: 10,
          range: true,
          vertical: true,
          dots: true,
        },
        {
          type: "rate",
          name: "score",
          label: "Score",
          count: 10,
          allowHalf: true,
          character: "heart",
          allowClear: true,
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ checkedChildren: "ON", size: "small" });
    expect(out.fields[1]).toMatchObject({ range: true, vertical: true, dots: true });
    expect(out.fields[2]).toMatchObject({ character: "heart", allowClear: true });
  });

  it("accepts the X8 validator format enum and rejects an unknown format", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "formats",
      title: "Formats",
      fields: [
        {
          type: "text",
          name: "amount",
          label: "Amount",
          validations: [{ type: "format", format: "money" }],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ validations: [{ format: "money" }] });
    expect(
      formSchema.safeParse({
        formVersion: 3,
        id: "bad-format",
        title: "Bad format",
        fields: [
          { type: "text", name: "x", label: "X", validations: [{ type: "format", format: "ssn" }] },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects bad switch size and rate character enums", () => {
    const base = { formVersion: 3, id: "bad-widget", title: "Bad widget" };
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "switch", name: "s", label: "S", size: "large" }],
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "rate", name: "r", label: "R", character: "diamond" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive minuteStep and a non-boolean showTime", () => {
    const base = { formVersion: 3, id: "bad-dt", title: "Bad dt" };
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "time", name: "t", label: "T", minuteStep: 0 }],
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "date", name: "d", label: "D", showTime: "yes" }],
      }).success,
    ).toBe(false);
  });

  it("rejects bad variant / size / displayFormat enums", () => {
    const base = { formVersion: 3, id: "bad-rich", title: "Bad rich" };
    const text = (extra: Record<string, unknown>) => ({
      type: "text",
      name: "t",
      label: "T",
      ...extra,
    });
    expect(formSchema.safeParse({ ...base, fields: [text({ variant: "ghost" })] }).success).toBe(
      false,
    );
    expect(formSchema.safeParse({ ...base, fields: [text({ size: "huge" })] }).success).toBe(false);
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "number", name: "n", label: "N", displayFormat: "scientific" }],
      }).success,
    ).toBe(false);
  });

  it("accepts cross-cutting decorator extras (extra hint + hasFeedback) on any leaf", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "x7",
      title: "X7",
      fields: [
        { type: "text", name: "t", label: "T", extra: "Always shown below", hasFeedback: true },
        { type: "switch", name: "s", label: "S", hasFeedback: true },
      ],
    });
    expect(out.fields[0]).toMatchObject({ extra: "Always shown below", hasFeedback: true });
    expect(out.fields[1]).toMatchObject({ hasFeedback: true });
  });

  it("rejects a non-string extra / non-boolean hasFeedback", () => {
    const base = { formVersion: 3, id: "bad-x7", title: "Bad X7" };
    const text = (extra: Record<string, unknown>) => ({
      type: "text",
      name: "t",
      label: "T",
      ...extra,
    });
    expect(formSchema.safeParse({ ...base, fields: [text({ extra: 5 })] }).success).toBe(false);
    expect(formSchema.safeParse({ ...base, fields: [text({ hasFeedback: "yes" })] }).success).toBe(
      false,
    );
  });

  it("rejects bad severity / trigger / asyncValidator shapes", () => {
    const base = { formVersion: 3, id: "bad", title: "Bad" };
    const text = (extra: Record<string, unknown>) => ({
      type: "text",
      name: "t",
      label: "T",
      ...extra,
    });
    expect(
      formSchema.safeParse({
        ...base,
        fields: [text({ validations: [{ type: "min", value: 1, severity: "info" }] })],
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        ...base,
        settings: { validateTrigger: "onHover" },
        fields: [],
      }).success,
    ).toBe(false);
    expect(formSchema.safeParse({ ...base, fields: [text({ asyncValidator: {} })] }).success).toBe(
      false,
    );
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

  it("accepts the responsive auto variant on an array node", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "array-auto",
      title: "Array auto",
      fields: [
        {
          type: "array",
          name: "rows",
          label: "Rows",
          variant: "auto",
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "array", variant: "auto" });
  });

  it("accepts the optional editInDialog flag on a table array node", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "array-dialog",
      title: "Array dialog",
      fields: [
        {
          type: "array",
          name: "rows",
          label: "Rows",
          variant: "table",
          editInDialog: true,
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "array", variant: "table", editInDialog: true });
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

  it("accepts a select dataSource with params[] and ttlMs", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "with-datasource",
      title: "With dataSource",
      fields: [
        {
          type: "select",
          name: "city",
          label: "City",
          dataSource: {
            url: "https://api.test/cities",
            labelKey: "name",
            valueKey: "id",
            params: [
              { name: "country", from: "country" },
              { name: "region", from: "regionField" },
            ],
            ttlMs: 60000,
          },
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({
      type: "select",
      dataSource: {
        ttlMs: 60000,
        params: [
          { name: "country", from: "country" },
          { name: "region", from: "regionField" },
        ],
      },
    });
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

  it("accepts a value-less display-text node and keeps it a non-container leaf (additive)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "display",
      title: "Display",
      fields: [
        { type: "display-text", content: "Welcome", variant: "title", level: 2, align: "center" },
        { type: "display-text", content: "Fill in the form below." },
        { type: "text", name: "name", label: "Name" },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "display-text", variant: "title", level: 2 });
    expect(out.fields[1]).toMatchObject({
      type: "display-text",
      content: "Fill in the form below.",
    });
    // It owns no value, so it must NOT be a value-transparent layout container.
    expect(isLayoutContainer(out.fields[0] as FieldNode)).toBe(false);
    expect(childrenOf(out.fields[0] as FieldNode)).toBeNull();
  });

  it("rejects a display-text missing content or with a bad variant/level", () => {
    const base = { formVersion: 3, id: "bad-display", title: "Bad" };
    expect(formSchema.safeParse({ ...base, fields: [{ type: "display-text" }] }).success).toBe(
      false,
    );
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "display-text", content: "x", variant: "banner" }],
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        ...base,
        fields: [{ type: "display-text", content: "x", level: 9 }],
      }).success,
    ).toBe(false);
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

  it("accepts a steps wizard with step panes carrying a description", () => {
    const out = formSchema.parse(
      wrap([
        {
          type: "steps",
          children: [
            {
              type: "step",
              label: "Account",
              description: "Your login details",
              children: [{ type: "text", name: "email", label: "Email" }],
            },
            { type: "step", label: "Profile", children: [] },
          ],
        },
      ]),
    );
    const steps = out.fields[0];
    expect(steps.type).toBe("steps");
    expect(steps).toMatchObject({
      children: [
        { type: "step", label: "Account", description: "Your login details" },
        { type: "step", label: "Profile" },
      ],
    });
  });

  it("rejects a non-step child directly inside steps", () => {
    expect(() =>
      formSchema.parse(
        wrap([{ type: "steps", children: [{ type: "text", name: "x", label: "X" }] }]),
      ),
    ).toThrow();
  });

  it("requires a label on step", () => {
    expect(() =>
      formSchema.parse(wrap([{ type: "steps", children: [{ type: "step", children: [] }] }])),
    ).toThrow();
  });

  it("accepts a form-layout container as a value-transparent layout region", () => {
    const out = formSchema.parse(
      wrap([
        {
          type: "form-layout",
          formLayout: "horizontal",
          labelCol: { span: 6 },
          wrapperCol: { span: 18 },
          labelAlign: "right",
          colon: false,
          children: [{ type: "text", name: "email", label: "Email" }],
        },
      ]),
    );
    const region = out.fields[0] as FieldNode;
    expect(region).toMatchObject({
      type: "form-layout",
      formLayout: "horizontal",
      labelCol: { span: 6 },
    });
    // It hoists its children's values (like group), so it IS a layout container.
    expect(isLayoutContainer(region)).toBe(true);
    expect(childrenOf(region)?.[0]).toMatchObject({ type: "text", name: "email" });
  });

  it("rejects a form-layout with an unknown formLayout orientation", () => {
    expect(() =>
      formSchema.parse(
        wrap([{ type: "form-layout", formLayout: "grid", children: [] } as unknown as FieldNode]),
      ),
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

describe("i18n overrides (additive, Phase P)", () => {
  it("accepts per-node, per-option, container and form-level i18n maps", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "i18n",
      title: "Survey",
      i18n: { title: { vi: "Khảo sát" } },
      fields: [
        {
          type: "text",
          name: "email",
          label: "Email",
          placeholder: "you@example.com",
          i18n: { label: { vi: "Thư điện tử" }, placeholder: { vi: "ban@vidu.com" } },
        },
        {
          type: "radio",
          name: "gender",
          label: "Gender",
          options: [
            { label: "Male", value: "m", i18n: { vi: "Nam" } },
            { label: "Female", value: "f", i18n: { vi: "Nữ" } },
          ],
        },
        {
          type: "card",
          title: "Details",
          i18n: { title: { vi: "Chi tiết" } },
          children: [
            { type: "display-text", content: "Note", i18n: { content: { vi: "Ghi chú" } } },
          ],
        },
      ],
    });
    expect(out.i18n).toEqual({ title: { vi: "Khảo sát" } });
    expect(out.fields[0]).toMatchObject({ i18n: { label: { vi: "Thư điện tử" } } });
    const radio = out.fields[1] as { options: Array<{ i18n?: Record<string, string> }> };
    expect(radio.options[0].i18n).toEqual({ vi: "Nam" });
  });

  it("still parses old JSON with no i18n anywhere (additive — no formVersion bump)", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "plain",
      title: "Plain",
      fields: [{ type: "text", name: "n", label: "N" }],
    });
    expect(out.i18n).toBeUndefined();
    expect((out.fields[0] as { i18n?: unknown }).i18n).toBeUndefined();
  });

  it("rejects a malformed i18n map (not an object of locale strings)", () => {
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad-i18n",
        title: "Bad",
        fields: [{ type: "text", name: "n", label: "N", i18n: { label: "not-a-map" } }],
      }),
    ).toThrow();
  });
});
