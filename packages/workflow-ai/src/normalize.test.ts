import { describe, expect, it } from "vitest";
import { normalizeWorkflowDraft } from "./normalize.js";

/** A minimal graph-valid definition (no version — the normalizer stamps it). */
const validDraft = {
  id: "leave",
  title: "Leave",
  start: "draft",
  nodes: [
    { id: "draft", status: "Draft" },
    { id: "approved", status: "Approved" },
  ],
  transitions: [{ id: "submit", from: "draft", to: "approved", action: "submit" }],
};

describe("normalizeWorkflowDraft", () => {
  it("stamps the current workflowVersion and accepts a graph-valid draft", () => {
    const result = normalizeWorkflowDraft(validDraft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workflowVersion).toBe(1);
    expect(result.value.nodes).toHaveLength(2);
  });

  it("reports Zod errors for a shape-invalid draft", () => {
    // Missing required `title`.
    const result = normalizeWorkflowDraft({
      id: "x",
      start: "a",
      nodes: [{ id: "a", status: "A" }],
      transitions: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("reports a graph error when a node is unreachable from start", () => {
    const result = normalizeWorkflowDraft({
      id: "x",
      title: "X",
      start: "a",
      nodes: [
        { id: "a", status: "A" },
        { id: "b", status: "B" },
      ],
      transitions: [], // b can never be reached
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.toLowerCase().includes("reachable"))).toBe(true);
  });

  it("reports a graph error when start names a missing node", () => {
    const result = normalizeWorkflowDraft({
      id: "x",
      title: "X",
      start: "nope",
      nodes: [{ id: "a", status: "A" }],
      transitions: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.toLowerCase().includes("start"))).toBe(true);
  });

  it("reports a graph error for a transition referencing a missing node", () => {
    const result = normalizeWorkflowDraft({
      id: "x",
      title: "X",
      start: "a",
      nodes: [{ id: "a", status: "A" }],
      transitions: [{ id: "t", from: "a", to: "ghost", action: "go" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
