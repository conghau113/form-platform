// Cross-cutting editor state. Currently the undo/redo history hook (a thin React shell over the
// pure `engine/history` module). R3 adds useFormEditor/useEditorShortcuts/useFormPersistence here.
export { type History, type HistoryEntry, useHistory } from "./history";
