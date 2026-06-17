import { PushpinFilled, PushpinOutlined, SearchOutlined } from "@ant-design/icons";
import type { Reaction } from "@org/form-schema";
import { Button, Checkbox, Collapse, Form, Input, InputNumber, Select, Space } from "antd";
import { type ReactNode, useState } from "react";
import { DataSourceEditor, isOptionSourced } from "../DataSourceEditor";
import { usePins } from "../pins";
import { ReactionsEditor } from "../ReactionsEditor";
import { DefaultValueEditor } from "./DefaultValueEditor";
import { csv, mergePermissions, parseCsv, prop } from "./helpers";
import { ItemFieldsEditor } from "./ItemFieldsEditor";
import { readEquals } from "./rules";
import { type PanelSectionKey, SECTION_LABELS, sectionMatches } from "./sections";
import { TypeSettings } from "./TypeSettings";
import { type AuthoredField, COL_KEYS, type ColKey, type Patch } from "./types";
import { ValidationEditor } from "./ValidationEditor";

const PINNED_SECTIONS_KEY = "panel.pinnedSections";
const DEFAULT_OPEN: PanelSectionKey[] = ["basic", "props"];

/** The full property editor for a single field. Reused recursively: a top-level field
 *  and a nested array item field both render through this. Grouped into collapsible
 *  sections (Basic + Properties open by default; advanced ones collapsed) so the panel
 *  reads as a short list instead of one long scroll. */
export function FieldForm({
  field,
  siblingNames,
  targetNames,
  set,
  onDrill,
}: {
  field: AuthoredField;
  siblingNames: string[];
  /** Candidate reaction target names (top-level scope names, or row siblings when nested). */
  targetNames: string[];
  set: (patch: Patch) => void;
  onDrill: (index: number) => void;
}) {
  const colSpan = field.layout?.colSpan ?? {};
  const setColSpan = (key: ColKey, value: number | null) => {
    const next = { ...colSpan };
    if (value == null) delete next[key];
    else next[key] = value;
    const hasAny = Object.keys(next).length > 0;
    set({
      layout: {
        ...field.layout,
        colSpan: hasAny ? next : undefined,
      },
    });
  };

  const equals = readEquals(field);
  const condFields = siblingNames.filter((n) => n !== field.name);
  const isArray = field.type === "array";

  // --- Basic identity + universal interaction pattern ------------------------
  const basic = (
    <>
      <Form.Item label="Label">
        <Input value={field.label} onChange={(e) => set({ label: e.target.value })} />
      </Form.Item>
      <Form.Item label="Name (schema key)">
        <Input value={field.name} onChange={(e) => set({ name: e.target.value })} />
      </Form.Item>
      <Form.Item label="Help text">
        <Input
          value={field.helpText ?? ""}
          onChange={(e) => set({ helpText: e.target.value || undefined })}
        />
      </Form.Item>
      <Form.Item label="Tooltip">
        <Input
          value={field.tooltip ?? ""}
          onChange={(e) => set({ tooltip: e.target.value || undefined })}
        />
      </Form.Item>
      {/* Persistent hint under the control (Form.Item `extra`); a validation message
          never replaces it, unlike Help text. Leaves only — arrays render their own shell. */}
      {!isArray && (
        <Form.Item label="Extra hint">
          <Input
            value={field.extra ?? ""}
            onChange={(e) => set({ extra: e.target.value || undefined } as Patch)}
          />
        </Form.Item>
      )}
      <Space wrap>
        <Form.Item>
          <Checkbox
            checked={!!field.required}
            onChange={(e) => set({ required: e.target.checked || undefined })}
          >
            Required
          </Checkbox>
        </Form.Item>
        {!isArray && (
          <Form.Item>
            <Checkbox
              checked={!!field.hasFeedback}
              onChange={(e) => set({ hasFeedback: e.target.checked || undefined } as Patch)}
            >
              Show feedback
            </Checkbox>
          </Form.Item>
        )}
        {/* Universal interaction pattern (Formily-style), layered on the additive
            disabled/readOnly/readPretty flags — mutually exclusive in the UI. */}
        {!isArray && (
          <Form.Item label="Pattern">
            <Select
              style={{ width: 140 }}
              value={
                field.readPretty
                  ? "readPretty"
                  : field.readOnly
                    ? "readOnly"
                    : field.disabled
                      ? "disabled"
                      : "editable"
              }
              options={[
                { label: "Editable", value: "editable" },
                { label: "Disabled", value: "disabled" },
                { label: "Read-only", value: "readOnly" },
                { label: "Read-pretty", value: "readPretty" },
              ]}
              onChange={(p) =>
                set({
                  disabled: p === "disabled" ? true : undefined,
                  readOnly: p === "readOnly" ? true : undefined,
                  readPretty: p === "readPretty" ? true : undefined,
                } as Patch)
              }
            />
          </Form.Item>
        )}
      </Space>
    </>
  );

  // --- Type-specific props + data + default value ----------------------------
  const properties = (
    <>
      {/* Type-specific properties, driven by the registry descriptor */}
      <TypeSettings field={field} set={set} />
      {/* An option-sourced leaf's options (select / checkbox-group / cascader /
          tree-select) come from the shared static-vs-remote editor (params + cache). */}
      {isOptionSourced(field) && (
        <DataSourceEditor field={field} sourceNames={condFields} set={set} />
      )}
      {isArray && <ItemFieldsEditor field={field} set={set} onConfigure={onDrill} />}
      <DefaultValueEditor field={field} set={set} />
    </>
  );

  // --- Layout (responsive colSpan + mobile visibility) -----------------------
  const layout = (
    <>
      <Space wrap>
        {COL_KEYS.map((key) => (
          <Form.Item key={key} label={`colSpan ${key}`}>
            <InputNumber
              min={1}
              max={24}
              style={{ width: 80 }}
              value={colSpan[key] ?? null}
              onChange={(v) => setColSpan(key, v)}
            />
          </Form.Item>
        ))}
      </Space>
      <Form.Item>
        <Checkbox
          checked={!!field.layout?.hideOnMobile}
          onChange={(e) =>
            set({ layout: { ...field.layout, hideOnMobile: e.target.checked || undefined } })
          }
        >
          Hide on mobile
        </Checkbox>
      </Form.Item>
    </>
  );

  // --- Logic (visibility + reactions) ----------------------------------------
  const logic = (
    <>
      {/* Visibility is editable for top-level AND array item fields: per-row visibleWhen
          is evaluated against the row's merged scope (G4). For an item field, `condFields`
          offers the row's sibling names; referencing a top-level field still works via the
          JSON panel since the row scope merges outer values. */}
      <Form.Item label="Show this field">
        <Select
          value={equals ? "when" : "always"}
          onChange={(mode) => {
            if (mode === "always") set({ visibleWhen: undefined });
            else {
              const first = condFields[0] ?? "";
              set({ visibleWhen: { rule: { "==": [{ var: first }, ""] } } });
            }
          }}
          options={[
            { label: "Always", value: "always" },
            { label: "When a field equals a value", value: "when" },
          ]}
        />
      </Form.Item>
      {equals && (
        <Space>
          <Form.Item label="Field">
            <Select
              style={{ width: 130 }}
              value={equals.field}
              onChange={(name) =>
                set({ visibleWhen: { rule: { "==": [{ var: name }, equals.value] } } })
              }
              options={condFields.map((n) => ({ label: n, value: n }))}
            />
          </Form.Item>
          <Form.Item label="Equals">
            <Input
              value={equals.value}
              onChange={(e) =>
                set({
                  visibleWhen: { rule: { "==": [{ var: equals.field }, e.target.value] } },
                })
              }
            />
          </Form.Item>
        </Space>
      )}
      <ReactionsEditor
        reactions={(prop(field, "reactions") as Reaction[] | undefined) ?? []}
        fieldName={field.name}
        targetNames={targetNames}
        sourceNames={condFields}
        onChange={(next) => set({ reactions: next.length ? next : undefined } as Patch)}
      />
    </>
  );

  // --- Permissions (RBAC) ----------------------------------------------------
  const permissions = (
    <>
      <Form.Item label="View roles (comma-separated)">
        <Input
          value={csv(field.permissions?.viewRoles)}
          onChange={(e) => {
            const viewRoles = parseCsv(e.target.value);
            set({
              permissions: mergePermissions(field, {
                viewRoles: viewRoles.length ? viewRoles : undefined,
              }),
            });
          }}
        />
      </Form.Item>
      <Form.Item label="Edit roles (comma-separated)">
        <Input
          value={csv(field.permissions?.editRoles)}
          onChange={(e) => {
            const editRoles = parseCsv(e.target.value);
            set({
              permissions: mergePermissions(field, {
                editRoles: editRoles.length ? editRoles : undefined,
              }),
            });
          }}
        />
      </Form.Item>
    </>
  );

  // --- Section assembly + G3 search/pin --------------------------------------
  // Section bodies above are unchanged; here they become a descriptor list so the panel
  // can be searched (by label/keyword) and individual sections pinned to the top.
  const sections: { key: PanelSectionKey; children: ReactNode }[] = [
    { key: "basic", children: basic },
    { key: "props", children: properties },
    // ValidationEditor renders nothing for arrays (no field-level rules), so the panel is
    // only offered for leaves.
    ...(isArray
      ? []
      : [
          {
            key: "validation" as const,
            children: <ValidationEditor field={field} siblingNames={condFields} set={set} />,
          },
        ]),
    { key: "layout", children: layout },
    { key: "logic", children: logic },
    { key: "permissions", children: permissions },
  ];

  const [query, setQuery] = useState("");
  const [openKeys, setOpenKeys] = useState<string[]>(DEFAULT_OPEN);
  const { isPinned, toggle } = usePins(PINNED_SECTIONS_KEY);

  const q = query.trim().toLowerCase();
  const visible = sections
    .filter((s) => sectionMatches(s.key, q))
    // Pinned sections float to the top; order is otherwise stable.
    .sort((a, b) => Number(isPinned(b.key)) - Number(isPinned(a.key)));
  // While searching, expand every match; otherwise honour the user's open/collapse state.
  const activeKey = q ? visible.map((s) => s.key) : openKeys;

  return (
    <Form layout="vertical" size="small">
      <Input
        allowClear
        size="small"
        placeholder="Search settings"
        prefix={<SearchOutlined />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <Collapse
        size="small"
        activeKey={activeKey}
        onChange={(keys) => setOpenKeys(Array.isArray(keys) ? keys : [keys])}
        items={visible.map((s) => {
          const label = SECTION_LABELS[s.key];
          const pinned = isPinned(s.key);
          return {
            key: s.key,
            label,
            children: s.children,
            extra: (
              <Button
                type="text"
                size="small"
                aria-label={pinned ? `Unpin "${label}"` : `Pin "${label}"`}
                title={pinned ? `Unpin "${label}"` : `Pin "${label}"`}
                icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(s.key);
                }}
              />
            ),
          };
        })}
      />
    </Form>
  );
}
