import { describe, expect, it } from "vitest";
import {
  CURRENT_WORKFLOW_VERSION,
  ROOT_SCOPE,
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

  // E1 `defaultAssignee` is additive: nodes gained an optional {kind, value}. Old definitions
  // without it must keep parsing, so CURRENT_WORKFLOW_VERSION does NOT move.
  it("parses an old definition without E1 defaultAssignee (parse-compat)", () => {
    const out = workflowDefinitionSchema.parse(validDef);
    expect(out.nodes[0].defaultAssignee).toBeUndefined();
    expect(CURRENT_WORKFLOW_VERSION).toBe(1);
  });

  it("parses a node carrying defaultAssignee for a role and for a user", () => {
    const assigned = {
      ...validDef,
      nodes: [
        { id: "a", status: "created", defaultAssignee: { kind: "role", value: "manager" } },
        { id: "b", status: "done", defaultAssignee: { kind: "user", value: "u1" } },
      ],
    };
    const out = workflowDefinitionSchema.parse(assigned);
    expect(out.nodes[0].defaultAssignee).toEqual({ kind: "role", value: "manager" });
    expect(out.nodes[1].defaultAssignee).toEqual({ kind: "user", value: "u1" });
  });

  it("rejects a defaultAssignee whose kind is outside role|user", () => {
    const bad = {
      ...validDef,
      nodes: [{ id: "a", status: "x", defaultAssignee: { kind: "team", value: "ops" } }],
    };
    expect(workflowDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  // E2 `gateway` is additive: nodes gained an optional "fork"|"join" marker. Old definitions without
  // it must keep parsing, so CURRENT_WORKFLOW_VERSION does NOT move.
  it("parses an old definition without E2 gateway (parse-compat)", () => {
    const out = workflowDefinitionSchema.parse(validDef);
    expect(out.nodes[0].gateway).toBeUndefined();
    expect(CURRENT_WORKFLOW_VERSION).toBe(1);
  });

  it("parses nodes marked as a fork and as a join", () => {
    const parallel = {
      ...validDef,
      nodes: [
        { id: "a", status: "split", gateway: "fork" },
        { id: "b", status: "merge", gateway: "join" },
      ],
    };
    const out = workflowDefinitionSchema.parse(parallel);
    expect(out.nodes[0].gateway).toBe("fork");
    expect(out.nodes[1].gateway).toBe("join");
  });

  it("rejects a gateway outside fork|join", () => {
    const bad = { ...validDef, nodes: [{ id: "a", status: "x", gateway: "merge" }] };
    expect(workflowDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it("keeps gateway orthogonal to kind (a fork is still a catalog `kind`)", () => {
    const both = {
      ...validDef,
      nodes: [{ id: "a", status: "split", kind: "normal", gateway: "fork" }, validDef.nodes[1]],
    };
    const out = workflowDefinitionSchema.parse(both);
    expect(out.nodes[0].kind).toBe("normal");
    expect(out.nodes[0].gateway).toBe("fork");
  });

  it("rejects a defaultAssignee with an empty value", () => {
    // Separate from the `kind` case on purpose: folded into one test, dropping `.min(1)` from
    // `value` would still leave the assertion green.
    const bad = {
      ...validDef,
      nodes: [{ id: "a", status: "x", defaultAssignee: { kind: "role", value: "" } }],
    };
    expect(workflowDefinitionSchema.safeParse(bad).success).toBe(false);
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

// E2 marking is additive: an instance gained optional `tokens`/`scopes` while `current` stays
// required (the dual-write phase). Each constraint gets its OWN test — folded into one, relaxing any
// single one of them would leave the assertion green.
describe("workflowInstanceSchema marking (E2)", () => {
  const base = {
    id: "case-1",
    definitionId: "wf",
    definitionVersion: CURRENT_WORKFLOW_VERSION,
    current: "b",
    data: {},
    history: [],
  };

  it("parses an instance written before tokens existed (parse-compat)", () => {
    const out = workflowInstanceSchema.parse(base);
    expect(out.tokens).toBeUndefined();
    expect(out.scopes).toBeUndefined();
    expect(CURRENT_WORKFLOW_VERSION).toBe(1);
  });

  it("parses a marking of two tokens from one fork run", () => {
    const out = workflowInstanceSchema.parse({
      ...base,
      tokens: [
        { id: "tk1", at: "review_a", scope: "s1" },
        { id: "tk2", at: "review_b", scope: "s1" },
      ],
      scopes: { s1: { forkNode: "split", expected: 2, parent: null } },
    });
    expect(out.tokens).toHaveLength(2);
    expect(out.tokens?.[1].at).toBe("review_b");
    expect(out.scopes?.s1.expected).toBe(2);
  });

  it("rejects an empty marking — zero tokens is not a state this model has", () => {
    expect(workflowInstanceSchema.safeParse({ ...base, tokens: [] }).success).toBe(false);
  });

  it("rejects a scope expecting zero branches", () => {
    const bad = {
      ...base,
      tokens: [{ id: "tk1", at: "a", scope: "s1" }],
      scopes: { s1: { forkNode: "split", expected: 0, parent: null } },
    };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a nested scope naming its parent, and a top-level one naming null", () => {
    const out = workflowInstanceSchema.parse({
      ...base,
      tokens: [{ id: "tk1", at: "a", scope: "s2" }],
      scopes: {
        s1: { forkNode: "outer", expected: 2, parent: null },
        s2: { forkNode: "inner", expected: 2, parent: "s1" },
      },
    });
    expect(out.scopes?.s1.parent).toBeNull();
    expect(out.scopes?.s2.parent).toBe("s1");
  });

  it("rejects a token with no scope", () => {
    const bad = { ...base, tokens: [{ id: "tk1", at: "a" }] };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a token with an empty id", () => {
    const bad = { ...base, tokens: [{ id: "", at: "a", scope: "s1" }] };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a token parked nowhere", () => {
    const bad = { ...base, tokens: [{ id: "tk1", at: "", scope: "s1" }] };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a token with an empty scope", () => {
    const bad = { ...base, tokens: [{ id: "tk1", at: "a", scope: "" }] };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("pins the reserved outermost-scope id", () => {
    // Every other use compares it by symbol, so changing the value would leave those green while
    // cases persisted by one build stopped being readable by the next. Pinned HERE, in the package
    // that owns it: workflow-core resolves this package through its BUILT output, so a probe run
    // there measures the last build rather than this source.
    expect(ROOT_SCOPE).toBe("root");
  });

  it("rejects a scope entry for the implicit outermost scope", () => {
    // The one invariant E2 can actually encode: a fork run named `root` would be indistinguishable
    // from "this token never went through a fork".
    const bad = {
      ...base,
      tokens: [{ id: "tk1", at: "a", scope: ROOT_SCOPE }],
      scopes: { [ROOT_SCOPE]: { forkNode: "split", expected: 2, parent: null } },
    };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a scope expecting a fractional number of branches", () => {
    const bad = {
      ...base,
      tokens: [{ id: "tk1", at: "a", scope: "s1" }],
      scopes: { s1: { forkNode: "split", expected: 2.5, parent: null } },
    };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a scope with no parent key — absent must not blur into `null`", () => {
    // `null` means "outermost"; a missing key would mean the same thing by accident, and the two
    // would stop being distinguishable to whoever walks the scope tree.
    const bad = {
      ...base,
      tokens: [{ id: "tk1", at: "a", scope: "s1" }],
      scopes: { s1: { forkNode: "split", expected: 2 } },
    };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a scope naming no fork node", () => {
    const bad = {
      ...base,
      tokens: [{ id: "tk1", at: "a", scope: "s1" }],
      scopes: { s1: { forkNode: "", expected: 2, parent: null } },
    };
    expect(workflowInstanceSchema.safeParse(bad).success).toBe(false);
  });
});
