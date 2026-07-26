/** The translatable string attributes a node can carry, in display order, with a
 *  human label for the Translations editor. A node only ever has a few of these
 *  (a leaf has `label`/`placeholder`/…, a container `label`/`title`/…, display-text
 *  `content`), so we filter to the ones that actually hold an authored string. */
const TRANSLATABLE_ATTRS: { attr: string; label: string }[] = [
  { attr: "label", label: "Nhãn" },
  { attr: "title", label: "Tiêu đề" },
  { attr: "description", label: "Mô tả" },
  { attr: "placeholder", label: "Chữ gợi ý" },
  { attr: "helpText", label: "Văn bản trợ giúp" },
  { attr: "tooltip", label: "Chú thích" },
  { attr: "extra", label: "Gợi ý thêm" },
  { attr: "content", label: "Nội dung" },
];

export interface TranslatableAttr {
  /** The node property to translate (e.g. `label`). */
  attr: string;
  /** Human label shown in the editor. */
  label: string;
  /** The authored default string (the implicit default-locale value). */
  value: string;
}

/** List the translatable attributes of a node that currently hold a non-empty
 *  authored string — the rows the Translations editor should offer. Pure. Works
 *  for any node shape (leaf, container, display-text) and the form root (`title`). */
export function translatableAttrs(node: Record<string, unknown>): TranslatableAttr[] {
  const out: TranslatableAttr[] = [];
  for (const { attr, label } of TRANSLATABLE_ATTRS) {
    const value = node[attr];
    if (typeof value === "string" && value.length > 0) out.push({ attr, label, value });
  }
  return out;
}
