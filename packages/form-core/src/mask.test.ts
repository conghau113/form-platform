import type { FormSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { maskData } from "./mask.js";

function form(fields: FormSchema["fields"]): FormSchema {
  return { formVersion: 3, id: "t", title: "Test", fields };
}

describe("maskData", () => {
  const schema = form([
    { type: "text", name: "name", label: "Name" },
    { type: "text", name: "salary", label: "Salary", permissions: { viewRoles: ["hr"] } },
    {
      type: "group",
      name: "personal",
      children: [{ type: "text", name: "ssn", label: "SSN", permissions: { viewRoles: ["hr"] } }],
    },
    {
      type: "array",
      name: "deps",
      itemFields: [
        { type: "text", name: "dep", label: "Dependent" },
        { type: "text", name: "note", label: "Note", permissions: { viewRoles: ["hr"] } },
      ],
    },
  ]);
  const data = {
    name: "Ada",
    salary: 100,
    ssn: "123",
    deps: [{ dep: "Kid", note: "secret" }],
  };

  it("strips a role-gated leaf when the actor lacks the role", () => {
    const out = maskData(schema, data, { roles: [] });
    expect(out).toEqual({ name: "Ada", deps: [{ dep: "Kid" }] });
  });

  it("keeps role-gated fields when the actor holds the role", () => {
    const out = maskData(schema, data, { roles: ["hr"] });
    expect(out).toEqual(data);
  });

  it("masks a gated field nested in a transparent container", () => {
    const out = maskData(schema, data, { roles: [] });
    expect("ssn" in out).toBe(false);
  });

  it("masks a gated field per array row", () => {
    const out = maskData(schema, data, { roles: [] }) as { deps: unknown[] };
    expect(out.deps).toEqual([{ dep: "Kid" }]);
  });

  it("drops an entire container when the container itself is gated", () => {
    const gated = form([
      {
        type: "group",
        name: "personal",
        permissions: { viewRoles: ["hr"] },
        children: [{ type: "text", name: "ssn", label: "SSN" }],
      },
    ]);
    expect(maskData(gated, { ssn: "123" }, { roles: [] })).toEqual({});
    expect(maskData(gated, { ssn: "123" }, { roles: ["hr"] })).toEqual({ ssn: "123" });
  });

  it("does not mutate the input data", () => {
    const input = structuredClone(data);
    maskData(schema, input, { roles: [] });
    expect(input).toEqual(data);
  });
});
