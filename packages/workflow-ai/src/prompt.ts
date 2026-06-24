import type { AiMessage } from "@org/ai-core";
import { workflowCapabilities } from "@org/workflow-schema";

/**
 * Prompt construction for workflow generation. The system prompt embeds the live
 * primitive catalog from `workflowCapabilities()` so the model authors against
 * the actual contract (and stays in sync as it evolves) without ever seeing Zod.
 */

export interface GenerateWorkflowInput {
  /** Natural-language description of the process to model. */
  prompt: string;
  /** Extra system guidance appended to the base instructions (e.g. house style). */
  guidance?: string;
}

export interface RefineWorkflowInput {
  /** The workflow being edited, as a JSON-serializable object. */
  currentWorkflow: unknown;
  /** What to change, in natural language. */
  instruction: string;
  /** Extra house-style guidance. */
  guidance?: string;
}

/** Render the primitive catalog + definition shape as compact prompt text. */
function capabilityBlock(): string {
  const cap = workflowCapabilities();
  const primitives = cap.primitives
    .map((p) => {
      const optional = p.optional.length > 0 ? `; optional: ${p.optional.join(", ")}` : "";
      return `- ${p.kind} (required: ${p.required.join(", ")}${optional}): ${p.summary}`;
    })
    .join("\n");
  return `Definition keys: ${cap.definition.required.join(", ")} (you author every key EXCEPT "workflowVersion", which the platform stamps automatically — do not emit it).\n${cap.definition.notes}\n\nBuilding blocks:\n${primitives}`;
}

const BASE_SYSTEM = `You design state-machine workflows for a schema-driven platform. Reply with a SINGLE JSON object that is a valid WorkflowDefinition.

Rules:
- Output ONLY the JSON object. No prose, no explanation, no markdown code fences.
- Do NOT include "workflowVersion"; it is stamped automatically.
- Provide a string "id" (kebab-case) and a human "title".
- "nodes" is an array of states. Every node needs a unique "id" and a human "status" label. Bind a form to a state with "formId" when that state collects input.
- "start" MUST be the "id" of one of the nodes — the entry state.
- "transitions" is an array of directed edges. Every transition needs a unique "id", a "from" and "to" that are existing node ids, and an "action" (the event that fires it).
- Build a CONNECTED graph: every node must be reachable from "start" via transitions. No orphan states; model the real path to every terminal state.
- A "guard" is a JSONLogic object ({ "rule": { ... } }), and "role" is a string — never write code or expressions as plain strings.
- LANGUAGE: detect the language of the user's request and write EVERY human-readable string — the "title", every node "status", and every transition "action" — in that SAME language. Do not default to English when the request is in another language. Only the "id" fields stay short lowercase ascii identifiers.

Model the process completely: include the approval/rejection branches, not just the happy path, and give terminal states (approved, rejected, cancelled) where the process ends.

`;

/** Build the system prompt embedding the live primitive catalog. */
export function buildWorkflowSystemPrompt(guidance?: string): string {
  const base = BASE_SYSTEM + capabilityBlock();
  return guidance ? `${base}\n\nAdditional guidance:\n${guidance}` : base;
}

/** Assemble the system + user messages for a workflow-generation request. */
export function buildWorkflowGenerationMessages(input: GenerateWorkflowInput): AiMessage[] {
  return [
    {
      role: "system",
      content: [{ type: "text", text: buildWorkflowSystemPrompt(input.guidance) }],
    },
    { role: "user", content: [{ type: "text", text: input.prompt }] },
  ];
}

/**
 * Messages for a conversational refine: the model EDITS an existing workflow
 * rather than building from scratch. The current definition is supplied as
 * plain-text JSON context (never eval'd); the model must apply only the requested
 * change and keep node/transition `id`s stable so bindings and history stay valid.
 */
export function buildWorkflowRefineMessages(input: RefineWorkflowInput): AiMessage[] {
  const editRules = `You are EDITING an existing WorkflowDefinition, not creating a new one.
- Apply ONLY the change the user asks for; preserve every other node, transition, and property.
- Keep existing "id" values UNCHANGED so form bindings and instance history stay valid. Only add/remove/rename when the instruction requires it.
- Keep the graph connected (every node reachable from "start") after your edit.
- Return the COMPLETE updated workflow as a single JSON object (same output rules as above).`;
  const base = buildWorkflowSystemPrompt(input.guidance);
  return [
    { role: "system", content: [{ type: "text", text: `${base}\n\n${editRules}` }] },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Current workflow (JSON):\n${JSON.stringify(input.currentWorkflow)}\n\nRequested change:\n${input.instruction}`,
        },
      ],
    },
  ];
}

/** The repair message fed back to the model after a failed validation round
 *  (covers both Zod shape errors and graph-structure errors). */
export function buildWorkflowRepairMessage(errors: string[]): string {
  return [
    "The JSON you returned is not a valid WorkflowDefinition (it failed schema or graph checks). Fix these problems and return the COMPLETE corrected JSON object only (no prose, no code fences):",
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}
