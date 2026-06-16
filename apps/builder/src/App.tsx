import { childrenOf, type FieldNode, type FormSchema, migrate } from "@org/form-schema";
import { DEFAULT_TOKENS, type DesignTokens, migrateTheme, toAntdTheme } from "@org/form-theme";
import { Button, message, Segmented, Space, Typography, Upload } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { applyStepsOp } from "./engine/steps-ops";
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
  keyboardMove,
  patchNode,
  remove,
  setColSpan,
  type TreeNode,
} from "./engine/tree";
import { describeNode, metaGuard, newField } from "./field-registry";
import { useHistory } from "./history";
import { parseFormFile } from "./io";
import { PropertyPanel, type SelectedNode } from "./PropertyPanel";
import { presetResolverFromList, usePresets } from "./presets";
import { TemplateGallery } from "./TemplateGallery";
import { useUserTemplates } from "./templates";
import { useDragon } from "./useDragon";
import { WorkflowEditor } from "./WorkflowEditor";
import { CompositePanel } from "./workbench/CompositePanel";
import { HoverProvider } from "./workbench/hover";
import { oneOf, usePersistentState } from "./workbench/persist";
import { SettingsPanel } from "./workbench/SettingsPanel";
import { type Device, ToolbarPanel, type ViewMode } from "./workbench/ToolbarPanel";
import { ViewPanel } from "./workbench/ViewPanel";
import { ExplorerToggle } from "./workspace/ExplorerToggle";

const API = "http://localhost:3001";

/** Canvas/preview content width per simulated device. */
const VIEWPORTS = { Desktop: 1280, Tablet: 768, Mobile: 375 } as const;

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

export interface AppProps {
  /** Form to load on mount (the `/projects/:id/forms/:formId` leaf). */
  formId?: string;
  /** Project context (W3): scopes the preset library to global ∪ this project. Absent ⇒ global only. */
  projectId?: string;
  /** Called after a successful save (lets the workspace rail refresh form titles). */
  onSaved?: () => void;
  /** Reports whether the editor has unsaved changes (drives the navigation guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Hands a stable save function up so the guard can "save then proceed". Returns success. */
  provideSave?: (save: () => Promise<boolean>) => void;
  /** Workspace shell: explorer rail collapsed state (hide toggle lives in this header). */
  explorerCollapsed?: boolean;
  onExplorerCollapsedChange?: (collapsed: boolean) => void;
}

export function App({
  formId,
  projectId,
  onSaved,
  onDirtyChange,
  provideSave,
  explorerCollapsed,
  onExplorerCollapsedChange,
}: AppProps = {}) {
  const history = useHistory<TreeNode>(() => schemaToTree(migrate(example)));
  const tree = history.present;
  // History cursor at the last load/save; the editor is "dirty" when it has moved.
  // State (not a ref) so a save/load re-renders and the dirty-driven effects recompute.
  const [savedIndex, setSavedIndex] = useState(0);
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
  // Tokens at the last load/save — the clean theme baseline for the dirty check.
  const [savedTokens, setSavedTokens] = useState<DesignTokens>(DEFAULT_TOKENS);
  const [mode, setMode] = useState<"form" | "workflow">("form");
  const [clipboard, setClipboard] = useState<Clipboard>(emptyClipboard);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const userTemplates = useUserTemplates();

  // Preset library (Track W3/W4), lifted here so the gallery, the "Linked preset" control and
  // the live preview share ONE store — editing a preset then propagates to its linked fields.
  const presets = usePresets(projectId);
  const allPresets = useMemo(
    () => [...presets.builtin, ...presets.user],
    [presets.builtin, presets.user],
  );
  const presetResolver = useMemo(() => presetResolverFromList(allPresets), [allPresets]);

  // The neutral design tokens are mapped to an antd ThemeConfig that wraps the
  // preview, so editing a token re-themes the rendered form live.
  const antdTheme = useMemo(() => toAntdTheme(tokens), [tokens]);

  // The schema is derived from the designer tree — the read-only JSON view and the
  // live preview both read this single boundary conversion.
  const schema = useMemo(() => treeToSchema(tree), [tree]);
  const json = useMemo(() => JSON.stringify(schema, null, 2), [schema]);

  // Drop selection highlights for nodes that no longer exist (after delete/undo/load).
  useEffect(() => setSelection((s) => pruneSelection(s, tree)), [tree]);

  // When mounted as the `/projects/:projectId/forms/:formId` leaf, load that form (+ theme) once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load is keyed on formId only.
  useEffect(() => {
    if (formId) void onLoad(formId);
  }, [formId]);

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

  // Pointer drag engine: palette "create" drags and on-canvas "move" drags both
  // commit a single tree op and select the result. A press that doesn't drag selects.
  const dragon = useDragon({
    getTree: () => tree,
    guard: metaGuard(),
    createNode: (type, patch, taken) => fieldToTree(newField(type, taken, patch)),
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
    // D7 marquee: replace the selection with the rubber-band's hits (empty → root).
    setSelected: (uids) =>
      setSelection(
        uids.length ? selectMany(emptySelection, uids) : select(emptySelection, tree.uid),
      ),
    // Direct-manipulation grid resize: write the active breakpoint's colSpan. Every
    // step of one drag shares a `gesture` tag so it collapses to a single undo step.
    resizeColSpan: (uid, key, span, gesture) =>
      history.set(
        (prev) => setColSpan(prev, uid, key, span),
        "Resize column",
        `resize:${uid}:${gesture}`,
      ),
  };

  /** Save form + theme. Returns true on success so the navigation guard can proceed. */
  async function onSave(): Promise<boolean> {
    try {
      const res = await fetch(`${API}/forms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(`Save failed: ${data.message ?? res.statusText}`);
        return false;
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
        return false;
      }
      // Mark the current state (form + theme) as clean and refresh the workspace tree.
      setSavedIndex(history.index);
      setSavedTokens(tokens);
      onSaved?.();
      message.success(`Saved "${data.id}" (form + theme)`);
      return true;
    } catch (e) {
      message.error(`Save failed: ${(e as Error).message}`);
      return false;
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
      loadSchema(migrate(data));
      // A fresh load resets history to cursor 0 → that is the clean baseline.
      setSavedIndex(0);
      // Reapply the saved theme if one exists; a missing theme is not an error.
      const themeRes = await fetch(`${API}/themes/${encodeURIComponent(data.id)}`);
      const nextTokens = themeRes.ok ? migrateTheme(await themeRes.json()) : DEFAULT_TOKENS;
      setTokens(nextTokens);
      setSavedTokens(nextTokens);
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

  // --- Workspace integration: dirty signal, stable save, unload guard ---
  // Dirty = the form tree moved past its saved cursor OR the design tokens changed (both are
  // persisted together by `onSave`), so neither form edits nor theme edits are silently lost.
  const dirty =
    history.index !== savedIndex || JSON.stringify(tokens) !== JSON.stringify(savedTokens);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Register ONE stable save fn that reads the latest closure via a ref — so the
  // navigation guard never calls a stale snapshot of the current json/tokens.
  const latestSave = useRef(onSave);
  latestSave.current = onSave;
  const stableSave = useCallback(() => latestSave.current(), []);
  useEffect(() => provideSave?.(stableSave), [provideSave, stableSave]);

  // Native browser prompt on refresh / tab close while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // some engines still require this for the native prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function onExportTheme() {
    const blob = new Blob([JSON.stringify(tokens, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.id || "theme"}.theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Portable, backend-free download of the current form schema (Phase I).
  function onExportForm() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.id || "form"}.form.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load a form from an uploaded .json file (untrusted → migrate validates).
  async function onImportForm(file: File) {
    try {
      loadSchema(parseFormFile(await file.text()));
      message.success(`Imported "${file.name}"`);
    } catch (e) {
      message.error(`Import failed: ${(e as Error).message}`);
    }
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
          {onExplorerCollapsedChange && (
            <ExplorerToggle
              collapsed={explorerCollapsed ?? false}
              onCollapsedChange={onExplorerCollapsedChange}
            />
          )}
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
              <Button onClick={() => setGalleryOpen(true)}>Templates</Button>
              <Button onClick={onExportForm}>Export</Button>
              <Upload
                accept=".json,application/json"
                showUploadList={false}
                beforeUpload={(file) => {
                  void onImportForm(file);
                  return false; // handle locally; never POST
                }}
              >
                <Button>Import</Button>
              </Upload>
              <Button type="primary" onClick={onSave}>
                Save
              </Button>
              <Button onClick={() => onLoad()}>Load</Button>
            </Space>
          )}
        </header>

        <TemplateGallery
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onUse={loadSchema}
          userTemplates={userTemplates.templates}
          onSaveCurrent={(title) => userTemplates.save(title, schema)}
          onDeleteUser={userTemplates.remove}
        />

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
                  selectedField={selected?.field ?? null}
                  projectId={projectId}
                  presets={presets}
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
                  presetResolver={presetResolver}
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
                  fieldNames={fieldNames}
                  presets={allPresets}
                  onChange={(uid, field) =>
                    history.set(applyFieldEdit(tree, uid, field), "Edit field")
                  }
                  onStepsEdit={(uid, op) =>
                    history.set(applyStepsOp(tree, uid, op, metaGuard()), "Edit steps")
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
