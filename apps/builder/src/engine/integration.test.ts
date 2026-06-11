import {
  type CardField,
  formSchema,
  type GridField,
  migrate,
  type TabsField,
} from "@org/form-schema";
import { describe, expect, it } from "vitest";
import formV3 from "../../../../examples/form.v3.json";
import { metaGuard } from "../field-registry";
import { nodeAtPath, patchNodeAtPath } from "./field-path";
import { replaceField, schemaToTree, treeToField, treeToSchema } from "./transform";
import { findNode, move } from "./tree";

/**
 * End-to-end of the builder's data flow on the container-heavy v3 fixture:
 * load → reorder a top-level node → edit a deeply nested leaf through the
 * PropertyPanel boundary (treeToField → patchNodeAtPath → replaceField) → save.
 * Proves containers survive a full round-trip of real editing.
 */
describe("builder integration (App data flow)", () => {
  it("loads, reorders, patches a nested leaf, and saves valid container JSON", () => {
    // load
    const t0 = schemaToTree(migrate(formV3));
    expect(t0.children.map((c) => c.node.type)).toEqual(["tabs", "collapse"]);
    const tabsUid = t0.children[0].uid;
    const collapseUid = t0.children[1].uid;

    // reorder: move the tabs node after the collapse node (guarded like the canvas)
    const t1 = move(t0, tabsUid, { kind: "after", uid: collapseUid }, metaGuard());
    expect(t1.children.map((c) => c.node.type)).toEqual(["collapse", "tabs"]);

    // select the (now relocated) tabs node and resolve it to a schema field
    const tabsNode = findNode(t1, tabsUid);
    if (!tabsNode) throw new Error("tabs node vanished");
    const tabsField = treeToField(tabsNode) as TabsField;

    // drill tabs → pane[0] → card → grid → firstName, all via childrenOf-based path
    const path = [0, 0, 0, 0];
    expect(nodeAtPath(tabsField, path)).toMatchObject({ name: "firstName" });

    // edit that nested leaf and commit ONE rebuilt top-level node (PropertyPanel boundary)
    const patched = patchNodeAtPath(tabsField, path, { label: "Given name" });
    const t2 = replaceField(t1, tabsUid, patched);

    // save → the contract still parses and the container nesting is intact
    const out = treeToSchema(t2);
    expect(formSchema.safeParse(out).success).toBe(true);

    const tabs = out.fields.find((f) => f.type === "tabs") as TabsField;
    const card = tabs.children[0].children[0] as CardField;
    const grid = card.children[0] as GridField;
    expect(grid.type).toBe("grid");
    expect(grid.children[0]).toMatchObject({ name: "firstName", label: "Given name" });
    // the untouched array-in-tab and space-in-collapse survived too
    expect(tabs.children[1].children[0]).toMatchObject({ type: "array", name: "jobs" });
    expect(out.fields.find((f) => f.type === "collapse")).toBeTruthy();
  });
});
