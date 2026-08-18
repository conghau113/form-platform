import { describe, expect, it } from "vitest";
import type { ZodObject, ZodRawShape } from "zod";
import {
  WORKFLOW_DEFINITION_SHAPE,
  WORKFLOW_PRIMITIVES,
  type WorkflowPrimitiveKind,
  workflowCapabilities,
} from "./capabilities.js";
import {
  CURRENT_WORKFLOW_VERSION,
  guardSchema,
  workflowDefinitionSchema,
  workflowNodeSchema,
  workflowTransitionSchema,
} from "./schema.js";

/** Split a ZodObject's keys into required/optional so the catalog can't drift. */
function keysOf(schema: ZodObject<ZodRawShape>): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];
  for (const [key, value] of Object.entries(schema.shape)) {
    (value.isOptional() ? optional : required).push(key);
  }
  return { required: required.sort(), optional: optional.sort() };
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe("workflow primitive catalog", () => {
  const byKind = Object.fromEntries(WORKFLOW_PRIMITIVES.map((p) => [p.kind, p]));

  it("node/transition/guard keys match the contract (no drift)", () => {
    const cases: [WorkflowPrimitiveKind, ZodObject<ZodRawShape>][] = [
      ["node", workflowNodeSchema],
      ["transition", workflowTransitionSchema],
      ["guard", guardSchema],
    ];
    for (const [kind, schema] of cases) {
      const cap = byKind[kind];
      expect(cap, kind).toBeDefined();
      const { required, optional } = keysOf(schema);
      expect(sorted(cap.required), `${kind}.required`).toEqual(required);
      expect(sorted(cap.optional), `${kind}.optional`).toEqual(optional);
    }
  });

  it("definition shape matches the contract", () => {
    const { required, optional } = keysOf(workflowDefinitionSchema);
    expect(sorted(WORKFLOW_DEFINITION_SHAPE.required)).toEqual(required);
    expect(sorted(WORKFLOW_DEFINITION_SHAPE.optional)).toEqual(optional);
  });

  it("tells an authoring agent not to emit `gateway` while the engine ignores it", () => {
    // `summary` is rendered verbatim into the workflow-authoring system prompt (workflow-ai's
    // `prompt.ts`), so this sentence is the only thing stopping a generated workflow from claiming a
    // concurrency nothing executes. The key-set check above cannot see prose: without this, deleting
    // the instruction leaves the whole repo green. Remove it only together with engine support.
    expect(byKind.node.summary).toContain("do NOT emit it");
  });

  it("workflowCapabilities() reports the current version", () => {
    const payload = workflowCapabilities();
    expect(payload.workflowVersion).toBe(CURRENT_WORKFLOW_VERSION);
    expect(payload.primitives).toBe(WORKFLOW_PRIMITIVES);
  });
});
