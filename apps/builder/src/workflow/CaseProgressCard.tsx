import { nodeProgress } from "@org/workflow-core";
import type {
  StatusCatalogEntry,
  WorkflowDefinition,
  WorkflowInstance,
} from "@org/workflow-schema";
import { Card, Space, Tag, Typography } from "antd";
import { useMemo } from "react";
import { progressTag } from "./case-progress";
import { actionLabel, isTerminalState } from "./run-actions";
import { resolveStatusStyle } from "./status-catalog";

const { Text } = Typography;

/**
 * E1 — where the case stands on EVERY node, not just the one it is on. `history` is keyed by
 * transition, so the per-node view is a projection: {@link nodeProgress} in workflow-core (pure,
 * shared with the backend), named for display by {@link progressTag}.
 *
 * `def` is the ORIGINAL definition; `view` is the localized one. Progress is computed from `def`
 * because `nodeProgress` reads ids only, and recomputing it on every language switch would return
 * an identical result. Labels come from `view`.
 */
export function CaseProgressCard({
  def,
  view,
  instance,
  byCode,
  nameOf,
  locale,
}: {
  def: WorkflowDefinition;
  view: WorkflowDefinition;
  instance: WorkflowInstance;
  byCode: ReadonlyMap<string, StatusCatalogEntry>;
  nameOf: (userId: string | null | undefined) => string | null;
  locale: string | undefined;
}) {
  const progress = useMemo(() => nodeProgress(def, instance), [def, instance]);

  return (
    <Card title="Tiến trình" size="small">
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        {view.nodes.map((node) => {
          // `nodeProgress` reports every node of `def`, and `view` is a clone of it — but the rows
          // match by id, and that only holds while nobody names `id` as a key in a node's `i18n`
          // map (`localizeWorkflow` overwrites any attribute named there, ids included).
          //
          // A row we cannot place says NOTHING ("—"). It must not fall back to "Chưa tới": that
          // would state, as fact, that the case has not reached a node it may well be standing on
          // — the same contradiction-on-one-screen that the terminal label exists to avoid.
          const entry = progress[node.id];
          // Asked about THIS node, not about the case. Since E3a a forked case is `active` on
          // several rows at once, and one flag derived from the representative token would label
          // every one of them by whether that ONE branch had run out of actions — announcing
          // "Kết thúc" over a branch someone still has work in, or the reverse, depending on nothing
          // more than the order the definition happens to list its edges in.
          const tag = entry
            ? progressTag(entry.status, isTerminalState(def, node.id))
            : { label: "—" };
          return (
            <Space key={node.id} size="small" wrap>
              <Tag color={tag.color} style={{ margin: 0 }}>
                {tag.label}
              </Tag>
              <Text>{resolveStatusStyle(node, byCode).label}</Text>
              {/* `at` is when the case LEFT this node, never when it arrived — which is why it only
                  ever appears on a `done` row, where "left at" and "finished at" coincide. */}
              {entry?.status === "done" ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {actionLabel(def, entry.action, locale, def.defaultLocale, node.id)} ·{" "}
                  {new Date(entry.at).toLocaleString()}
                  {/* Same rule as the history timeline: a user we cannot name shows no name at
                      all, never a raw id. */}
                  {nameOf(entry.actor) ? ` · ${nameOf(entry.actor)}` : ""}
                </Text>
              ) : null}
            </Space>
          );
        })}
      </Space>
    </Card>
  );
}
