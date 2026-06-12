import { CURRENT_FORM_VERSION, type FormSchema, formSchema, migrate } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import formV1 from "../../../../examples/form.v1.json";
import formV3 from "../../../../examples/form.v3.json";
import {
  applyFieldEdit,
  fieldToTree,
  replaceField,
  schemaToTree,
  treeToField,
  treeToSchema,
} from "./transform";
import { findNode } from "./tree";

/** treeToSchema(schemaToTree(x)) must deep-equal x for any valid, current-version form. */
function roundTrips(form: FormSchema) {
  expect(treeToSchema(schemaToTree(form))).toEqual(form);
}

describe("transform — round-trip identity", () => {
  it("round-trips the migrated v1 fixture (leaves, conditions, permissions, layout)", () => {
    roundTrips(migrate(formV1));
  });

  it("round-trips the v3 fixture (tabs/card/grid/collapse/space + array-in-tab + container-in-array)", () => {
    roundTrips(migrate(formV3));
  });

  it("round-trips form-level layoutProps and settings", () => {
    roundTrips({
      formVersion: CURRENT_FORM_VERSION,
      id: "f",
      title: "Layout",
      layoutProps: { layout: "horizontal", labelCol: { span: 6 }, size: "small", colon: false },
      fields: [{ type: "text", name: "a", label: "A" }],
      settings: { submitUrl: "/x", validateTrigger: "onBlur" },
    });
  });

  it("round-trips per-field decoratorProps", () => {
    roundTrips({
      formVersion: CURRENT_FORM_VERSION,
      id: "f",
      title: "Decorator",
      fields: [
        {
          type: "text",
          name: "a",
          label: "A",
          decoratorProps: { labelCol: { span: 4 }, colon: true, labelAlign: "left" },
        },
      ],
    });
  });

  it("round-trips every container type, including empty children/itemFields", () => {
    const form: FormSchema = {
      formVersion: CURRENT_FORM_VERSION,
      id: "containers",
      title: "Containers",
      fields: [
        { type: "tabs", children: [] },
        {
          type: "tabs",
          children: [
            { type: "tab-pane", label: "One", children: [{ type: "text", name: "t", label: "T" }] },
          ],
        },
        {
          type: "collapse",
          accordion: true,
          children: [{ type: "collapse-panel", label: "P", children: [] }],
        },
        { type: "card", title: "C", children: [] },
        { type: "grid", cols: 3, children: [{ type: "number", name: "n", label: "N" }] },
        { type: "space", direction: "vertical", children: [] },
        { type: "group", name: "g", children: [] },
        { type: "array", name: "rows", itemFields: [] },
        {
          type: "array",
          name: "people",
          variant: "table",
          itemFields: [{ type: "text", name: "first", label: "First" }],
        },
      ],
    };
    // sanity: the fixture is a valid contract document before we transform it
    expect(formSchema.safeParse(form).success).toBe(true);
    roundTrips(form);
  });
});

describe("transform — fresh uids", () => {
  it("stamps a unique uid on every node when loading", () => {
    const tree = schemaToTree(migrate(formV3));
    const uids: string[] = [];
    const walk = (n: { uid: string; children: { uid: string }[] }) => {
      uids.push(n.uid);
      for (const c of n.children) walk(c as never);
    };
    walk(tree);
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe("transform — replaceField", () => {
  const base = schemaToTree({
    formVersion: CURRENT_FORM_VERSION,
    id: "f",
    title: "F",
    fields: [
      { type: "text", name: "a", label: "A" },
      { type: "text", name: "b", label: "B" },
    ],
  });

  it("keeps the target uid and replaces its props", () => {
    const targetUid = base.children[0].uid;
    const next = replaceField(base, targetUid, { type: "number", name: "a", label: "A2" });
    const hit = findNode(next, targetUid);
    expect(hit?.uid).toBe(targetUid);
    expect(treeToField(hit as never)).toEqual({ type: "number", name: "a", label: "A2" });
  });

  it("regenerates descendant uids of the replacement subtree", () => {
    const targetUid = base.children[0].uid;
    const next = replaceField(base, targetUid, {
      type: "card",
      children: [{ type: "text", name: "a", label: "A" }],
    });
    const hit = findNode(next, targetUid);
    expect(hit?.children).toHaveLength(1);
    // child uid is freshly generated, never the kept target uid
    expect(hit?.children[0].uid).not.toBe(targetUid);
    expect(hit?.children[0].uid).toMatch(/^f\d+$/);
  });

  it("shares untouched siblings by reference (structural sharing)", () => {
    const targetUid = base.children[0].uid;
    const next = replaceField(base, targetUid, { type: "number", name: "a", label: "A" });
    expect(next).not.toBe(base);
    expect(next.children[1]).toBe(base.children[1]);
  });

  it("returns the same root reference when the uid is absent", () => {
    expect(replaceField(base, "nope", { type: "text", name: "z", label: "Z" })).toBe(base);
  });

  it("fieldToTree on a leaf yields no children", () => {
    expect(fieldToTree({ type: "text", name: "x", label: "X" }).children).toEqual([]);
  });
});

describe("transform — applyFieldEdit (D8: containers patch, leaves replace)", () => {
  const tree = schemaToTree({
    formVersion: CURRENT_FORM_VERSION,
    id: "f",
    title: "F",
    fields: [
      { type: "card", title: "Card", children: [{ type: "text", name: "a", label: "A" }] },
      { type: "text", name: "b", label: "B" },
    ],
  });
  const cardUid = tree.children[0].uid;
  const childUid = tree.children[0].children[0].uid;
  const leafUid = tree.children[1].uid;

  it("patches a container's own props while KEEPING descendant uids", () => {
    // The edit carries the whole card incl. its child (as PropertyPanel emits it).
    const edited = { ...(treeToField(tree.children[0]) as object), title: "Renamed" };
    const next = applyFieldEdit(tree, cardUid, edited as never);
    expect((findNode(next, cardUid)?.node as { title?: string }).title).toBe("Renamed");
    // The child node is the SAME uid — not regenerated (replaceField would have).
    const child = findNode(next, childUid);
    expect(child).not.toBeNull();
    expect((child?.node as { name?: string }).name).toBe("a");
  });

  it("replaces a leaf wholesale, keeping its own uid", () => {
    const next = applyFieldEdit(tree, leafUid, { type: "number", name: "b", label: "B2" });
    const hit = findNode(next, leafUid);
    expect(hit?.uid).toBe(leafUid);
    expect(treeToField(hit as never)).toEqual({ type: "number", name: "b", label: "B2" });
  });
});
