import type { TreeOption } from "@org/form-schema";
import { Button, Input, Space } from "antd";
import type { ReactNode } from "react";
import { TranslatePopover } from "../PropertyPanel/TranslatePopover";

type Path = number[];

/** Rebuild the tree with `fn` applied to the node at `path`; returning null removes
 *  the node (with its subtree). Pure — only nodes along the path are recreated. */
function updateAt(
  options: TreeOption[],
  path: Path,
  fn: (node: TreeOption) => TreeOption | null,
): TreeOption[] {
  const [head, ...rest] = path;
  return options.flatMap((o, i) => {
    if (i !== head) return [o];
    if (rest.length === 0) {
      const next = fn(o);
      return next ? [next] : [];
    }
    return [{ ...o, children: updateAt(o.children ?? [], rest, fn) }];
  });
}

/** Inline recursive editor for cascader / tree-select options. Each row edits one
 *  tree node (label/value), indented per depth, with "+ child" growing a nested
 *  level and ✕ removing the node and its subtree. Mirrors OptionsEditor's flat UI. */
export function TreeOptionsEditor({
  options,
  locales,
  onChange,
}: {
  options: TreeOption[];
  /** Extra locales configured on the form; when non-empty each node gets a translate button. */
  locales?: string[];
  onChange: (options: TreeOption[]) => void;
}) {
  const patch = (path: Path, p: Partial<TreeOption>) =>
    onChange(updateAt(options, path, (o) => ({ ...o, ...p })));
  const remove = (path: Path) => onChange(updateAt(options, path, () => null));
  const addChild = (path: Path) =>
    onChange(
      updateAt(options, path, (o) => ({
        ...o,
        children: [...(o.children ?? []), { label: "", value: "" }],
      })),
    );

  const rows = (opts: TreeOption[], base: Path): ReactNode =>
    opts.map((opt, i) => {
      const path = [...base, i];
      return (
        <div key={path.join(".")} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Space style={{ marginLeft: base.length * 16 }}>
            <Input
              placeholder="nhãn"
              value={opt.label}
              onChange={(e) => patch(path, { label: e.target.value })}
              style={{ width: 110 }}
            />
            <Input
              placeholder="giá trị"
              value={String(opt.value)}
              onChange={(e) => patch(path, { value: e.target.value })}
              style={{ width: 90 }}
            />
            <Button size="small" onClick={() => addChild(path)}>
              + con
            </Button>
            <TranslatePopover
              value={opt.label}
              i18n={opt.i18n}
              locales={locales ?? []}
              onChange={(next) => patch(path, { i18n: next })}
            />
            <Button type="text" size="small" danger onClick={() => remove(path)}>
              ✕
            </Button>
          </Space>
          {opt.children?.length ? rows(opt.children, path) : null}
        </div>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows(options, [])}
      <Button size="small" onClick={() => onChange([...options, { label: "", value: "" }])}>
        Thêm tùy chọn
      </Button>
    </div>
  );
}
