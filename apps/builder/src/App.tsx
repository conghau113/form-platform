import { FormRenderer } from "@org/form-renderer-web";
import { Alert, Button, Input, message, Segmented, Space, Typography } from "antd";
import { Component, type ReactNode, useMemo, useState } from "react";
import example from "../../../examples/form.v1.json";

const API = "http://localhost:3001";

const VIEWPORTS = { Desktop: 1280, Tablet: 768, Mobile: 375 } as const;
type Viewport = keyof typeof VIEWPORTS;

/** Catches migrate()/validation throws from parseable-but-invalid schema JSON so a
 *  bad edit shows a message instead of crashing the app. Remounted (via `key`) when
 *  the JSON changes, so it recovers automatically once the schema is valid again. */
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
  const [text, setText] = useState(() => JSON.stringify(example, null, 2));
  const [viewport, setViewport] = useState<Viewport>("Desktop");
  const [formId, setFormId] = useState((example as { id: string }).id);

  const { schema, parseError } = useMemo(() => {
    try {
      return { schema: JSON.parse(text) as unknown, parseError: null as string | null };
    } catch (e) {
      return { schema: null, parseError: (e as Error).message };
    }
  }, [text]);

  // The server is the source of truth: it re-validates the body and stores the
  // normalized current-version JSON, returning the form (incl. its id).
  async function onSave() {
    try {
      const res = await fetch(`${API}/forms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(`Save failed: ${data.message ?? res.statusText}`);
        return;
      }
      setFormId(data.id);
      message.success(`Saved "${data.id}"`);
    } catch (e) {
      message.error(`Save failed: ${(e as Error).message}`);
    }
  }

  async function onLoad() {
    try {
      const res = await fetch(`${API}/forms/${encodeURIComponent(formId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(`Load failed: ${data.message ?? res.statusText}`);
        return;
      }
      setText(JSON.stringify(data, null, 2));
      message.success(`Loaded "${formId}"`);
    } catch (e) {
      message.error(`Load failed: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <Typography.Title level={4} style={{ margin: 0, whiteSpace: "nowrap" }}>
          Form Builder
        </Typography.Title>
        <Space>
          <Input
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            placeholder="form id"
            style={{ width: 180 }}
          />
          <Button type="primary" onClick={onSave}>
            Save
          </Button>
          <Button onClick={onLoad}>Load</Button>
        </Space>
        <Segmented
          options={Object.keys(VIEWPORTS)}
          value={viewport}
          onChange={(v) => setViewport(v as Viewport)}
        />
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            width: "40%",
            borderRight: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {parseError ? (
            <Alert type="warning" showIcon banner message={`JSON error: ${parseError}`} />
          ) : null}
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
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
        </section>

        <section style={{ flex: 1, overflow: "auto", padding: 24, background: "#f5f5f5" }}>
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
            {schema ? (
              <PreviewBoundary key={text}>
                <FormRenderer schema={schema} access={{ roles: ["admin"] }} />
              </PreviewBoundary>
            ) : (
              <Typography.Text type="secondary">Fix the JSON to see a preview.</Typography.Text>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
