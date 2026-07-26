import type { Reaction, ReactionEffect } from "@org/form-schema";
import { Button, Divider, Input, Select, Space, Typography } from "antd";
import { type Option, OptionsEditor, readEqualsRule } from "../PropertyPanel";

/** The effects an authored reaction can apply, with friendly labels. */
const EFFECT_OPTIONS: { label: string; value: ReactionEffect }[] = [
  { label: "Hiện / ẩn", value: "visible" },
  { label: "Bật / tắt", value: "disabled" },
  { label: "Bắt buộc / tùy chọn", value: "required" },
  { label: "Đặt giá trị", value: "value" },
  { label: "Đặt tùy chọn", value: "options" },
];

/** A sensible starting payload when the effect kind changes, so the value control
 *  always has a coherent value to edit. */
function defaultValueForEffect(effect: ReactionEffect): unknown {
  switch (effect) {
    case "visible":
      return true; // "Show" while matched
    case "disabled":
      return true; // "Disable" while matched
    case "required":
      return true; // "Require" while matched
    case "value":
      return "";
    case "options":
      return [];
  }
}

/** The per-effect value control: a Show/Hide or Enable/Disable select, a free Input for
 *  `value`, or the shared OptionsEditor for `options`. */
function ReactionValueControl({
  reaction,
  onChange,
}: {
  reaction: Reaction;
  onChange: (value: unknown) => void;
}) {
  switch (reaction.effect) {
    case "visible":
      return (
        <Select
          style={{ width: 110 }}
          value={reaction.value === false ? "hide" : "show"}
          options={[
            { label: "Hiện", value: "show" },
            { label: "Ẩn", value: "hide" },
          ]}
          onChange={(v) => onChange(v !== "hide")}
        />
      );
    case "disabled":
      return (
        <Select
          style={{ width: 120 }}
          value={reaction.value === false ? "enable" : "disable"}
          options={[
            { label: "Tắt", value: "disable" },
            { label: "Bật", value: "enable" },
          ]}
          onChange={(v) => onChange(v !== "enable")}
        />
      );
    case "required":
      return (
        <Select
          style={{ width: 120 }}
          value={reaction.value === false ? "optional" : "require"}
          options={[
            { label: "Bắt buộc", value: "require" },
            { label: "Tùy chọn", value: "optional" },
          ]}
          onChange={(v) => onChange(v !== "optional")}
        />
      );
    case "value":
      return (
        <Input
          style={{ width: 130 }}
          placeholder="giá trị"
          value={(reaction.value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "options":
      return (
        <OptionsEditor
          options={(reaction.value as Option[]) ?? []}
          onChange={(opts) => onChange(opts)}
        />
      );
  }
}

/** A "Reactions" (linkage) section: author `reactions[]` that make OTHER fields react to
 *  this field's value. Each row edits a simple `When <source> = <value>` condition (a
 *  non-simple rule falls back to a read-only hint — edit it in the JSON panel), a target
 *  field, an effect kind, and that effect's value. Modeled on the ValidationEditor. */
export function ReactionsEditor({
  reactions,
  fieldName,
  targetNames,
  sourceNames,
  onChange,
}: {
  reactions: Reaction[];
  /** The host field's name, excluded from the target candidates (no self-targeting). */
  fieldName: string;
  /** Candidate target field names in this scope. */
  targetNames: string[];
  /** Candidate source field names for the When condition. */
  sourceNames: string[];
  onChange: (next: Reaction[]) => void;
}) {
  const targets = targetNames.filter((n) => n !== fieldName);
  const update = (i: number, patch: Partial<Reaction>) =>
    onChange(reactions.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(reactions.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...reactions,
      {
        when: { rule: { "==": [{ var: sourceNames[0] ?? "" }, ""] } },
        target: targets[0] ?? "",
        effect: "visible",
        value: true,
      },
    ]);

  return (
    <>
      <Divider orientation="left" plain>
        Phản ứng
      </Divider>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {reactions.map((reaction, i) => {
          const eq = readEqualsRule(reaction.when?.rule);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: reactions have no stable id; index is fine for this small editor
              key={i}
              style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 8 }}
            >
              {eq ? (
                <Space wrap align="center" style={{ marginBottom: 8 }}>
                  <Typography.Text type="secondary">Khi</Typography.Text>
                  <Select
                    style={{ width: 130 }}
                    value={eq.field || undefined}
                    placeholder="trường"
                    options={sourceNames.map((n) => ({ label: n, value: n }))}
                    onChange={(name) =>
                      update(i, { when: { rule: { "==": [{ var: name }, eq.value] } } })
                    }
                  />
                  <Typography.Text type="secondary">=</Typography.Text>
                  <Input
                    style={{ width: 110 }}
                    value={eq.value}
                    onChange={(e) =>
                      update(i, { when: { rule: { "==": [{ var: eq.field }, e.target.value] } } })
                    }
                  />
                </Space>
              ) : (
                <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                  Điều kiện tùy chỉnh — sửa qua bảng JSON
                </Typography.Text>
              )}
              <Space wrap align="center">
                <Typography.Text type="secondary">thì</Typography.Text>
                <Select
                  style={{ width: 130 }}
                  value={reaction.target || undefined}
                  placeholder="đích"
                  options={targets.map((n) => ({ label: n, value: n }))}
                  onChange={(target) => update(i, { target })}
                />
                <Select
                  style={{ width: 140 }}
                  value={reaction.effect}
                  options={EFFECT_OPTIONS}
                  onChange={(effect: ReactionEffect) =>
                    update(i, { effect, value: defaultValueForEffect(effect) })
                  }
                />
                <ReactionValueControl
                  reaction={reaction}
                  onChange={(value) => update(i, { value })}
                />
                <Button type="text" size="small" danger onClick={() => remove(i)}>
                  ✕
                </Button>
              </Space>
            </div>
          );
        })}
        <Button size="small" onClick={add}>
          Thêm phản ứng
        </Button>
      </div>
    </>
  );
}
