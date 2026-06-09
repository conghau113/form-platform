import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CURRENT_WORKFLOW_VERSION, migrateWorkflow } from "./index.js";

describe("migrateWorkflow", () => {
  it("migrates the saved examples/workflow.v1.json fixture up to the current version", () => {
    // The fixture lives at the repo root; resolve it relative to this test file
    // so the "NEVER break older saved JSON" guarantee is exercised against the
    // real persisted definition, not an inline copy.
    const url = new URL("../../../examples/workflow.v1.json", import.meta.url);
    const doc = JSON.parse(readFileSync(url, "utf8"));

    const out = migrateWorkflow(doc);

    // A successful return already means workflowDefinitionSchema.parse() validated it.
    expect(out.workflowVersion).toBe(CURRENT_WORKFLOW_VERSION);
    expect(out.start).toBe("created");
    expect(out.nodes.map((n) => n.status)).toEqual(["created", "inprogress", "done"]);
    expect(out.transitions[1].guard).toBeDefined();
  });

  it("rejects a document missing a numeric workflowVersion", () => {
    expect(() =>
      migrateWorkflow({ id: "x", title: "x", start: "a", nodes: [], transitions: [] }),
    ).toThrow();
  });

  it("rejects a document newer than this build supports", () => {
    expect(() =>
      migrateWorkflow({
        workflowVersion: 999,
        id: "x",
        title: "x",
        start: "a",
        nodes: [],
        transitions: [],
      }),
    ).toThrow();
  });
});
