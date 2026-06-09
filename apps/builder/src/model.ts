import { CURRENT_FORM_VERSION, type FormSchema, type LeafField, migrate } from "@org/form-schema";

/** The leaf field types the palette can author. `group` is intentionally excluded
 *  from visual authoring in this phase. */
export const FIELD_TYPES = ["text", "textarea", "number", "select", "date", "checkbox"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  select: "Select",
  date: "Date",
  checkbox: "Checkbox",
};

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPE_LABELS[type];
}

/**
 * The editor's working model. `uid` is a stable id used ONLY by dnd-kit and React
 * keys — it never enters the schema. Conversion to/from `FormSchema` happens at the
 * boundary (toFormSchema / fromFormSchema), keeping dnd-kit internals out of the contract.
 */
export interface EditorField {
  uid: string;
  field: LeafField;
}

export interface EditorModel {
  id: string;
  title: string;
  fields: EditorField[];
}

let uidCounter = 0;
/** Monotonic, collision-free id for dnd-kit + React keys (not persisted). */
export function makeUid(): string {
  uidCounter += 1;
  return `f${uidCounter}`;
}

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

/** Build a valid, minimal leaf field of the given type with a unique name. */
export function newField(type: FieldType, taken: ReadonlySet<string> = new Set()): LeafField {
  const name = uniqueName(type, taken);
  const label = fieldTypeLabel(type);
  switch (type) {
    case "select":
      return { type, name, label, options: [] };
    default:
      return { type, name, label };
  }
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
      .filter((f): f is LeafField => f.type !== "group")
      .map((field) => ({ uid: makeUid(), field })),
  };
}

// --- Pure mutators (drag handlers + property panel call these) ---------------

/** Insert a new field of `type` at `index` (clamped; appends when out of range). */
export function insertField(model: EditorModel, type: FieldType, index: number): EditorModel {
  const field = newField(type, takenNames(model));
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
  patch: Partial<LeafField>,
): EditorModel {
  return {
    ...model,
    fields: model.fields.map((f) =>
      f.uid === uid ? { uid, field: { ...f.field, ...patch } as LeafField } : f,
    ),
  };
}

/** Remove the field at `uid`. */
export function removeField(model: EditorModel, uid: string): EditorModel {
  return { ...model, fields: model.fields.filter((f) => f.uid !== uid) };
}
