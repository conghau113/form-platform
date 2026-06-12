import type { FieldNode, FormSchema, Reaction } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import {
  collectValueEffects,
  computeNodeReactions,
  computeReactions,
  effectiveVisible,
} from "./reactions.js";

function form(fields: FieldNode[]): FormSchema {
  return { formVersion: 3, id: "t", title: "Test", fields };
}

/** A leaf text field carrying reactions, declared on `name`. */
function source(name: string, reactions: Reaction[]): FieldNode {
  return { type: "text", name, label: name, reactions } as FieldNode;
}

const eq = (path: string, val: unknown): Reaction["when"] => ({
  rule: { "==": [{ var: path }, val] },
});

describe("computeReactions", () => {
  it("returns an empty map when there are no reactions", () => {
    expect(computeReactions(form([{ type: "text", name: "a", label: "A" }]), {})).toEqual({});
  });

  it("applies each effect only while `when` is true", () => {
    const f = form([
      source("kind", [
        { when: eq("kind", "company"), target: "vat", effect: "visible" },
        { when: eq("kind", "company"), target: "note", effect: "disabled" },
        { when: eq("kind", "company"), target: "tier", effect: "value", value: "gold" },
        {
          when: eq("kind", "company"),
          target: "city",
          effect: "options",
          value: [{ label: "HN", value: "hn" }],
        },
      ]),
    ]);
    expect(computeReactions(f, { kind: "person" })).toEqual({});
    expect(computeReactions(f, { kind: "company" })).toEqual({
      vat: { visible: true },
      note: { disabled: true },
      tier: { value: { set: "gold" } },
      city: { options: [{ label: "HN", value: "hn" }] },
    });
  });

  it("defaults the visible payload to true and honors an explicit false (hide-when-matched)", () => {
    const f = form([
      source("a", [
        { when: eq("a", 1), target: "shown", effect: "visible" },
        { when: eq("a", 1), target: "hidden", effect: "visible", value: false },
      ]),
    ]);
    expect(computeReactions(f, { a: 1 })).toEqual({
      shown: { visible: true },
      hidden: { visible: false },
    });
  });

  it("distinguishes `value: undefined` (clear) from no value effect", () => {
    const f = form([source("a", [{ when: eq("a", 1), target: "b", effect: "value" }])]);
    const map = computeReactions(f, { a: 1 });
    expect(map.b).toEqual({ value: { set: undefined } });
    expect("value" in map.b).toBe(true);
  });

  it("last matching reaction wins per (target, effect)", () => {
    const f = form([
      source("a", [
        { when: eq("a", 1), target: "b", effect: "value", value: "first" },
        { when: eq("a", 1), target: "b", effect: "value", value: "second" },
      ]),
    ]);
    expect(computeReactions(f, { a: 1 }).b).toEqual({ value: { set: "second" } });
  });

  it("skips a reaction that targets its own host field", () => {
    const f = form([source("self", [{ when: eq("self", 1), target: "self", effect: "disabled" }])]);
    expect(computeReactions(f, { self: 1 })).toEqual({});
  });

  it("drops the reaction that closes an A<->B value cycle (earlier wins)", () => {
    const f = form([
      // declared on a → sets b from a (b depends on a); kept first
      source("a", [{ when: eq("a", 1), target: "b", effect: "value", value: "fromA" }]),
      // declared on b → sets a from b (a depends on b); closes b -> a -> b, dropped
      source("b", [{ when: eq("b", 1), target: "a", effect: "value", value: "fromB" }]),
    ]);
    const map = computeReactions(f, { a: 1, b: 1 });
    expect(map.b).toEqual({ value: { set: "fromA" } });
    expect(map.a).toBeUndefined();
  });

  it("finds reactions nested inside groups and tabs", () => {
    const f = form([
      {
        type: "tabs",
        children: [
          {
            type: "tab-pane",
            label: "T",
            children: [
              {
                type: "group",
                name: "g",
                children: [source("a", [{ when: eq("a", 1), target: "b", effect: "visible" }])],
              },
            ],
          },
        ],
      } as FieldNode,
    ]);
    expect(computeReactions(f, { a: 1 })).toEqual({ b: { visible: true } });
  });

  it("does NOT walk into array itemFields (row-scoped)", () => {
    const f = form([
      {
        type: "array",
        name: "rows",
        itemFields: [source("a", [{ when: eq("a", 1), target: "b", effect: "visible" }])],
      } as FieldNode,
    ]);
    expect(computeReactions(f, { a: 1 })).toEqual({});
  });

  it("fires even when the reaction's source field is itself hidden (single-pass tradeoff)", () => {
    const f = form([
      {
        type: "text",
        name: "src",
        label: "Src",
        visibleWhen: { rule: { "==": [1, 0] } },
        reactions: [{ when: eq("src", "x"), target: "tgt", effect: "visible" }],
      } as FieldNode,
    ]);
    // src is hidden, but its reaction still evaluates against current values.
    expect(computeReactions(f, { src: "x" })).toEqual({ tgt: { visible: true } });
  });
});

describe("effectiveVisible (precedence)", () => {
  const node: FieldNode = {
    type: "text",
    name: "f",
    label: "F",
    visibleWhen: { rule: { "==": [{ var: "show" }, true] } },
  };

  it("reaction effect overrides visibleWhen in both directions", () => {
    // reaction true beats visibleWhen false
    expect(effectiveVisible(node, { show: false }, { f: { visible: true } })).toBe(true);
    // reaction false beats visibleWhen true
    expect(effectiveVisible(node, { show: true }, { f: { visible: false } })).toBe(false);
  });

  it("falls through to visibleWhen when no reaction visible effect", () => {
    expect(effectiveVisible(node, { show: true }, { f: { disabled: true } })).toBe(true);
    expect(effectiveVisible(node, { show: false }, {})).toBe(false);
    expect(effectiveVisible(node, { show: true })).toBe(true);
  });

  it("treats a node with no visibleWhen and no effect as visible", () => {
    const plain: FieldNode = { type: "text", name: "p", label: "P" };
    expect(effectiveVisible(plain, {})).toBe(true);
  });
});

describe("collectValueEffects", () => {
  it("emits target -> value only for matching value effects", () => {
    const f = form([
      source("a", [
        { when: eq("a", 1), target: "b", effect: "value", value: "x" },
        { when: eq("a", 2), target: "c", effect: "value", value: "y" },
        { when: eq("a", 1), target: "d", effect: "visible" },
      ]),
    ]);
    expect(collectValueEffects(f, { a: 1 })).toEqual({ b: "x" });
  });

  it("emits dotted per-row paths for value effects inside a visible array (G4)", () => {
    const f = form([
      {
        type: "array",
        name: "rows",
        itemFields: [
          source("kind", [
            { when: eq("kind", "co"), target: "tier", effect: "value", value: "gold" },
          ]),
          { type: "text", name: "tier", label: "Tier" },
        ],
      } as FieldNode,
    ]);
    const out = collectValueEffects(f, { rows: [{ kind: "co" }, { kind: "person" }] });
    // only row 0 matches -> dotted path with its index
    expect(out).toEqual({ "rows.0.tier": "gold" });
  });
});

describe("computeNodeReactions", () => {
  it("computes against a merged scope (used by per-row linkage in G4)", () => {
    const nodes: FieldNode[] = [
      source("a", [{ when: eq("a", 1), target: "b", effect: "visible" }]),
    ];
    expect(computeNodeReactions(nodes, { a: 1 })).toEqual({ b: { visible: true } });
    expect(computeNodeReactions(nodes, { a: 0 })).toEqual({});
  });
});
