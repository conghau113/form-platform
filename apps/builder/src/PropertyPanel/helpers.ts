import type { FieldNode } from "@org/form-schema";
import type { AuthoredField } from "./types";

/** Identity accessors tolerant of nameless layout containers (tabs/card/...)
 *  that can appear in loaded JSON among item fields. */
export function nodeName(node: FieldNode): string | undefined {
  return "name" in node ? node.name : undefined;
}
export function nodeLabel(node: FieldNode): string | undefined {
  if ("label" in node && node.label) return node.label;
  if ("title" in node && node.title) return node.title;
  return undefined;
}

export function csv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}
export function parseCsv(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read a dynamic property off a node without widening its type to `any`. */
export function prop(field: FieldNode, key: string): unknown {
  return (field as Record<string, unknown>)[key];
}

/** Merge a permissions patch, dropping the object entirely when it becomes empty. */
export function mergePermissions(
  field: AuthoredField,
  patch: { viewRoles?: string[]; editRoles?: string[] },
): AuthoredField["permissions"] {
  const next = { ...field.permissions, ...patch };
  if (!next.viewRoles) delete next.viewRoles;
  if (!next.editRoles) delete next.editRoles;
  return Object.keys(next).length ? next : undefined;
}
