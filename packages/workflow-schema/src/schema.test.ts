import { describe, expect, it } from "vitest";
import {
  CURRENT_WORKFLOW_VERSION,
  workflowDefinitionSchema,
  workflowInstanceSchema,
} from "./index.js";

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

  // WF4b i18n is additive: nodes/transitions gained an optional `i18n` map and the definition
  // gained `i18n`/`defaultLocale`/`locales`. Old definitions without them must keep parsing.
  it("parses an old definition without WF4b i18n fields (parse-compat)", () => {
    const out = workflowDefinitionSchema.parse(validDef);
    expect(out.i18n).toBeUndefined();
    expect(out.defaultLocale).toBeUndefined();
    expect(out.locales).toBeUndefined();
    expect(out.nodes[0].i18n).toBeUndefined();
    expect(out.transitions[0].i18n).toBeUndefined();
  });

  it("parses a definition carrying i18n on node, transition and definition", () => {
    const localized = {
      ...validDef,
      defaultLocale: "en",
      locales: ["vi"],
      i18n: { title: { vi: "Quy trình" } },
      nodes: [
        { id: "a", status: "created", formId: "f1", i18n: { status: { vi: "Đã tạo" } } },
        { id: "b", status: "done" },
      ],
      transitions: [
        { id: "t1", from: "a", to: "b", action: "next", i18n: { action: { vi: "Tiếp" } } },
      ],
    };
    const out = workflowDefinitionSchema.parse(localized);
    expect(out.i18n?.title.vi).toBe("Quy trình");
    expect(out.defaultLocale).toBe("en");
    expect(out.locales).toEqual(["vi"]);
    expect(out.nodes[0].i18n?.status.vi).toBe("Đã tạo");
    expect(out.transitions[0].i18n?.action.vi).toBe("Tiếp");
  });
});

describe("workflowInstanceSchema history actor (Phase E)", () => {
  const base = {
    id: "case-1",
    definitionId: "wf",
    definitionVersion: CURRENT_WORKFLOW_VERSION,
    current: "b",
    data: {},
  };

  it("parses history written before `actor` existed", () => {
    const out = workflowInstanceSchema.parse({
      ...base,
      history: [{ from: "a", to: "b", action: "next", at: "2026-07-30T00:00:00.000Z" }],
    });
    expect(out.history[0].actor).toBeUndefined();
  });

  it("parses history carrying the actor that fired the action", () => {
    const out = workflowInstanceSchema.parse({
      ...base,
      history: [
        { from: "a", to: "b", action: "next", at: "2026-07-30T00:00:00.000Z", actor: "usr_1" },
      ],
    });
    expect(out.history[0].actor).toBe("usr_1");
  });
});
