import type { AiContent, AiImageContent, AiMessage } from "@org/ai-core";
import { formCapabilities } from "@org/form-schema";

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

Make the form complete and production-ready, not a bare skeleton:
- Mark fields the form clearly cannot do without as "required" (e.g. the primary name/email of a sign-up).
- Add a short, helpful "placeholder" where it aids input (email, phone, dates).
- Attach the standard validation when a field's meaning implies one: an email field uses { "type": "format", "format": "email" }; a phone/number-coded field uses a sensible pattern or min/max.
- Group related fields under layout/section containers and use a 2-column "layout" for naturally paired fields (first/last name, city/zip) when it reads better.
- LANGUAGE: detect the language of the user's request and write EVERY human-readable string — "title", every field "label", "placeholder", and option text — in that SAME language. Do not default to English when the request is in another language. Only "id" and field "name" stay lowercase ascii identifiers.

Do not invent unverifiable specifics: if you don't know a field's exact option list or copy, prefer a sensible minimal set over fabricated detail, and omit a property entirely rather than guessing a value you're unsure of.

Field type catalog:
`;

const VISION_BLOCK = `A REFERENCE IMAGE is attached. It is the PRIMARY source of truth — reproduce the form it shows as faithfully as possible; the text instruction is only secondary guidance, not a replacement for the image.
- Transcribe EVERY visible field, top to bottom, in the same order.
- Preserve each label's exact wording, in the image's own language.
- Map each visual control to the closest catalog "type": single-line box→text, multi-line box→textarea, dropdown→select, radio group→radio, checkboxes→checkbox-group, on/off→switch or checkbox, date picker→date, number spinner→number, file/upload→upload.
- Copy required markers: a field marked "*" or "(required)" gets "required": true.
- Copy placeholders/help text shown in the image.
- For every choice control (dropdown/radio/checkbox), transcribe its FULL visible option list into "options".
- Reproduce structure: section headings become layout/section containers; fields shown side by side become a multi-column "layout".
- Do not add fields that are not in the image, and do not drop fields that are.`;

interface SystemPromptOptions {
  hasImages?: boolean;
}

/** Build the system prompt embedding the live field catalog (+ vision rules when images are present). */
export function buildSystemPrompt(guidance?: string, opts: SystemPromptOptions = {}): string {
  let base = BASE_SYSTEM + capabilityLines();
  if (opts.hasImages) base = `${base}\n\n${VISION_BLOCK}`;
  return guidance ? `${base}\n\nAdditional guidance:\n${guidance}` : base;
}

function imageContent(image: AiImageInput): AiImageContent {
  return { type: "image", url: image.url, base64: image.base64, mediaType: image.mediaType };
}

/** Assemble the system + user messages for a form-generation request. */
export function buildFormGenerationMessages(input: GenerateFormInput): AiMessage[] {
  const hasImages = (input.images?.length ?? 0) > 0;
  const userContent: AiContent[] = [{ type: "text", text: input.prompt }];
  for (const image of input.images ?? []) userContent.push(imageContent(image));
  return [
    {
      role: "system",
      content: [{ type: "text", text: buildSystemPrompt(input.guidance, { hasImages }) }],
    },
    { role: "user", content: userContent },
  ];
}

/**
 * Messages for the first pass of the two-pass image strategy: ask the model to
 * read the reference image into a precise, plain-text form spec (NOT JSON). The
 * spec is then fed into the normal build pass as guidance — separating "see the
 * form" from "encode the contract" measurably improves fidelity on dense
 * screenshots, at the cost of an extra model call.
 */
export function buildImageTranscriptionMessages(input: GenerateFormInput): AiMessage[] {
  const system = `You are transcribing a form from a reference image into a precise specification. Do NOT write JSON or code. Produce a plain-text outline that another tool will turn into a schema.

For the whole form, give a short title. Then, for EVERY field visible in the image, top to bottom, list one line:
  <order>. label — control type — required? — placeholder/help (if any) — options: [a, b, c] (for choice controls)
Group fields under their section headings if the image has them, and note when fields appear side by side in columns. Use the image's own language for all labels and options. Transcribe only what is actually visible; do not invent fields.`;
  const userContent: AiContent[] = [
    { type: "text", text: input.prompt?.trim() || "Describe the form in this image." },
  ];
  for (const image of input.images ?? []) userContent.push(imageContent(image));
  return [
    { role: "system", content: [{ type: "text", text: system }] },
    { role: "user", content: userContent },
  ];
}

export interface RefineFormInput {
  /** The form being edited, as a JSON-serializable object. */
  currentForm: unknown;
  /** What to change, in natural language. */
  instruction: string;
  /** Optional reference images for the edit. */
  images?: AiImageInput[];
  /** Extra house-style guidance. */
  guidance?: string;
}

/**
 * Messages for a conversational refine: the model EDITS an existing form rather
 * than building from scratch. The current form is supplied as plain-text JSON
 * context (never eval'd); the model must apply only the requested change, keep
 * everything else intact, and keep field `name`s stable so saved data and any
 * linked presets/conditions still line up.
 */
export function buildRefineMessages(input: RefineFormInput): AiMessage[] {
  const hasImages = (input.images?.length ?? 0) > 0;
  const editRules = `You are EDITING an existing FormSchema, not creating a new one.
- Apply ONLY the change the user asks for; preserve every other field, its order, and its properties.
- Keep existing field "name" values UNCHANGED so saved data and references stay valid. Only add/remove/rename when the instruction requires it.
- Return the COMPLETE updated form as a single JSON object (same output rules as above).`;
  const base = buildSystemPrompt(input.guidance, { hasImages });
  const userContent: AiContent[] = [
    {
      type: "text",
      text: `Current form (JSON):\n${JSON.stringify(input.currentForm)}\n\nRequested change:\n${input.instruction}`,
    },
  ];
  for (const image of input.images ?? []) userContent.push(imageContent(image));
  return [
    { role: "system", content: [{ type: "text", text: `${base}\n\n${editRules}` }] },
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
