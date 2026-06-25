import { describe, expect, it } from "vitest";
import { CURRENT_WORKFLOW_VERSION, workflowDefinitionSchema } from "./index.js";

const validDef = {
  workflowVersion: CURRENT_WORKFLOW_VERSION,
  id: "wf",
  title: "WF",
  start: "a",
  nodes: [
    { id: "a", status: "created", formId: "f1" },
    { id: "b", status: "done" },
  ],
  transitions: [{ id: "t1", from: "a", to: "b", action: "next" }],
};

describe("workflowDefinitionSchema", () => {
  it("parses a valid definition", () => {
    const out = workflowDefinitionSchema.parse(validDef);
    expect(out.start).toBe("a");
    expect(out.nodes).toHaveLength(2);
  });

  it("rejects a node with an empty id", () => {
    const bad = { ...validDef, nodes: [{ id: "", status: "x" }] };
    expect(() => workflowDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a transition missing its action", () => {
    const bad = { ...validDef, transitions: [{ id: "t1", from: "a", to: "b" }] };
    expect(() => workflowDefinitionSchema.parse(bad)).toThrow();
  });

  // WE4 status catalog is additive: nodes gained optional `kind`/`statusCode`. Old definitions
  // without them must keep parsing (no workflowVersion bump), and new ones with them must parse.
  it("parses an old definition without WE4 status fields (parse-compat)", () => {
    const out = workflowDefinitionSchema.parse(validDef);
    expect(out.nodes[0].kind).toBeUndefined();
    expect(out.nodes[0].statusCode).toBeUndefined();
  });

  it("parses a node carrying WE4 kind + statusCode snapshot", () => {
    const withCatalog = {
      ...validDef,
      nodes: [
        { id: "a", status: "Chờ duyệt", kind: "start", statusCode: "pending" },
        { id: "b", status: "Đã duyệt", kind: "end", statusCode: "approved" },
      ],
    };
    const out = workflowDefinitionSchema.parse(withCatalog);
    expect(out.nodes[0].kind).toBe("start");
    expect(out.nodes[0].statusCode).toBe("pending");
    expect(out.nodes[1].kind).toBe("end");
  });

  it("rejects a node with an unknown kind", () => {
    const bad = { ...validDef, nodes: [{ id: "a", status: "x", kind: "optional" }] };
    expect(() => workflowDefinitionSchema.parse(bad)).toThrow();
  });
});
