import { childrenOf, type FieldNode, isLayoutContainer, type Preset } from "@org/form-schema";
import { Button, Empty, Form, Input, Typography } from "antd";
import { useEffect, useState } from "react";
import { type NodePath, nodeAtPath, patchNodeAtPath } from "../engine/field-path";
import type { StepsOp } from "../engine/steps-ops";
import type { FormProps } from "../engine/tree";
import { describeNode, fieldTypeLabel } from "../field-registry";
import { computeOverrides } from "../presets/link";
import { FieldForm } from "./FieldForm";
import { FormSettingsEditor } from "./FormSettingsEditor";
import { nodeLabel, nodeName } from "./helpers";
import { PresetLink } from "./PresetLink";
import { StepsEditor } from "./StepsEditor";
import { TypeSettings } from "./TypeSettings";
import type { AuthoredField, SelectedNode } from "./types";

/** Labels along a drill path, for the breadcrumb (root field + each drilled child). */
function pathCrumbs(root: FieldNode, path: NodePath): string[] {
  const crumbs = [nodeLabel(root) || nodeName(root) || root.type];
  let node: FieldNode = root;
  for (const index of path) {
    const child = childrenOf(node)?.[index];
    if (!child) break;
    node = child;
    crumbs.push(nodeLabel(child) || nodeName(child) || `#${index}`);
  }
  return crumbs;
}

/** Right column: edits the selected field, drilling into an array's item fields so a
 *  nested item gets the full editor. A change at depth `path` is rebuilt into a single
 *  patch on the top-level field via `patchNodeAtPath`, so App's onChange is unchanged. */
export function PropertyPanel({
  selected,
  form,
  siblingNames: topSiblingNames,
  fieldNames,
  presets = [],
  onChange,
  onChangeForm,
  onStepsEdit,
}: {
  selected: SelectedNode | null;
  /** The root Form node, set when IT is the selection (mutually exclusive with `selected`). */
  form?: FormProps | null;
  /** Top-level field names, candidates for a visibleWhen condition. */
  siblingNames: string[];
  /** Built-in + user presets (Track W4) — populates the leaf's "Linked preset" control. */
  presets?: Preset[];
  /** Every named field reachable in the top-level value scope (containers descended,
   *  array subtrees skipped) — reaction TARGET candidates for a top-level field. */
  fieldNames: string[];
  /** Emits the rebuilt top-level node (App swaps it into the tree via replaceField). */
  onChange: (uid: string, field: FieldNode) => void;
  /** Patches the root Form node (id/title/layoutProps). */
  onChangeForm?: (patch: Partial<FormProps>) => void;
  /** Applies a StepsEditor op to the selected `steps` node. The step list is edited through
   *  the tree (not the normal `set` path, which drops a container's children). */
  onStepsEdit?: (stepsUid: string, op: StepsOp) => void;
}) {
  const [drillPath, setDrillPath] = useState<NodePath>([]);
  // Leaving the current node resets the drill; a stale path (e.g. after undo) too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the selected node changes
  useEffect(() => setDrillPath([]), [selected?.uid]);

  if (!selected) {
    if (form && onChangeForm) {
      return <FormSettingsEditor form={form} onChange={onChangeForm} />;
    }
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Select a field to edit its properties" />
      </div>
    );
  }

  const { uid, field: root } = selected;
  // Resolve the drilled node; if the path no longer resolves, fall back to the root.
  const resolved = nodeAtPath(root, drillPath);
  const path = resolved ? drillPath : [];
  const node = resolved ?? root;

  // `patchNodeAtPath` returns the WHOLE rebuilt top-level node; App's replaceField then
  // swaps it into the tree. (Not a partial patch — it carries every key, so a removed
  // key is reflected because the whole node is re-emitted.)
  const set = (patch: Partial<AuthoredField>) => onChange(uid, patchNodeAtPath(root, path, patch));

  const crumbs = pathCrumbs(root, path);
  const breadcrumb = path.length > 0 && (
    <div style={{ marginBottom: 8 }}>
      {crumbs.map((label, depth) =>
        depth < crumbs.length - 1 ? (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: crumb position is its identity
            key={depth}
            type="link"
            size="small"
            style={{ padding: 0, height: "auto" }}
            onClick={() => setDrillPath(path.slice(0, depth))}
          >
            {label} ›{" "}
          </Button>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumb position is its identity
          <Typography.Text key={depth} strong>
            {label}
          </Typography.Text>
        ),
      )}
    </div>
  );

  // Layout containers (tabs/card/grid/...) are nameless and value-transparent: show a
  // minimal, settings-only editor. Drag-based authoring of their children is Phase E.
  if (isLayoutContainer(node)) {
    return (
      <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
        {breadcrumb}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {fieldTypeLabel(node.type)} container — its fields are edited on the canvas.
        </Typography.Paragraph>
        {/* The wizard's step list is authored here (add/remove/reorder + per-step label and
            description); the fields INSIDE each step are still edited on the canvas. */}
        {node.type === "steps" && onStepsEdit && (
          <StepsEditor stepsUid={uid} node={node} onStepsEdit={onStepsEdit} />
        )}
        <Form layout="vertical" size="small">
          {/* A named container (today only `group`) carries a schema key once it is
              authorable/selectable on the canvas. */}
          {describeNode(node.type).named && (
            <Form.Item label="Name (schema key)">
              <Input value={nodeName(node) ?? ""} onChange={(e) => set({ name: e.target.value })} />
            </Form.Item>
          )}
          <TypeSettings field={node} set={set} />
        </Form>
      </div>
    );
  }

  // Visibility candidates: sibling fields in the same container as the edited node.
  const parent = path.length ? nodeAtPath(root, path.slice(0, -1)) : null;
  const siblingNames = path.length
    ? (parent ? (childrenOf(parent) ?? []) : [])
        .map((f) => nodeName(f))
        .filter((n): n is string => Boolean(n) && n !== nodeName(node))
    : topSiblingNames.filter((n) => n !== nodeName(node));

  // A linked leaf (W4): edits to its props must refresh `overrides` (the diff vs the preset's
  // patch) so the saved body stays renderer-resolvable. Link/unlink themselves carry `presetId`
  // in the patch and bypass this, since the link is changing rather than being edited.
  const linkedPreset = (() => {
    const presetId = (node as { presetId?: string }).presetId;
    if (!presetId) return undefined;
    const p = presets.find((x) => x.id === presetId);
    return p && p.fieldType === node.type ? p : undefined;
  })();
  const fieldSet = linkedPreset
    ? (patch: Partial<AuthoredField>) => {
        if ("presetId" in patch) return set(patch);
        const next = { ...node, ...patch } as FieldNode;
        set({ ...patch, overrides: computeOverrides(next, linkedPreset.patch) });
      }
    : set;

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      {breadcrumb}
      <PresetLink field={node} presets={presets} set={set} />
      <FieldForm
        field={node as AuthoredField}
        siblingNames={siblingNames}
        // Reaction targets: all top-level-scope names for a top-level field; the row's
        // sibling names when editing an array item field (path.length > 0).
        targetNames={path.length ? siblingNames : fieldNames}
        set={fieldSet}
        onDrill={(index) => setDrillPath([...path, index])}
      />
    </div>
  );
}
