import type { PresetDraft } from "@org/form-ai";
import {
  CURRENT_FORM_VERSION,
  type FormSchema,
  migrate,
  type Preset,
  type PresetScope,
} from "@org/form-schema";

/**
 * draft.ts — turn an AI-generated {@link PresetDraft} into the builder's domain
 * objects. The draft is the contract-clean body (`{ name, fieldType, icon?, patch }`)
 * the server guarantees; here we assign the client-side id + scope to make a saveable
 * {@link Preset}, and build a one-field form so the modal can render a live preview.
 * Pure — no fetch, no side effects.
 */

/** Build a saveable user preset from a generated draft (id minted per save, like
 *  `presetFromField`). `scope` defaults to global; pass `{ scope: "project", projectId }`. */
export function presetFromDraft(
  draft: PresetDraft,
  scope?: { scope: PresetScope; projectId?: string },
): Preset {
  const patchIcon =
    typeof draft.patch.prefixIcon === "string"
      ? draft.patch.prefixIcon
      : typeof draft.patch.suffixIcon === "string"
        ? draft.patch.suffixIcon
        : undefined;
  return {
    id: `user-${crypto.randomUUID()}`,
    fieldType: draft.fieldType,
    name: draft.name.trim() || "Untitled preset",
    icon: draft.icon ?? patchIcon,
    patch: draft.patch,
    ...(scope ?? {}),
  };
}

/** A one-field form rendering the draft, for the modal's live preview. Runs through
 *  `migrate` so it is a fully-stamped, contract-valid {@link FormSchema}. */
export function previewFormFromDraft(draft: PresetDraft): FormSchema {
  return migrate({
    formVersion: CURRENT_FORM_VERSION,
    id: "preset-preview",
    title: draft.name,
    fields: [{ type: draft.fieldType, name: "preset_preview", ...draft.patch }],
  });
}
