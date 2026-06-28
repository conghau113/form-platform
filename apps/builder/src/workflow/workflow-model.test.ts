import { type WorkflowDefinition, workflowDefinitionSchema } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { fromFlow, toFlow } from "./workflow-model";

const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "created",
  nodes: [
    { id: "created", status: "created", formId: "intake", position: { x: 0, y: 0 } },
    { id: "done", status: "done", position: { x: 260, y: 0 } },
  ],
  transitions: [
    {
      id: "t1",
      from: "created",
      to: "done",
      action: "approve",
      role: "manager",
      guard: { rule: { "==": [{ var: "ok" }, true] } },
    },
  ],
};

describe("workflow-model boundary", () => {
  it("round-trips a definition through xyflow and back", () => {
    const { meta, nodes, edges } = toFlow(def);
    const out = fromFlow(meta, nodes, edges);
    expect(out).toEqual(def);
  });

  it("marks the start node and binds form ids on the flow side", () => {
    const { nodes } = toFlow(def);
    const start = nodes.find((n) => n.id === "created");
    expect(start?.data.isStart).toBe(true);
    expect(start?.data.formId).toBe("intake");
    expect(nodes.find((n) => n.id === "done")?.data.isStart).toBe(false);
  });

  it("keeps xyflow-only fields out of the schema", () => {
    const { meta, nodes, edges } = toFlow(def);
    // Simulate xyflow decorating nodes/edges with runtime-only fields.
    const dirtyNodes = nodes.map((n) => ({
      ...n,
      selected: true,
      dragging: false,
      measured: { width: 10, height: 5 },
    }));
    const dirtyEdges = edges.map((e) => ({ ...e, selected: true }));
    const out = fromFlow(meta, dirtyNodes as typeof nodes, dirtyEdges as typeof edges);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("selected");
    expect(serialized).not.toContain("dragging");
    expect(serialized).not.toContain("measured");
    expect(out).toEqual(def);
  });

  // WF4b: the editor has no i18n authoring UI yet, so an AI/JSON-authored i18n must survive a
  // toFlow → fromFlow round-trip rather than being dropped on Save.
  it("carries i18n / defaultLocale / locales through the round-trip", () => {
    const localized: WorkflowDefinition = {
      ...def,
      defaultLocale: "en",
      locales: ["vi"],
      i18n: { title: { vi: "Quy trình" } },
      nodes: [{ ...def.nodes[0], i18n: { status: { vi: "Đã tạo" } } }, def.nodes[1]],
      transitions: [{ ...def.transitions[0], i18n: { action: { vi: "Duyệt" } } }],
    };
    const { meta, nodes, edges } = toFlow(localized);
    expect(fromFlow(meta, nodes, edges)).toEqual(localized);
  });

  // The dirty check compares JSON.stringify(fromFlow(...)) against the Zod-parsed baseline, so the
  // round-trip must be BYTE-identical (key order included) — for defs with and without i18n.
  it("byte-matches the Zod-parsed baseline (no false-dirty)", () => {
    for (const input of [def, { ...def, defaultLocale: "en", i18n: { title: { vi: "QT" } } }]) {
      const parsed = workflowDefinitionSchema.parse(input);
      const { meta, nodes, edges } = toFlow(parsed);
      expect(JSON.stringify(fromFlow(meta, nodes, edges))).toBe(JSON.stringify(parsed));
    }
  });
});
