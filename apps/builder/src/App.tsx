import { RedoOutlined, UndoOutlined } from "@ant-design/icons";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { FormRenderer } from "@org/form-renderer-web";
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
import { CANVAS_ID, Canvas } from "./Canvas";
import { useHistory } from "./history";
import {
  fromFormSchema,
  insertField,
  moveField,
  removeField,
  toFormSchema,
  updateField,
} from "./model";
import { Palette, paletteType } from "./Palette";
import { PropertyPanel } from "./PropertyPanel";
import { ThemeEditor } from "./ThemeEditor";

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
  const history = useHistory(() => fromFormSchema(example));
  const model = history.present;
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>("Desktop");
  const [rightTab, setRightTab] = useState<"preview" | "json">("preview");
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);

  // The neutral design tokens are mapped to an antd ThemeConfig that wraps the
  // preview, so editing a token re-themes the rendered form live.
  const antdTheme = useMemo(() => toAntdTheme(tokens), [tokens]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // The schema is derived from the model — the read-only JSON view and the live
  // preview both read this single boundary conversion.
  const schema = useMemo(() => toFormSchema(model), [model]);
  const json = useMemo(() => JSON.stringify(schema, null, 2), [schema]);

  const selected = model.fields.find((f) => f.uid === selectedUid) ?? null;

  // Global undo/redo, except while typing in a form control.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        history.redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const type = paletteType(activeId);

    if (type) {
      const overIndex =
        overId === CANVAS_ID
          ? model.fields.length
          : model.fields.findIndex((f) => f.uid === overId);
      const at = overIndex === -1 ? model.fields.length : overIndex;
      const next = insertField(model, type, at);
      history.set(next);
      setSelectedUid(next.fields[at].uid);
      return;
    }
    if (overId !== CANVAS_ID && activeId !== overId) {
      history.set(moveField(model, activeId, overId));
    }
  }

  function onRemove(uid: string) {
    history.set(removeField(model, uid));
    if (selectedUid === uid) setSelectedUid(null);
  }

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

  async function onLoad() {
    try {
      const res = await fetch(`${API}/forms/${encodeURIComponent(model.id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(`Load failed: ${data.message ?? res.statusText}`);
        return;
      }
      history.reset(fromFormSchema(data));
      setSelectedUid(null);
      // Reapply the saved theme if one exists; a missing theme is not an error.
      const themeRes = await fetch(`${API}/themes/${encodeURIComponent(data.id)}`);
      setTokens(themeRes.ok ? migrateTheme(await themeRes.json()) : DEFAULT_TOKENS);
      message.success(`Loaded "${data.id}"`);
    } catch (e) {
      message.error(`Load failed: ${(e as Error).message}`);
    }
  }

  function onExportTheme() {
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${model.id || "theme"}.theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
            Form Builder
          </Typography.Title>
          <Input
            value={model.title}
            onChange={(e) => history.set({ ...model, title: e.target.value })}
            placeholder="form title"
            style={{ width: 200 }}
          />
          <Input
            value={model.id}
            onChange={(e) => history.set({ ...model, id: e.target.value })}
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
            <Button onClick={onLoad}>Load</Button>
          </Space>
        </header>

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
              width: 320,
              borderRight: "1px solid rgba(0,0,0,0.08)",
              minHeight: 0,
            }}
          >
            <Canvas
              model={model}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              onRemove={onRemove}
            />
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
              siblings={model.fields}
              onChange={(uid, patch) => history.set(updateField(model, uid, patch))}
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
      </div>
    </DndContext>
  );
}
