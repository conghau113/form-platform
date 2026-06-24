import { type AiProvider, runValidationLoop } from "@org/ai-core";
import { capabilityOf, type FieldNode, fieldNodeSchema } from "@org/form-schema";
import {
  buildPresetGenerationMessages,
  buildPresetRepairMessage,
  type GeneratePresetInput,
} from "./preset-prompt.js";

/**
 * P2 (Track B) — guaranteed-valid **preset** generation.
 *
 * A preset is authoring metadata, not form JSON: `{ name, fieldType, icon?, patch }`
 * where `patch` is the default props the builder merges into a freshly seeded node.
 * We never trust the model: its draft is proven by building a synthetic field of
 * `fieldType` from `patch` and parsing it against the contract (`fieldNodeSchema`).
 * On success the stored `patch` is re-derived from the *parsed* field, so it is
 * exactly the contract-clean subset; on failure the Zod errors are fed back for a
 * bounded number of repair rounds (same loop as form/workflow generation). No eval.
 */

/** Caller-assigned at save time (id + scope), so generation returns only the body. */
export interface PresetDraft {
  /** Human label for the preset (e.g. "Vietnam phone number"). */
  name: string;
  /** The schema field type this preset seeds. */
  fieldType: FieldNode["type"];
  /** Optional icon token resolved by the renderer registry (e.g. "antd:PhoneOutlined"). */
  icon?: string;
  /** Contract-clean default props merged into the seeded node. */
  patch: Record<string, unknown>;
}

export interface GeneratePresetSuccess {
  ok: true;
  preset: PresetDraft;
  /** Model calls it took (1 = valid on the first try). */
  attempts: number;
  raw: string;
}

export interface GeneratePresetFailure {
  ok: false;
  errors: string[];
  attempts: number;
  raw?: string;
}

export type GeneratePresetResult = GeneratePresetSuccess | GeneratePresetFailure;

export interface GeneratePresetOptions {
  /** Repair rounds AFTER the first attempt (default 3 ⇒ up to 4 model calls). */
  maxRepairs?: number;
  temperature?: number;
  maxTokens?: number;
}

// Keys that must never live inside a preset `patch`: instance identity + link metadata.
// (`type` is carried on the envelope; `name` is re-seeded per use; `presetId`/`overrides`
// are the W4 link record, which a *preset* must never embed.)
const PATCH_EXCLUDE = new Set(["type", "name", "presetId", "overrides"]);
/** Placeholder name used only to satisfy the contract while validating the patch. */
const VALIDATION_NAME = "preset_field";

/** Strip the instance-identity / link keys from a record (used both before and after parse). */
function stripPatchKeys(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (PATCH_EXCLUDE.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Validate a raw preset draft into a contract-clean {@link PresetDraft}, or structured
 * errors to repair against. The `patch` is proven by parsing a synthetic field built
 * from it; the accepted patch is re-derived from the parsed node so it carries only
 * contract-valid props (junk keys dropped, types checked).
 */
export function normalizePresetDraft(
  draft: unknown,
): { ok: true; value: PresetDraft } | { ok: false; errors: string[] } {
  if (!draft || typeof draft !== "object") {
    return { ok: false, errors: ["Response must be a JSON object."] };
  }
  const obj = draft as Record<string, unknown>;

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return { ok: false, errors: ['"name" is required and must be a non-empty string.'] };

  const fieldType = typeof obj.fieldType === "string" ? obj.fieldType.trim() : "";
  const cap = capabilityOf(fieldType as FieldNode["type"]);
  if (!cap) {
    return {
      ok: false,
      errors: [`"fieldType" must be a known field type, got ${JSON.stringify(obj.fieldType)}.`],
    };
  }
  if (cap.isContainer) {
    return {
      ok: false,
      errors: [`"fieldType" must be a leaf field; "${fieldType}" is a container and not allowed.`],
    };
  }

  if (!obj.patch || typeof obj.patch !== "object" || Array.isArray(obj.patch)) {
    return { ok: false, errors: ['"patch" is required and must be an object.'] };
  }
  const rawPatch = stripPatchKeys(obj.patch as Record<string, unknown>);

  // Prove the patch builds a valid field of this type. A placeholder name satisfies the
  // contract; the type comes from the envelope. Parsing strips unknown keys and checks
  // every known prop's type, so a coherent patch passes and a malformed one reports why.
  const candidate = { type: fieldType, name: VALIDATION_NAME, ...rawPatch };
  const parsed = fieldNodeSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }

  // Re-derive the patch from the parsed node → exactly the contract-clean subset.
  const patch = stripPatchKeys(parsed.data as unknown as Record<string, unknown>);

  const icon = typeof obj.icon === "string" && obj.icon.trim() ? obj.icon.trim() : undefined;
  return {
    ok: true,
    value: { name, fieldType: fieldType as FieldNode["type"], icon, patch },
  };
}

/** Generate a contract-valid reusable field preset from a natural-language prompt. */
export async function generatePreset(
  provider: AiProvider,
  input: GeneratePresetInput,
  options: GeneratePresetOptions = {},
): Promise<GeneratePresetResult> {
  const result = await runValidationLoop<PresetDraft>(
    provider,
    buildPresetGenerationMessages(input),
    normalizePresetDraft,
    {
      maxRepairs: options.maxRepairs,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      buildRepairMessage: buildPresetRepairMessage,
    },
  );
  return result.ok
    ? { ok: true, preset: result.value, attempts: result.attempts, raw: result.raw }
    : { ok: false, errors: result.errors, attempts: result.attempts, raw: result.raw };
}
