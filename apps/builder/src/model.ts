import {
  type ArrayField,
  CURRENT_FORM_VERSION,
  type FieldNode,
  type FormSchema,
  type LeafField,
  migrate,
} from "@org/form-schema";
import { makeUid } from "./engine/uid";
import { describeNode, type FieldType } from "./field-registry";

/** What the flat builder canvas can hold: any leaf field plus an `array` (Form List)
 *  container. `group` is still excluded from visual authoring (Phase D). */
export type AuthoredField = LeafField | ArrayField;

// The authorable field types, their labels and palette grouping live in the
// meta-driven field registry. `group` is intentionally excluded from visual
// authoring in this phase.
export { FIELD_TYPES, type FieldType, fieldTypeLabel } from "./field-registry";

/**
 * The editor's working model. `uid` is a stable id used ONLY by dnd-kit and React
 * keys — it never enters the schema. Conversion to/from `FormSchema` happens at the
 * boundary (toFormSchema / fromFormSchema), keeping dnd-kit internals out of the contract.
 */
export interface EditorField {
  uid: string;
  field: AuthoredField;
}

export interface EditorModel {
  id: string;
  title: string;
  fields: EditorField[];
}

// Moved to the designer engine; re-exported here until the D7b integration
// removes the flat model entirely.
export { makeUid };

/** A schema `name` unique within the model, derived from the field type. */
function uniqueName(type: FieldType, taken: ReadonlySet<string>): string {
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
 *  The cast trusts the meta's `defaults`; field-registry.test.ts guards it by parsing
 *  every seeded node against the contract. */
export function newField(type: FieldType, taken: ReadonlySet<string> = new Set()): FieldNode {
  const meta = describeNode(type);
  const seed: Record<string, unknown> = { type, ...meta.defaults };
  if (meta.named) {
    seed.name = uniqueName(type, taken);
    seed.label = meta.label;
  }
  return seed as FieldNode;
}

function takenNames(model: EditorModel, except?: string): Set<string> {
  const set = new Set<string>();
  for (const f of model.fields) {
    if (f.uid !== except) set.add(f.field.name);
  }
  return set;
}

/** Editor model -> the versioned JSON contract. The single conversion boundary. */
export function toFormSchema(model: EditorModel): FormSchema {
  return {
    formVersion: CURRENT_FORM_VERSION,
    id: model.id,
    title: model.title,
    fields: model.fields.map((f) => f.field),
  };
}

/** Raw saved JSON (any version) -> editor model. Migrates first, keeps leaf fields. */
export function fromFormSchema(raw: unknown): EditorModel {
  const form = migrate(raw);
  return {
    id: form.id,
    title: form.title,
    fields: form.fields
      // Keep leaf fields and `array` containers; `group` stays non-authorable (Phase D).
      .filter((f): f is AuthoredField => f.type !== "group")
      .map((field) => ({ uid: makeUid(), field })),
  };
}

// --- Pure mutators (drag handlers + property panel call these) ---------------

/** Insert a new field of `type` at `index` (clamped; appends when out of range). */
export function insertField(model: EditorModel, type: FieldType, index: number): EditorModel {
  // The flat canvas only drags palette-visible (authorable leaf/array) types, so the
  // seeded node is always an AuthoredField. The tree engine (D7b) drops this cast.
  const field = newField(type, takenNames(model)) as AuthoredField;
  const at = Math.max(0, Math.min(index, model.fields.length));
  const fields = model.fields.slice();
  fields.splice(at, 0, { uid: makeUid(), field });
  return { ...model, fields };
}

/** Move the field with `fromUid` to the position of `toUid` (reorder). */
export function moveField(model: EditorModel, fromUid: string, toUid: string): EditorModel {
  if (fromUid === toUid) return model;
  const from = model.fields.findIndex((f) => f.uid === fromUid);
  const to = model.fields.findIndex((f) => f.uid === toUid);
  if (from === -1 || to === -1) return model;
  const fields = model.fields.slice();
  const [moved] = fields.splice(from, 1);
  fields.splice(to, 0, moved);
  return { ...model, fields };
}

/** Replace the field at `uid` with a patched copy. The patch is merged shallowly. */
export function updateField(
  model: EditorModel,
  uid: string,
  patch: Partial<AuthoredField>,
): EditorModel {
  return {
    ...model,
    fields: model.fields.map((f) =>
      f.uid === uid ? { uid, field: { ...f.field, ...patch } as AuthoredField } : f,
    ),
  };
}

/** Remove the field at `uid`. */
export function removeField(model: EditorModel, uid: string): EditorModel {
  return { ...model, fields: model.fields.filter((f) => f.uid !== uid) };
}
