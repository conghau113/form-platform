import type { FieldNode } from "@org/form-schema";
import { describeNode } from "./queries";
import type { FieldType } from "./types";

/** A schema `name` unique within the model, numbered from the type (text1, text2, …). */
function seedName(type: FieldType, taken: ReadonlySet<string>): string {
  let i = 1;
  let name = `${type}${i}`;
  while (taken.has(name)) {
    i += 1;
    name = `${type}${i}`;
  }
  return name;
}

/** Build a valid, minimal node of the given type. Seed props come from the registry
 *  meta, so adding a type needs no edit here. Named types (leaves + array + group) get a
 *  unique `name` and the registry label; nameless containers seed `children: []` only.
 *  An optional `patch` (from a palette variant/preset) merges extra default props after
 *  the meta defaults — it can override `label` but never the generated `name`.
 *  The cast trusts the meta's `defaults`; field-registry.test.ts guards it by parsing
 *  every seeded node against the contract. */
export function newField(
  type: FieldType,
  taken: ReadonlySet<string> = new Set(),
  patch?: Record<string, unknown>,
): FieldNode {
  const meta = describeNode(type);
  const seed: Record<string, unknown> = { type, ...meta.defaults, ...patch };
  if (meta.named) {
    seed.name = seedName(type, taken);
    if (seed.label == null) seed.label = meta.label;
  }
  return seed as FieldNode;
}
