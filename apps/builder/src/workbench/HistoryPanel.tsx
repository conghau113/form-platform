import { Empty } from "antd";
import type { HistoryEntry } from "../editor";

/* ----------------------------------------------------------------------------
 * HistoryPanel — the CompositePanel "History" tab. Lists every recorded undo
 * state oldest→newest (the pure timeline from engine/history), highlights the
 * current cursor, and jumps to any entry on click. Labels come from the
 * `history.set(next, label)` call sites in App; unlabeled steps read "Edit".
 * ------------------------------------------------------------------------- */

export function HistoryPanel<T>({
  entries,
  index,
  onJump,
}: {
  entries: readonly HistoryEntry<T>[];
  index: number;
  onJump: (index: number) => void;
}) {
  if (entries.length <= 1) {
    return (
      <div style={{ padding: 24 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No history yet" />
      </div>
    );
  }

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
      {entries.map((entry, i) => {
        const current = i === index;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: timeline position is the entry's identity
            key={i}
            type="button"
            onClick={() => onJump(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 13,
              // Entries after the cursor are "redoable" — dim them.
              opacity: i > index ? 0.45 : 1,
              color: current ? "#1677ff" : undefined,
              background: current ? "rgba(22,119,255,0.12)" : "transparent",
            }}
          >
            <span
              style={{
                width: 18,
                color: "rgba(0,0,0,0.35)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 11,
              }}
            >
              {i + 1}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.label ?? "Edit"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
