// Builder preset module (Track P): the preset system. P1 = data layer (schema, api client,
// built-in seed); P2 = gallery UI (PresetSection) + drag→canvas + "save field as preset".
export type { Preset } from "@org/form-schema";
export { ApplyPresetModal } from "./ApplyPresetModal";
// P2 (Track B) — AI preset generation + apply-across-project.
export { AiPresetModal, generatePreset, presetFromDraft } from "./ai";
export { appendLinkedField, collectFieldNames } from "./apply";
export { BUILTIN_PRESETS } from "./builtin";
export { deletePreset, listPresets, promotePreset, savePreset } from "./client";
export { API_BASE } from "./config";
// W4 linked-field helpers: derive overrides, build link/unlink patches + a render resolver.
export {
  computeOverrides,
  linkPatch,
  presetResolverFromList,
  UNLINK_PATCH,
} from "./link";
export { PresetSection } from "./PresetSection";
export { presetFromField, presetPatchFromField } from "./patch";
export { type ApplyPresetReport, useApplyPreset } from "./useApplyPreset";
export { type PresetStore, usePresets } from "./usePresets";
