// Cross-cutting editor state: the undo/redo history hook (a thin React shell over the pure
// `engine/history` module) plus the R3-extracted editor hooks that `App` composes — the document
// model (useFormEditor), keyboard shortcuts, form/theme persistence, and the navigation guard.
export { type History, type HistoryEntry, useHistory } from "./history";
export { useEditorShortcuts } from "./useEditorShortcuts";
export { type FormEditor, useFormEditor } from "./useFormEditor";
export { type FormPersistence, useFormPersistence } from "./useFormPersistence";
export { useNavigationGuard } from "./useNavigationGuard";
