// Builder preset module (Track P): the preset system. P1 = data layer (schema, api client,
// built-in seed); P2 = gallery UI (PresetSection) + drag→canvas + "save field as preset".
export type { Preset } from "@org/form-schema";
export { BUILTIN_PRESETS } from "./builtin";
export { deletePreset, listPresets, savePreset } from "./client";
export { API_BASE } from "./config";
export { PresetSection } from "./PresetSection";
export { presetFromField, presetPatchFromField } from "./patch";
export { type PresetStore, usePresets } from "./usePresets";
