// Builder preset module (Track P / P1): the data layer for the preset system. The gallery
// UI and drag→canvas wiring arrive in P2.
export type { Preset } from "@org/form-schema";
export { BUILTIN_PRESETS } from "./builtin";
export { deletePreset, listPresets, savePreset } from "./client";
export { API_BASE } from "./config";
