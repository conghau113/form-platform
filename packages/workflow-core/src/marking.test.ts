import type { WorkflowInstance } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { LEGACY_TOKEN_ID, ROOT_SCOPE, readMarking } from "./marking.js";

const legacy: WorkflowInstance = {
  id: "case-1",
  definitionId: "wf",
  definitionVersion: 1,
  current: "review",
  data: {},
  history: [],
};

/** A case standing in two branches of one fork run. */
const forked: WorkflowInstance = {
  ...legacy,
  current: "review_a",
  tokens: [
    { id: "tk1", at: "review_a", scope: "s1" },
    { id: "tk2", at: "review_b", scope: "s1" },
  ],
  scopes: { s1: { forkNode: "split", expected: 2, parent: null } },
};

describe("readMarking", () => {
  it("reports one token at `current` for a case written before tokens existed", () => {
    const marking = readMarking(legacy);
    expect(marking.tokens).toEqual([{ id: LEGACY_TOKEN_ID, at: "review", scope: ROOT_SCOPE }]);
    expect(marking.scopes).toEqual({});
  });

  it("reports the stored marking when the case has one", () => {
    const marking = readMarking(forked);
    expect(marking.tokens).toEqual(forked.tokens);
    expect(marking.scopes).toEqual(forked.scopes);
  });

  it("passes through two tokens sitting on the SAME node without collapsing them", () => {
    // Names the guarantee this function actually gives: it does not dedupe. That is the case token
    // identity exists for — keying a marking by node id would merge these two and lose a branch —
    // but the merging would happen in a caller, not here.
    const together: WorkflowInstance = {
      ...forked,
      tokens: [
        { id: "tk1", at: "review", scope: "s1" },
        { id: "tk2", at: "review", scope: "s1" },
      ],
    };
    expect(readMarking(together).tokens.map((t) => t.id)).toEqual(["tk1", "tk2"]);
  });

  it("reports an empty marking as EMPTY — it never falls back to `current`", () => {
    // `tokens: []` is out of contract and can only come from a marking-aware writer that dropped a
    // token. Reading `current` here would dress that loss up as a healthy single-token case.
    const emptied: WorkflowInstance = { ...forked, tokens: [] };
    expect(readMarking(emptied).tokens).toEqual([]);
  });

  it("answers `undefined` for a root-level token's scope even when other scopes exist", () => {
    // Deliberately NOT the legacy case: there `scopes` is `{}`, so every lookup is `undefined` and
    // the assertion would hold no matter what the sentinel was or where it was looked up. The risk
    // lives here — a populated map, one token inside a fork run and one still at the outermost
    // level, where a caller doing `scopes[t.scope].expected` crashes on the second token.
    const mixed: WorkflowInstance = {
      ...forked,
      tokens: [
        { id: "tk1", at: "review_a", scope: "s1" },
        { id: "tk2", at: "waiting", scope: ROOT_SCOPE },
      ],
    };
    const marking = readMarking(mixed);
    expect(marking.scopes[marking.tokens[0].scope]).toEqual({
      forkNode: "split",
      expected: 2,
      parent: null,
    });
    expect(marking.scopes[marking.tokens[1].scope]).toBeUndefined();
  });

  it("pins the sentinels, which are cross-package contract values", () => {
    // Both are compared by symbol everywhere else, so changing either value would leave every other
    // assertion green — while a case persisted by one build became unreadable by the next.
    expect(ROOT_SCOPE).toBe("root");
    expect(LEGACY_TOKEN_ID).toBe("legacy-token");
    expect(LEGACY_TOKEN_ID).not.toBe(ROOT_SCOPE);
  });

  it("drops scopes stored on a case that has no tokens", () => {
    // The synthesized token belongs to none of those runs and a Marking cannot hold an orphan
    // scope — not a claim that no fork ran, which this reader has no way to know. Pinned because
    // the branch ignores stored data, and that should be a decision rather than an accident.
    const strays: WorkflowInstance = {
      ...legacy,
      scopes: { s1: { forkNode: "split", expected: 2, parent: null } },
    };
    expect(readMarking(strays).scopes).toEqual({});
  });

  it("reports an empty scope map when the case has tokens but no fork ran", () => {
    const noScopes: WorkflowInstance = {
      ...legacy,
      tokens: [{ id: "tk1", at: "review", scope: ROOT_SCOPE }],
    };
    expect(readMarking(noScopes).scopes).toEqual({});
  });

  it("is pure: same input twice, same answer, input untouched", () => {
    const before = structuredClone(forked);
    const first = readMarking(forked);
    const second = readMarking(forked);
    expect(first).toEqual(second);
    expect(forked).toEqual(before);
  });

  it("hands back copies, so writing to the marking cannot reach the stored case", () => {
    // An engine's whole job is to push onto and edit this marking. Returning the instance's own
    // arrays would make that edit the persisted case as a side effect — with every assertion above
    // still green.
    const marking = readMarking(forked);
    expect(marking.tokens).not.toBe(forked.tokens);
    marking.tokens.push({ id: "tk3", at: "elsewhere", scope: "s1" });
    marking.tokens[0].at = "moved";
    const scope = marking.scopes.s1;
    if (scope) scope.expected = 99;

    expect(forked.tokens).toHaveLength(2);
    expect(forked.tokens?.[0].at).toBe("review_a");
    expect(forked.scopes?.s1.expected).toBe(2);
  });
});
