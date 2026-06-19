import { type Dispatch, type SetStateAction, useEffect } from "react";
import { type Clipboard, copyNodes, hasContent, pasteAfter, pasteInto } from "../engine/clipboard";
import { emptySelection, type SelectionState, selectMany } from "../engine/selection";
import { findNode, keyboardMove, remove, type TreeNode } from "../engine/tree";
import { describeNode, metaGuard } from "../field-registry";
import type { History } from "./history";

export interface EditorShortcutsArgs {
  history: History<TreeNode>;
  tree: TreeNode;
  selection: SelectionState;
  setSelection: Dispatch<SetStateAction<SelectionState>>;
  clipboard: Clipboard;
  setClipboard: Dispatch<SetStateAction<Clipboard>>;
}

/** Global canvas keyboard shortcuts, suppressed while typing in a real control
 *  (header/panel inputs). undo/redo · select-all · copy/paste (fresh uids + unique
 *  names) · keyboard reorder (↑/↓/Tab) · delete. Extracted from `App` in refactor R3;
 *  the effect's dependency set is preserved exactly so shortcuts never go stale. */
export function useEditorShortcuts({
  history,
  tree,
  selection,
  setSelection,
  clipboard,
  setClipboard,
}: EditorShortcutsArgs): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps preserved from the original App effect ([history, tree, selection, clipboard]); setSelection/setClipboard are stable setters.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (mod && ((key === "z" && e.shiftKey) || key === "y")) {
        e.preventDefault();
        history.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        setSelection(
          selectMany(
            emptySelection,
            tree.children.map((c) => c.uid),
          ),
        );
      } else if (mod && key === "c") {
        const clip = copyNodes(tree, selection);
        if (hasContent(clip)) setClipboard(clip);
      } else if (mod && key === "v") {
        if (!hasContent(clipboard)) return;
        e.preventDefault();
        // Paste after the last-selected node, or into the form root when nothing
        // (or the root itself — it has no "after") is selected.
        const anchor = selection.selected[selection.selected.length - 1];
        const next =
          anchor && anchor !== tree.uid
            ? pasteAfter(tree, anchor, clipboard, metaGuard())
            : pasteInto(tree, tree.uid, clipboard, metaGuard());
        if (next !== tree) history.set(next, "Paste");
      } else if (
        // D6 keyboard reorder: ↑/↓ swap with a sibling, Tab/Shift-Tab indent/outdent.
        // Acts on a single selected non-root node; the global listener covers both the
        // canvas and the outline tree (it fires unless focus is in a real input).
        (key === "arrowup" || key === "arrowdown" || key === "tab") &&
        selection.selected.length === 1 &&
        selection.selected[0] !== tree.uid
      ) {
        e.preventDefault();
        const uid = selection.selected[0];
        const dir =
          key === "arrowup" ? "up" : key === "arrowdown" ? "down" : e.shiftKey ? "out" : "in";
        const next = keyboardMove(tree, uid, dir, metaGuard());
        // The moved node keeps its uid, so the selection stays valid; only commit when
        // the move actually changed the tree (skips the no-op edges).
        if (next !== tree) history.set(next, "Move");
      } else if (key === "delete" || key === "backspace") {
        if (selection.selected.length === 0) return;
        e.preventDefault();
        let next = tree;
        for (const uid of selection.selected) {
          const node = findNode(next, uid);
          if (
            node &&
            node.node.type !== "form" &&
            describeNode(node.node.type).behavior.deletable
          ) {
            next = remove(next, uid);
          }
        }
        if (next !== tree) {
          history.set(next, "Delete");
          setSelection(emptySelection);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, tree, selection, clipboard]);
}
