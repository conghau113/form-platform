import { RedoOutlined, UndoOutlined } from "@ant-design/icons";
import { FormRenderer } from "@org/form-renderer-web";
import { migrate } from "@org/form-schema";
import { DEFAULT_TOKENS, type DesignTokens, migrateTheme, toAntdTheme } from "@org/form-theme";
import {
  Alert,
  Button,
  ConfigProvider,
  Input,
  message,
  Segmented,
  Space,
  Typography,
  theme,
} from "antd";
import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import example from "../../../examples/form.v1.json";
import { DesignCanvas, DesignerProvider, type DesignerValue } from "./DesignCanvas";
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
import { Palette } from "./Palette";
import { PropertyPanel, type SelectedNode } from "./PropertyPanel";
import { ThemeEditor } from "./ThemeEditor";
import { useDragon } from "./useDragon";
import { WorkflowEditor } from "./WorkflowEditor";

const API = "http://localhost:3001";

const VIEWPORTS = { Desktop: 1280, Tablet: 768, Mobile: 375 } as const;
type Viewport = keyof typeof VIEWPORTS;

/** Catches migrate()/validation throws from a transiently-invalid model (e.g. a field
 *  name was cleared) so a bad edit shows a message instead of crashing the preview.
 *  Remounted (via `key`) when the JSON changes, so it recovers once the model is valid. */
class PreviewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          showIcon
          message="Invalid schema"
          description={this.state.error.message}
        />
      );
    }
    return this.props.children;
  }
}

/** The themed preview card. Reads antd's themed tokens (so it follows the
 *  default/dark algorithm) from inside the surrounding ConfigProvider. */
function PreviewSurface({ maxWidth, children }: { maxWidth: number; children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        maxWidth,
        margin: "0 auto",
        padding: 24,
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
      }}
    >
      {children}
    </div>
  );
}

export function App() {
  const history = useHistory<TreeNode>(() => schemaToTree(migrate(example)));
  const tree = history.present;
  const form = tree.node as FormProps;
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const selectedUid = selection.selected[0] ?? null;
  const [viewport, setViewport] = useState<Viewport>("Desktop");
  const [rightTab, setRightTab] = useState<"preview" | "json">("preview");
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

  // The selected node, resolved to a schema field for the property panel. The form
  // root itself isn't editable here (its layoutProps land in Phase F's settings panel).
  const selectedNode = selectedUid ? findNode(tree, selectedUid) : null;
  const selected: SelectedNode | null =
    selectedNode && selectedNode.node.type !== "form"
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
        // Paste after the last-selected node, or into the form root if nothing is selected.
        const anchor = selection.selected[selection.selected.length - 1];
        const next = anchor
          ? pasteAfter(tree, anchor, clipboard, metaGuard())
          : pasteInto(tree, tree.uid, clipboard, metaGuard());
        if (next !== tree) history.set(next);
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
          history.set(next);
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
      history.set(next);
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
    history.set(remove(tree, uid));
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
      history.set(next);
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
    clearSelection: () => setSelection(emptySelection),
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
            <>
              <Input
                value={form.title}
                onChange={(e) => history.set(patchNode(tree, tree.uid, { title: e.target.value }))}
                placeholder="form title"
                style={{ width: 200 }}
              />
              <Input
                value={form.id}
                onChange={(e) => history.set(patchNode(tree, tree.uid, { id: e.target.value }))}
                placeholder="form id"
                style={{ width: 160 }}
              />
              <Space>
                <Button icon={<UndoOutlined />} disabled={!history.canUndo} onClick={history.undo}>
                  Undo
                </Button>
                <Button icon={<RedoOutlined />} disabled={!history.canRedo} onClick={history.redo}>
                  Redo
                </Button>
                <Button type="primary" onClick={onSave}>
                  Save
                </Button>
                <Button onClick={() => onLoad()}>Load</Button>
              </Space>
            </>
          )}
        </header>

        {mode === "workflow" ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <WorkflowEditor onEditForm={onEditForm} />
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <aside
              style={{ width: 150, borderRight: "1px solid rgba(0,0,0,0.08)", overflow: "auto" }}
            >
              <Palette />
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
              <DesignCanvas schema={schema} json={json} tree={tree} theme={antdTheme} />
            </section>

            <aside
              style={{
                width: 340,
                borderRight: "1px solid rgba(0,0,0,0.08)",
                minHeight: 0,
                overflow: "auto",
              }}
            >
              <PropertyPanel
                selected={selected}
                siblingNames={siblingNames}
                onChange={(uid, field) => history.set(applyFieldEdit(tree, uid, field))}
              />
            </aside>

            <section style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <Segmented
                  options={["preview", "json"]}
                  value={rightTab}
                  onChange={(v) => setRightTab(v as "preview" | "json")}
                />
                {rightTab === "preview" && (
                  <Segmented
                    options={Object.keys(VIEWPORTS)}
                    value={viewport}
                    onChange={(v) => setViewport(v as Viewport)}
                  />
                )}
              </div>

              {rightTab === "preview" ? (
                <>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <ThemeEditor tokens={tokens} onChange={setTokens} onExport={onExportTheme} />
                  </div>
                  <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#f5f5f5" }}>
                    <ConfigProvider theme={antdTheme}>
                      <PreviewSurface maxWidth={VIEWPORTS[viewport]}>
                        <PreviewBoundary key={json}>
                          <FormRenderer schema={schema} access={{ roles: ["admin"] }} />
                        </PreviewBoundary>
                      </PreviewSurface>
                    </ConfigProvider>
                  </div>
                </>
              ) : (
                <Input.TextArea
                  value={json}
                  readOnly
                  spellCheck={false}
                  style={{
                    flex: 1,
                    fontFamily: "monospace",
                    fontSize: 13,
                    border: "none",
                    borderRadius: 0,
                    resize: "none",
                  }}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </DesignerProvider>
  );
}
