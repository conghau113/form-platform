import {
  ApartmentOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { FieldNode } from "@org/form-schema";
import type { DesignTokens } from "@org/form-theme";
import { Tabs } from "antd";
import type { TreeNode } from "../engine/tree";
import type { HistoryEntry } from "../history";
import { Palette } from "../Palette";
import { ThemeEditor } from "../ThemeEditor";
import { HistoryPanel } from "./HistoryPanel";
import { OutlineTree } from "./OutlineTree";
import { oneOf, usePersistentState } from "./persist";
import "./CompositePanel.css";

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
      tabBarStyle={{ paddingLeft: 8, marginBottom: 0, flexShrink: 0 }}
      items={[
        {
          key: "components",
          label: <AppstoreOutlined title="Components" />,
          children: <Palette selectedField={selectedField} />,
        },
        {
          key: "outline",
          label: <ApartmentOutlined title="Outline" />,
          children: <OutlineTree root={tree} />,
        },
        {
          key: "history",
          label: <HistoryOutlined title="History" />,
          children: (
            <HistoryPanel entries={history.entries} index={history.index} onJump={history.jumpTo} />
          ),
        },
        {
          key: "theme",
          label: <BgColorsOutlined title="Theme" />,
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
