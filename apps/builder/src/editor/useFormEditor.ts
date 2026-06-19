import { childrenOf, type FieldNode, type FormSchema, migrate } from "@org/form-schema";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import example from "../../../../examples/form.v1.json";
import { type Clipboard, emptyClipboard } from "../engine/clipboard";
import { emptySelection, pruneSelection, type SelectionState } from "../engine/selection";
import { schemaToTree, treeToField, treeToSchema } from "../engine/transform";
import { type FormProps, findNode, type TreeNode } from "../engine/tree";
import type { SelectedNode } from "../PropertyPanel";
import { type History, useHistory } from "./history";

/** Every named field reachable in the top-level value scope: layout containers are
 *  descended (their children hoist into the same values object), but `array.itemFields`
 *  are skipped — a row is its own value namespace. Drives reaction target candidates. */
function collectFieldNames(nodes: FieldNode[]): string[] {
  const out: string[] = [];
  const walk = (list: FieldNode[]): void => {
    for (const node of list) {
      if ("name" in node && node.name) out.push(node.name);
      if (node.type === "array") continue; // row-scoped subtree
      const kids = childrenOf(node);
      if (kids) walk(kids);
    }
  };
  walk(nodes);
  return out;
}

/** The editor's client-state model: the undo/redo document, the current selection and
 *  clipboard, plus every value derived from them (schema/json, the resolved selection,
 *  reaction candidates). Persistence (form/theme IO) and the navigation guard layer on top. */
export interface FormEditor {
  history: History<TreeNode>;
  tree: TreeNode;
  form: FormProps;
  selection: SelectionState;
  setSelection: Dispatch<SetStateAction<SelectionState>>;
  selectedUid: string | null;
  clipboard: Clipboard;
  setClipboard: Dispatch<SetStateAction<Clipboard>>;
  schema: FormSchema;
  json: string;
  /** True when the selected node is the form root (opens its own settings editor). */
  formSelected: boolean;
  /** The selected field resolved for the property panel, or null (root / nothing selected). */
  selected: SelectedNode | null;
  /** `visibleWhen` condition candidates: the top-level named fields. */
  siblingNames: string[];
  /** Reaction TARGET candidates: every named field in the top-level value scope. */
  fieldNames: string[];
  /** A valid JSON-editor edit replaces the tree as one history step. */
  applyJson: (next: FormSchema) => void;
  /** Replace the whole form (import / template / backend load): reset history + drop selection. */
  loadSchema: (next: FormSchema) => void;
}

/** Owns the designer document (history), selection and clipboard, and derives the schema/JSON,
 *  resolved selection and reaction candidates. Extracted from `App` in refactor R3 — pure
 *  client state, no network. */
export function useFormEditor(): FormEditor {
  const history = useHistory<TreeNode>(() => schemaToTree(migrate(example)));
  const tree = history.present;
  const form = tree.node as FormProps;
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const selectedUid = selection.selected[0] ?? null;
  const [clipboard, setClipboard] = useState<Clipboard>(emptyClipboard);

  // The schema is derived from the designer tree — the read-only JSON view and the
  // live preview both read this single boundary conversion.
  const schema = useMemo(() => treeToSchema(tree), [tree]);
  const json = useMemo(() => JSON.stringify(schema, null, 2), [schema]);

  // Drop selection highlights for nodes that no longer exist (after delete/undo/load).
  useEffect(() => setSelection((s) => pruneSelection(s, tree)), [tree]);

  // A valid JSON-editor edit replaces the tree as one history step.
  const applyJson = useCallback(
    (next: FormSchema) => history.set(schemaToTree(next), "Edit JSON"),
    [history.set],
  );

  // Replace the whole form (file import, template, backend load): reset history to
  // the new tree and drop any selection that referred to the old one.
  const loadSchema = useCallback(
    (next: FormSchema) => {
      history.reset(schemaToTree(next));
      setSelection(emptySelection);
    },
    [history.reset],
  );

  // The selected node, resolved to a schema field for the property panel. Selecting
  // the form root opens its own settings editor (id/title/layoutProps) instead.
  const selectedNode = selectedUid ? findNode(tree, selectedUid) : null;
  const formSelected = selectedNode?.node.type === "form";
  const selected: SelectedNode | null =
    selectedNode && !formSelected
      ? { uid: selectedNode.uid, field: treeToField(selectedNode) }
      : null;
  // visibleWhen condition candidates: the top-level named fields.
  const siblingNames = tree.children
    .map((c) => ("name" in c.node ? c.node.name : undefined))
    .filter((n): n is string => Boolean(n));
  // Reaction TARGET candidates: every named field reachable in the top-level value scope
  // (layout containers descended, array subtrees skipped — rows are a separate scope).
  const fieldNames = useMemo(() => collectFieldNames(schema.fields), [schema]);

  return {
    history,
    tree,
    form,
    selection,
    setSelection,
    selectedUid,
    clipboard,
    setClipboard,
    schema,
    json,
    formSelected,
    selected,
    siblingNames,
    fieldNames,
    applyJson,
    loadSchema,
  };
}
