import type { AiContent, AiMessage } from "@org/ai-core";
import { formCapabilities } from "@org/form-schema";

/**
 * P2 (Track B) — prompts for generating a single reusable **preset** (one field
 * template), as opposed to a whole form. A preset is `{ name, fieldType, icon?,
 * patch }`: a schema `fieldType` plus a `patch` of default props the builder merges
 * into a freshly seeded node. The model designs ONE field, richly (label, validation,
 * placeholder, i18n, icon) — the normalizer then proves the `patch` builds a
 * contract-valid field before it is trusted.
 */

export interface GeneratePresetInput {
  /** Natural-language description of the reusable field to design. */
  prompt: string;
  /** Optional hint constraining the field type (e.g. `"text"`, `"select"`). */
  fieldType?: string;
  /** Extra system guidance appended to the base instructions (e.g. house style). */
  guidance?: string;
}

/** One compact catalog line per LEAF node type (presets are single fields, never containers). */
function leafCapabilityLines(): string {
  return formCapabilities()
    .fields.filter((c) => !c.isContainer)
    .map((c) => `- ${c.type} (${c.category}, ${c.valueShape}): ${c.summary}`)
    .join("\n");
}

const BASE_SYSTEM = `You design ONE reusable form field ("preset") for a schema-driven form platform. Reply with a SINGLE JSON object describing the preset.

Output shape (output ONLY this object — no prose, no markdown code fences):
{
  "name": "<short human label for the preset, e.g. \\"Vietnam phone number\\">",
  "fieldType": "<one node type from the catalog below>",
  "icon": "<optional icon token, e.g. \\"antd:PhoneOutlined\\">",
  "patch": { <default props for a field of fieldType> }
}

Rules:
- "fieldType" MUST be one of the LEAF node types in the catalog below (no layout containers, no array).
- "patch" holds the field's authorable default props. It MUST include a human "label".
- Do NOT put "name", "type", "presetId" or "overrides" inside "patch" — the builder assigns a fresh field name and the type comes from "fieldType".
- Make the preset production-ready, not a bare skeleton:
  - Add the standard validation the field's meaning implies, under "validations" (an array). Each rule is { "type", "value"?, "format"?, "message"? }. An email field uses { "type": "format", "format": "email" } (named formats: email, url, phone, integer, number, money, idcard, zip). A regex check uses { "type": "pattern", "value": "<regex source string>", "message": "<why>" } — the regex goes in "value", NOT a "pattern" key. Length/number bounds use { "type": "min"|"max"|"len", "value": <number> }.
  - Add a helpful "placeholder" where it aids input.
  - For choice fields (select/radio/checkbox-group/cascader/tree-select) include a sensible "options" array of { "label", "value" } (or "treeOptions" for cascader/tree-select).
  - Mark "required": true only when the field is almost always mandatory wherever it is reused.
- Localize: write the "label", "placeholder", option text, and validation "message" in the SAME language as the request. Add an "i18n" map only if the request explicitly asks for multiple languages.
- Do not invent unverifiable specifics; omit a property rather than guessing a value you are unsure of.

Leaf field type catalog:
`;

/** Build the preset system prompt (catalog + optional fieldType constraint + guidance). */
export function buildPresetSystemPrompt(input: GeneratePresetInput): string {
  let base = BASE_SYSTEM + leafCapabilityLines();
  if (input.fieldType?.trim()) {
    base = `${base}\n\nThe preset MUST use fieldType "${input.fieldType.trim()}".`;
  }
  return input.guidance ? `${base}\n\nAdditional guidance:\n${input.guidance}` : base;
}

/** Assemble the system + user messages for a preset-generation request. */
export function buildPresetGenerationMessages(input: GeneratePresetInput): AiMessage[] {
  const userContent: AiContent[] = [{ type: "text", text: input.prompt }];
  return [
    { role: "system", content: [{ type: "text", text: buildPresetSystemPrompt(input) }] },
    { role: "user", content: userContent },
  ];
}

/** The repair message fed back after a failed preset validation round. */
export function buildPresetRepairMessage(errors: string[]): string {
  return [
    'The JSON you returned is not a valid preset. Fix these problems and return the COMPLETE corrected JSON object only (the { "name", "fieldType", "icon"?, "patch" } shape, no prose, no code fences):',
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}
