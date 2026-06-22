import { type FieldNode, migrate } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { dedupeFieldNames } from "./postprocess.js";

function form(fields: unknown[]) {
  return migrate({ formVersion: 3, id: "f", title: "F", fields });
}

/** Read `name` off any node; `display-text` is the only one without one. */
function nameOf(node: FieldNode): string | undefined {
  return "name" in node ? node.name : undefined;
}

describe("dedupeFieldNames", () => {
  it("suffixes repeated names while keeping the first", () => {
    const out = dedupeFieldNames(
      form([
        { type: "text", name: "email", label: "A" },
        { type: "text", name: "email", label: "B" },
        { type: "text", name: "email", label: "C" },
      ]),
    );
    expect(out.fields.map(nameOf)).toEqual(["email", "email_2", "email_3"]);
  });

  it("dedupes names nested inside containers and arrays", () => {
    const out = dedupeFieldNames(
      form([
        { type: "text", name: "x", label: "X" },
        {
          type: "group",
          name: "g",
          label: "G",
          children: [{ type: "text", name: "x", label: "nested" }],
        },
        {
          type: "array",
          name: "rows",
          label: "Rows",
          itemFields: [{ type: "text", name: "x", label: "item" }],
        },
      ]),
    );
    const names: string[] = [];
    const walk = (nodes: { name: string; children?: unknown[]; itemFields?: unknown[] }[]) => {
      for (const n of nodes) {
        names.push(n.name);
        if (Array.isArray(n.children)) walk(n.children as never);
        if (Array.isArray(n.itemFields)) walk(n.itemFields as never);
      }
    };
    walk(out.fields as never);
    expect(new Set(names).size).toBe(names.length);
  });

  it("does not mutate the input", () => {
    const input = form([
      { type: "text", name: "a", label: "A" },
      { type: "text", name: "a", label: "B" },
    ]);
    const before = input.fields.map(nameOf);
    dedupeFieldNames(input);
    expect(input.fields.map(nameOf)).toEqual(before);
  });
});
