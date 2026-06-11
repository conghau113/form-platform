import { FormRenderer } from "@org/form-renderer-web";
import type { FormSchema } from "@org/form-schema";
import { Alert, ConfigProvider, type ThemeConfig, theme } from "antd";
import { Component, type ReactNode } from "react";
import { DesignCanvas } from "../DesignCanvas";
import type { TreeNode } from "../engine/tree";
import { JsonEditor } from "./JsonEditor";
import type { ViewMode } from "./ToolbarPanel";

/* ----------------------------------------------------------------------------
 * ViewPanel — the center workspace body. It swaps between Designable's three
 * view modes: DESIGN (the WYSIWYG DesignCanvas), JSON (the two-way JsonEditor)
 * and PREVIEW (the real, interactive FormRenderer). Design and Preview honor
 * the toolbar device width; JSON is width-agnostic.
 * ------------------------------------------------------------------------- */

/** Catches a transiently-invalid model so the preview shows a message instead of
 *  crashing; remounts (via `key`) once the model is valid again. */
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

export function ViewPanel({
  mode,
  schema,
  json,
  tree,
  antdTheme,
  maxWidth,
  onApplyJson,
}: {
  mode: ViewMode;
  schema: unknown;
  json: string;
  tree: TreeNode;
  antdTheme: ThemeConfig;
  /** Canvas/preview content width from the toolbar device simulator. */
  maxWidth: number;
  /** Receives the validated schema when the JSON editor applies a valid edit. */
  onApplyJson: (schema: FormSchema) => void;
}) {
  if (mode === "design") {
    return (
      <DesignCanvas schema={schema} json={json} tree={tree} theme={antdTheme} maxWidth={maxWidth} />
    );
  }

  if (mode === "preview") {
    return (
      <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#f5f5f5" }}>
        <ConfigProvider theme={antdTheme}>
          <PreviewSurface maxWidth={maxWidth}>
            <PreviewBoundary key={json}>
              <FormRenderer schema={schema} access={{ roles: ["admin"] }} />
            </PreviewBoundary>
          </PreviewSurface>
        </ConfigProvider>
      </div>
    );
  }

  // JSON — two-way: valid edits update the tree, invalid ones show inline.
  return <JsonEditor json={json} onApply={onApplyJson} />;
}
