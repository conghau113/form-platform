import {
  ApartmentOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { FieldNode } from "@org/form-schema";
import type { DesignTokens } from "@org/form-theme";
import { Tabs } from "antd";
import type { HistoryEntry } from "../editor";
import type { TreeNode } from "../engine/tree";
import { Palette } from "../palette";
import type { PresetStore } from "../presets";
import { ThemeEditor } from "../theme";
import "./CompositePanel.css";
import { HistoryPanel } from "./HistoryPanel";
import { OutlineTree } from "./OutlineTree";
import { oneOf, usePersistentState } from "./persist";

type CompositeTab = "components" | "outline" | "history" | "theme";

/* ----------------------------------------------------------------------------
 * CompositePanel — the left rail of the workbench (Designable's CompositePanel).
 * Four tabs: Components (palette), Outline (model tree), History (undo timeline)
 * and Theme (design-token editor). Pure presentation: every bit of state it
 * shows is owned by App and threaded in — except the active tab, which is
 * panel-local UI state persisted across reloads.
 * ------------------------------------------------------------------------- */

export function CompositePanel({
  tree,
  history,
  tokens,
  onChangeTokens,
  onExportTheme,
  selectedField,
  projectId,
  presets,
}: {
  tree: TreeNode;
  history: {
    entries: readonly HistoryEntry<TreeNode>[];
    index: number;
    jumpTo: (index: number) => void;
  };
  tokens: DesignTokens;
  onChangeTokens: (tokens: DesignTokens) => void;
  onExportTheme: () => void;
  /** The selected field (for "save current field as preset"); null when none/root. */
  selectedField: FieldNode | null;
  /** Project context (W3) → scopes the preset library. */
  projectId?: string;
  /** Shared preset store (W4), lifted to App so the gallery + preview + link control agree. */
  presets: PresetStore;
}) {
  const [tab, setTab] = usePersistentState<CompositeTab>(
    "compositeTab",
    "components",
    oneOf("components", "outline", "history", "theme"),
  );
  return (
    <Tabs
      className="composite-panel"
      activeKey={tab}
      onChange={(key) => setTab(key as CompositeTab)}
      size="small"
      tabBarStyle={{
        paddingLeft: 16,
        // margin: "auto",
        marginBottom: 0,
      }}
      items={[
        {
          key: "components",
          label: <AppstoreOutlined style={{ fontSize: 16 }} title="Thành phần" />,
          children: (
            <Palette selectedField={selectedField} projectId={projectId} presets={presets} />
          ),
        },
        {
          key: "outline",
          label: <ApartmentOutlined style={{ fontSize: 16 }} title="Cấu trúc" />,
          children: <OutlineTree root={tree} />,
        },
        {
          key: "history",
          label: <HistoryOutlined style={{ fontSize: 16 }} title="Lịch sử" />,
          children: (
            <HistoryPanel entries={history.entries} index={history.index} onJump={history.jumpTo} />
          ),
        },
        {
          key: "theme",
          label: <BgColorsOutlined style={{ fontSize: 16 }} title="Giao diện" />,
          children: (
            <div style={{ padding: 12 }}>
              <ThemeEditor tokens={tokens} onChange={onChangeTokens} onExport={onExportTheme} />
            </div>
          ),
        },
      ]}
    />
  );
}
