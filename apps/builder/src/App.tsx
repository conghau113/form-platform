import { type FormSchema, migrate } from "@org/form-schema";
import { DEFAULT_TOKENS, type DesignTokens, migrateTheme, toAntdTheme } from "@org/form-theme";
import { Button, message, Segmented, Space, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import example from "../../../examples/form.v1.json";
import { DesignerProvider, type DesignerValue } from "./DesignCanvas";
import {
  type Clipboard,
  copyNodes,
  emptyClipboard,
  hasContent,
  pasteAfter,
  pasteInto,
} from "./engine/clipboard";
import {
  emptySelection,
  pruneSelection,
  type SelectionState,
  select,
  selectMany,
  toggle,
} from "./engine/selection";
import {
  applyFieldEdit,
  fieldToTree,
  schemaToTree,
  treeToField,
  treeToSchema,
} from "./engine/transform";
import {
  clone,
  collectNames,
  type FormProps,
  findNode,
  insertAfter,
  patchNode,
  remove,
  type TreeNode,
} from "./engine/tree";
import { describeNode, metaGuard, newField } from "./field-registry";
import { useHistory } from "./history";
import { PropertyPanel, type SelectedNode } from "./PropertyPanel";
import { useDragon } from "./useDragon";
import { WorkflowEditor } from "./WorkflowEditor";
import { CompositePanel } from "./workbench/CompositePanel";
import { HoverProvider } from "./workbench/hover";
import { oneOf, usePersistentState } from "./workbench/persist";
import { SettingsPanel } from "./workbench/SettingsPanel";
import { type Device, ToolbarPanel, type ViewMode } from "./workbench/ToolbarPanel";
import { ViewPanel } from "./workbench/ViewPanel";

const API = "http://localhost:3001";

/** Canvas/preview content width per simulated device. */
const VIEWPORTS = { Desktop: 1280, Tablet: 768, Mobile: 375 } as const;

export function App() {
  const history = useHistory<TreeNode>(() => schemaToTree(migrate(example)));
  const tree = history.present;
  const form = tree.node as FormProps;
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const selectedUid = selection.selected[0] ?? null;
  const [device, setDevice] = usePersistentState<Device>(
    "device",
    "Desktop",
    oneOf("Desktop", "Tablet", "Mobile"),
  );
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    "viewMode",
    "design",
    oneOf("design", "json", "preview"),
  );
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);
  const [mode, setMode] = useState<"form" | "workflow">("form");
  const [clipboard, setClipboard] = useState<Clipboard>(emptyClipboard);

  // The neutral design tokens are mapped to an antd ThemeConfig that wraps the
  // preview, so editing a token re-themes the rendered form live.
  const antdTheme = useMemo(() => toAntdTheme(tokens), [tokens]);

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

  // Canvas shortcuts, suppressed while typing in a real control (header/panel inputs).
  // undo/redo · select-all · copy/paste (fresh uids + unique names) · delete.
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

  // Pointer drag engine: palette "create" drags and on-canvas "move" drags both
  // commit a single tree op and select the result. A press that doesn't drag selects.
  const dragon = useDragon({
    getTree: () => tree,
    guard: metaGuard(),
    createNode: (type, taken) => fieldToTree(newField(type, taken)),
    commit: (next, dropped) => {
      history.set(next, "Drop field");
      setSelection(selectMany(emptySelection, dropped));
    },
    onClickSelect: (uids, additive) =>
      setSelection((s) => (additive ? toggle(s, uids[0]) : select(emptySelection, uids[0]))),
  });

  function onRemove(uid: string) {
    const node = findNode(tree, uid);
    if (!node || node.node.type === "form" || !describeNode(node.node.type).behavior.deletable) {
      return;
    }
    history.set(remove(tree, uid), "Delete");
    if (selectedUid === uid) setSelection(emptySelection);
  }

  // Duplicate a node in place (right after itself), with fresh uids + unique names.
  function onCopy(uid: string) {
    const node = findNode(tree, uid);
    if (!node || node.node.type === "form" || !describeNode(node.node.type).behavior.cloneable) {
      return;
    }
    const dup = clone(node, collectNames(tree));
    const next = insertAfter(tree, uid, dup, metaGuard());
    if (next !== tree) {
      history.set(next, "Duplicate");
      setSelection(select(emptySelection, dup.uid));
    }
  }

  const designer: DesignerValue = {
    selected: selection.selected,
    drag: dragon.drag,
    beginMove: dragon.beginMove,
    beginCreate: dragon.beginCreate,
    copy: onCopy,
    remove: onRemove,
    select: (uid, additive) =>
      setSelection((s) => (additive ? toggle(s, uid) : select(emptySelection, uid))),
    // A press on empty canvas selects the Form root, surfacing its settings.
    clearSelection: () => setSelection(select(emptySelection, tree.uid)),
  };

  async function onSave() {
    try {
      const res = await fetch(`${API}/forms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(`Save failed: ${data.message ?? res.statusText}`);
        return;
      }
      // Persist the theme alongside the form under the same id.
      const themeRes = await fetch(`${API}/themes/${encodeURIComponent(data.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tokens),
      });
      if (!themeRes.ok) {
        const themeData = await themeRes.json().catch(() => ({}));
        message.error(`Theme save failed: ${themeData.message ?? themeRes.statusText}`);
        return;
      }
      message.success(`Saved "${data.id}" (form + theme)`);
    } catch (e) {
      message.error(`Save failed: ${(e as Error).message}`);
    }
  }

  async function onLoad(id: string = form.id) {
    try {
      const res = await fetch(`${API}/forms/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(`Load failed: ${data.message ?? res.statusText}`);
        return;
      }
      history.reset(schemaToTree(migrate(data)));
      setSelection(emptySelection);
      // Reapply the saved theme if one exists; a missing theme is not an error.
      const themeRes = await fetch(`${API}/themes/${encodeURIComponent(data.id)}`);
      setTokens(themeRes.ok ? migrateTheme(await themeRes.json()) : DEFAULT_TOKENS);
      message.success(`Loaded "${data.id}"`);
    } catch (e) {
      message.error(`Load failed: ${(e as Error).message}`);
    }
  }

  // A workflow node "opens the existing form builder to bind its form": switch to
  // form mode and load that form id from the API.
  function onEditForm(formId: string) {
    setMode("form");
    void onLoad(formId);
  }

  function onExportTheme() {
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.id || "theme"}.theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DesignerProvider value={designer}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <Typography.Title level={4} style={{ margin: 0, whiteSpace: "nowrap" }}>
            Builder
          </Typography.Title>
          <Segmented
            options={["form", "workflow"]}
            value={mode}
            onChange={(v) => setMode(v as "form" | "workflow")}
          />
          {mode === "form" && (
            <Space style={{ marginLeft: "auto" }}>
              <Button type="primary" onClick={onSave}>
                Save
              </Button>
              <Button onClick={() => onLoad()}>Load</Button>
            </Space>
          )}
        </header>

        {mode === "workflow" ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <WorkflowEditor onEditForm={onEditForm} />
          </div>
        ) : (
          <HoverProvider>
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              <aside
                style={{
                  width: 260,
                  borderRight: "1px solid rgba(0,0,0,0.08)",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <CompositePanel
                  tree={tree}
                  history={{
                    entries: history.entries,
                    index: history.index,
                    jumpTo: history.jumpTo,
                  }}
                  tokens={tokens}
                  onChangeTokens={setTokens}
                  onExportTheme={onExportTheme}
                />
              </aside>

              <section
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minWidth: 0,
                  borderRight: "1px solid rgba(0,0,0,0.08)",
                  minHeight: 0,
                }}
              >
                <ToolbarPanel
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  onUndo={history.undo}
                  onRedo={history.redo}
                  device={device}
                  onDevice={setDevice}
                  viewMode={viewMode}
                  onViewMode={setViewMode}
                />
                <ViewPanel
                  mode={viewMode}
                  schema={schema}
                  json={json}
                  tree={tree}
                  antdTheme={antdTheme}
                  maxWidth={VIEWPORTS[device]}
                  onApplyJson={applyJson}
                />
              </section>

              <SettingsPanel
                tree={tree}
                selectedUid={selectedUid}
                onSelect={(uid) => setSelection(select(emptySelection, uid))}
              >
                <PropertyPanel
                  selected={selected}
                  form={formSelected ? form : null}
                  siblingNames={siblingNames}
                  onChange={(uid, field) =>
                    history.set(applyFieldEdit(tree, uid, field), "Edit field")
                  }
                  onChangeForm={(patch) =>
                    history.set(patchNode(tree, tree.uid, patch), "Edit form")
                  }
                />
              </SettingsPanel>
            </div>
          </HoverProvider>
        )}
      </div>
    </DesignerProvider>
  );
}
