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
import { Alert, Button, Input, message, Segmented, Space, Typography } from "antd";
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

export function App() {
  const history = useHistory(() => fromFormSchema(example));
  const model = history.present;
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>("Desktop");
  const [rightTab, setRightTab] = useState<"preview" | "json">("preview");

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
      message.success(`Saved "${data.id}"`);
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
      message.success(`Loaded "${model.id}"`);
    } catch (e) {
      message.error(`Load failed: ${(e as Error).message}`);
    }
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
              <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#f5f5f5" }}>
                <div
                  style={{
                    maxWidth: VIEWPORTS[viewport],
                    margin: "0 auto",
                    padding: 24,
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }}
                >
                  <PreviewBoundary key={json}>
                    <FormRenderer schema={schema} access={{ roles: ["admin"] }} />
                  </PreviewBoundary>
                </div>
              </div>
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
