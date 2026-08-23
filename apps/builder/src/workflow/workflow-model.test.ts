import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WorkflowDefinition, workflowDefinitionSchema } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { fromFlow, newEdge, toFlow } from "./workflow-model";

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
    expect(serialized).not.toContain("zIndex");
    expect(out).toEqual(def);
  });

  // The edge has to sit ABOVE the state cards or it vanishes where it crosses one (xyflow paints
  // the edge layer first and gives both a z-index of 0). It is presentation, so it rides on every
  // edge the editor makes — loaded and hand-drawn alike — and must never reach the contract.
  it("lifts every edge above the state cards without leaking into the contract", () => {
    const { edges } = toFlow(def);
    expect(edges).toHaveLength(1); // `every` on an empty array is vacuously true
    expect(edges.every((e) => e.zIndex === 1)).toBe(true);
    expect(newEdge("a", "b", "next").zIndex).toBe(1);
  });

  // The OTHER half of the same fix, and the half nothing else can see. Edge labels are rendered
  // into `.react-flow__edgelabel-renderer`, a separate layer that the per-edge `zIndex` above does
  // not touch — raising one without the other leaves every label buried, which is most of what the
  // reviewer actually complained about. That half is a CSS rule plus the `className` that scopes it,
  // and neither is reachable from a unit test: no test renders `WorkflowEditor`, and jsdom cannot
  // build an xyflow edge at all (see `floating-edge.tsx`). So pin the source text, the way
  // `apps/api/.../external-throttle.test.ts` pins its controller path — deleting either half must
  // go red rather than silently reopening the bug.
  it("keeps the edge-LABEL layer raised too, and keeps the class that scopes it", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "workflow-canvas.css"), "utf8");
    const editor = readFileSync(join(here, "WorkflowEditor.tsx"), "utf8");

    expect(css).toMatch(
      /\.workflow-canvas\s+\.react-flow__edgelabel-renderer\s*\{[^}]*z-index:\s*1\s*;/,
    );
    expect(editor).toContain('className="workflow-canvas"');

    // Lifting the edge lifts its 20px invisible hit band over the cards too; measured on the demo
    // workflow, that cost `leader_signed` 2 of its 4 connect handles. The hovered card has to win
    // back, or "Sắp xếp" produces a graph you cannot draw transitions on.
    expect(css).toMatch(
      /\.workflow-canvas\s+\.react-flow__node:hover\s*\{[^}]*z-index:\s*2\s*!important/,
    );
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

  // E1: same reason as i18n above — there is no defaultAssignee authoring UI yet, so opening a
  // workflow that has one and pressing Save must not delete it.
  it("carries a node's defaultAssignee through the round-trip", () => {
    const assigned: WorkflowDefinition = {
      ...def,
      nodes: [
        { ...def.nodes[0], defaultAssignee: { kind: "role", value: "manager" } },
        { ...def.nodes[1], defaultAssignee: { kind: "user", value: "u1" } },
      ],
    };
    const { meta, nodes, edges } = toFlow(assigned);
    expect(fromFlow(meta, nodes, edges)).toEqual(assigned);
  });

  // E2: same reason as i18n / defaultAssignee above — no gateway authoring UI until E6, so a
  // fork/join authored in JSON must survive a Save.
  it("carries a node's gateway through the round-trip", () => {
    const parallel: WorkflowDefinition = {
      ...def,
      nodes: [
        { ...def.nodes[0], gateway: "fork" },
        { ...def.nodes[1], gateway: "join" },
      ],
    };
    const { meta, nodes, edges } = toFlow(parallel);
    expect(fromFlow(meta, nodes, edges)).toEqual(parallel);
  });

  // A node carrying EVERY trailing optional (i18n, defaultAssignee, gateway) — the only shape that
  // can catch them being emitted in the wrong ORDER. Neither of the first two inputs has any
  // node-level optional key after `statusCode`, so on those a swapped order still serializes
  // identically. Each key added to the tail must be added here too, or the gate loses its teeth for
  // that key.
  const nodeWithTrailingOptionals: WorkflowDefinition = {
    ...def,
    nodes: [
      {
        ...def.nodes[0],
        i18n: { status: { vi: "Đã tạo" } },
        defaultAssignee: { kind: "role", value: "manager" },
        gateway: "fork",
      },
      def.nodes[1],
    ],
  };

  // The dirty check compares JSON.stringify(fromFlow(...)) against the Zod-parsed baseline, so the
  // round-trip must be BYTE-identical (key order included) — for defs with and without i18n.
  it("byte-matches the Zod-parsed baseline (no false-dirty)", () => {
    for (const input of [
      def,
      { ...def, defaultLocale: "en", i18n: { title: { vi: "QT" } } },
      nodeWithTrailingOptionals,
    ]) {
      const parsed = workflowDefinitionSchema.parse(input);
      const { meta, nodes, edges } = toFlow(parsed);
      expect(JSON.stringify(fromFlow(meta, nodes, edges))).toBe(JSON.stringify(parsed));
    }
  });
});
