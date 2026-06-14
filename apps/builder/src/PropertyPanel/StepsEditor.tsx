import { childrenOf, type FieldNode } from "@org/form-schema";
import { Button, Divider, Input, Space } from "antd";
import type { StepsOp } from "../engine/steps-ops";
import { newField } from "../field-registry";

/** The wizard's step-list editor, shown in a `steps` node's property panel. Adds / removes /
 *  reorders step panes and edits each pane's label + description. Writes go through the tree
 *  (`onStepsEdit` → `applyStepsOp`), NOT the panel's `set`: a layout container's `children`
 *  are intentionally dropped by the normal edit path (to keep selectable descendant uids). */
export function StepsEditor({
  stepsUid,
  node,
  onStepsEdit,
}: {
  stepsUid: string;
  node: FieldNode;
  onStepsEdit: (stepsUid: string, op: StepsOp) => void;
}) {
  const steps = (childrenOf(node) ?? []) as Array<{ label?: string; description?: string }>;
  const emit = (op: StepsOp) => onStepsEdit(stepsUid, op);
  return (
    <>
      <Divider orientation="left" plain>
        Steps
      </Divider>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: step panes have no stable id; index is fine for this small editor
          <Space key={i} wrap align="start">
            <Input
              style={{ width: 130 }}
              placeholder="label"
              value={step.label ?? ""}
              onChange={(e) => emit({ kind: "patch", index: i, patch: { label: e.target.value } })}
            />
            <Input
              style={{ width: 160 }}
              placeholder="description (optional)"
              value={step.description ?? ""}
              onChange={(e) =>
                emit({
                  kind: "patch",
                  index: i,
                  patch: { description: e.target.value || undefined },
                })
              }
            />
            <Button
              type="text"
              size="small"
              disabled={i === 0}
              onClick={() => emit({ kind: "move", index: i, dir: -1 })}
            >
              ↑
            </Button>
            <Button
              type="text"
              size="small"
              disabled={i === steps.length - 1}
              onClick={() => emit({ kind: "move", index: i, dir: 1 })}
            >
              ↓
            </Button>
            <Button
              type="text"
              size="small"
              danger
              disabled={steps.length <= 1}
              onClick={() => emit({ kind: "remove", index: i })}
            >
              ✕
            </Button>
          </Space>
        ))}
        <Button size="small" onClick={() => emit({ kind: "add", step: newField("step") })}>
          Add step
        </Button>
      </div>
    </>
  );
}
