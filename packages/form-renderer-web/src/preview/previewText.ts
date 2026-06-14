import type { ReactionOption } from "@org/form-core";
import type { LeafField, TreeOption } from "@org/form-schema";

/** Depth-first label lookup in a tree of options. Flat lists (ReactionOption[],
 *  remote DataSourceOption[]) are just childless trees, so they share it. */
export function findTreeLabel(opts: readonly TreeOption[], value: unknown): string | undefined {
  for (const o of opts) {
    if (o.value === value) return o.label;
    if (o.children) {
      const hit = findTreeLabel(o.children, value);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** Format a leaf's value as plain read text (Formily's PreviewText). Used by `readPretty`
 *  mode and as the readOnly fallback for controls antd can't render read-only. */
export function previewText(
  node: LeafField,
  value: unknown,
  optionsOverride?: ReactionOption[],
): string {
  if (value == null || value === "") {
    // A boolean false is a real value (Yes/No), not "empty".
    if (typeof value !== "boolean") return "—";
  }
  switch (node.type) {
    case "password":
      return "••••••";
    case "checkbox":
    case "switch":
      return value ? "Yes" : "No";
    case "select":
    case "radio":
    case "checkbox-group": {
      const opts = optionsOverride ?? ("options" in node ? (node.options ?? []) : []);
      const label = (v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v);
      return Array.isArray(value) ? value.map(label).join(", ") : label(value);
    }
    case "cascader": {
      // The value is a root→leaf path; resolve each segment's label one tree
      // level at a time (remote-only options fall back to the raw segment).
      const path = Array.isArray(value) ? value : [];
      if (!path.length) return "—";
      let level: readonly TreeOption[] = optionsOverride ?? node.options ?? [];
      const labels = path.map((seg) => {
        const hit = level.find((o) => o.value === seg);
        level = hit?.children ?? [];
        return hit?.label ?? String(seg);
      });
      return labels.join(" / ");
    }
    case "tree-select": {
      const opts: readonly TreeOption[] = optionsOverride ?? node.options ?? [];
      const label = (v: unknown) => findTreeLabel(opts, v) ?? String(v);
      return Array.isArray(value) ? value.map(label).join(", ") : label(value);
    }
    case "upload": {
      const files = (value as Array<{ name?: string }> | undefined) ?? [];
      return files.length ? files.map((f) => f.name ?? "file").join(", ") : "—";
    }
    case "date":
    case "time": {
      const fmt = node.type === "date" ? "YYYY-MM-DD" : "HH:mm:ss";
      const v = value as { format?: (f: string) => string } | null;
      return v && typeof v.format === "function" ? v.format(fmt) : String(value);
    }
    case "date-range":
    case "time-range": {
      const fmt = node.type === "date-range" ? "YYYY-MM-DD" : "HH:mm:ss";
      const ends = Array.isArray(value) ? value : [];
      const end = (v: unknown) => {
        if (v == null) return "—";
        const d = v as { format?: (f: string) => string };
        return typeof d.format === "function" ? d.format(fmt) : String(v);
      };
      return `${end(ends[0])} ~ ${end(ends[1])}`;
    }
    default:
      return String(value);
  }
}
