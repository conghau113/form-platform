import { formCapabilities } from "@org/form-schema";
import type { AiContent, AiImageContent, AiMessage } from "./provider.js";

/** A reference image for vision models (screenshot, photo of a paper form…). */
export interface AiImageInput {
  url?: string;
  base64?: string;
  mediaType?: string;
}

export interface GenerateFormInput {
  /** Natural-language description of the form to build. */
  prompt: string;
  /** Optional reference images interpreted by vision-capable providers. */
  images?: AiImageInput[];
  /** Extra system guidance appended to the base instructions (e.g. house style). */
  guidance?: string;
}

/** One compact catalog line per supported node type, derived from the contract. */
function capabilityLines(): string {
  return formCapabilities()
    .fields.map((c) => `- ${c.type} (${c.category}, ${c.valueShape}): ${c.summary}`)
    .join("\n");
}

const BASE_SYSTEM = `You build forms for a schema-driven form platform. Reply with a SINGLE JSON object that is a valid FormSchema for this platform.

Rules:
- Output ONLY the JSON object. No prose, no explanation, no markdown code fences.
- Do NOT include "formVersion"; it is stamped automatically.
- Provide a string "id" (kebab-case) and a human "title".
- "fields" is an array of nodes. Every data field needs a unique snake_case "name" and a human "label".
- Use ONLY the node "type" values from the catalog below. Layout containers nest children under "children"; the "array" type nests row fields under "itemFields".
- Nodes with options (select/radio/checkbox-group/cascader/tree-select) need an "options" array of { "label", "value" }.
- Do not invent properties. Omit anything you are unsure about rather than guessing.

Field type catalog:
`;

/** Build the system prompt embedding the live field catalog. */
export function buildSystemPrompt(guidance?: string): string {
  const base = BASE_SYSTEM + capabilityLines();
  return guidance ? `${base}\n\nAdditional guidance:\n${guidance}` : base;
}

function imageContent(image: AiImageInput): AiImageContent {
  return { type: "image", url: image.url, base64: image.base64, mediaType: image.mediaType };
}

/** Assemble the system + user messages for a form-generation request. */
export function buildFormGenerationMessages(input: GenerateFormInput): AiMessage[] {
  const userContent: AiContent[] = [{ type: "text", text: input.prompt }];
  for (const image of input.images ?? []) userContent.push(imageContent(image));
  return [
    { role: "system", content: [{ type: "text", text: buildSystemPrompt(input.guidance) }] },
    { role: "user", content: userContent },
  ];
}

/** The repair message fed back to the model after a failed validation round. */
export function buildRepairMessage(errors: string[]): string {
  return [
    "The JSON you returned is not a valid FormSchema. Fix these problems and return the COMPLETE corrected JSON object only (no prose, no code fences):",
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}
