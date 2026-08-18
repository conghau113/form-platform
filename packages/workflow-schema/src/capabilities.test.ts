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

  it("tells an authoring agent not to emit `gateway`, and says why that is still true after E3a", () => {
    // `summary` is rendered verbatim into the workflow-authoring system prompt (workflow-ai's
    // `prompt.ts`), so these sentences are the only thing stopping a generated workflow from using a
    // gateway nothing checks. The key-set check above cannot see prose: without this, deleting the
    // instruction leaves the whole repo green.
    expect(byKind.node.summary).toContain("do NOT emit it");
    // The ADVICE alone is not enough to pin. Before E3a the reason given was "the engine does not act
    // on it yet"; E3a made that false while leaving the advice word-for-word intact, so a gate that
    // only checked the advice would have stayed green over a sentence that had become a lie. Pin the
    // REASON verbatim, and retire this line only when the reason itself stops being true (E4 adds the
    // static rules; E6 adds the editor).
    expect(byKind.node.summary).toContain(
      "the engine now executes forks and joins, but nothing validates them yet",
    );
  });

  it("workflowCapabilities() reports the current version", () => {
    const payload = workflowCapabilities();
    expect(payload.workflowVersion).toBe(CURRENT_WORKFLOW_VERSION);
    expect(payload.primitives).toBe(WORKFLOW_PRIMITIVES);
  });
});
