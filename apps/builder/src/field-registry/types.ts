import type { FieldNode, ValidationRule } from "@org/form-schema";

/**
 * Meta-driven component registry (v2) — the single source of truth the builder uses
 * to author every node. Each entry declares how a type appears in the palette, how a
 * fresh node is seeded, which type-specific settings the property panel shows, how its
 * default value is edited, AND its designer BEHAVIOR (drag/drop/clone/delete + which
 * children it accepts). Palette, model factories, the property panel and the tree-engine
 * insert guard all derive from this list instead of hard-coding per-type branches — the
 * same idea as Formily/Designable's component registry (`createBehavior`/`createResource`),
 * kept on top of our Zod contract rather than replacing it.
 */

/** Every FieldNode type the contract knows (leaves + array + containers). */
export type FieldType = FieldNode["type"];
/** A node type the designer tree can hold, including the root `form` node. */
export type NodeType = FieldType | "form";

/** A control kind the property panel knows how to render for a setting. This is our
 *  analogue of Designable's setter vocabulary (`@designable/react-settings-form`), kept
 *  to a typed, form-relevant subset:
 *  - `text`/`number`/`checkbox`  : the primitive inputs
 *  - `select`/`segmented`        : a single choice from `choices` (segmented = inline
 *                                  buttons, best for 2–4 short enums like size/variant)
 *  - `slider`                    : a bounded numeric (`min`/`max`/`step`)
 *  - `options`                   : the static option-list editor (select/radio choices) */
export type SettingControl =
  | "text"
  | "number"
  | "checkbox"
  | "options"
  | "select"
  | "segmented"
  | "slider";

/** One choice for a `select` / `segmented` setting control. */
export interface SettingChoice {
  label: string;
  value: string;
}

/** One type-specific setting, e.g. a select's `options` or a grid's `cols`. */
export interface SettingDescriptor {
  /** Property key on the node this setting reads/writes. */
  key: string;
  label: string;
  control: SettingControl;
  /** Choices for `control: "select"` / `"segmented"`. */
  choices?: SettingChoice[];
  /** Numeric bounds for `control: "slider"` (also honored by `"number"`). */
  min?: number;
  max?: number;
  step?: number;
}

/** How the shared "Default value" editor renders for this type. */
export type DefaultValueKind = "text" | "number" | "boolean" | "none";

/** A validation rule kind, mirrored from the schema contract. */
export type ValidationRuleType = ValidationRule["type"];

/** Designer interaction rules for a node type (mirrors Designable's behavior flags). */
export interface ComponentBehavior {
  /** Can other nodes be dropped INTO this node (it has a children slot)? */
  droppable: boolean;
  /** Can this node itself be dragged on the canvas? */
  draggable: boolean;
  /** Can this node be copy/pasted? */
  cloneable: boolean;
  /** Can this node be deleted? (the root `form` cannot). */
  deletable: boolean;
  /** When set, restricts which child types this node accepts (e.g. tabs ⇒ tab-pane). */
  allowAppend?: (parentType: NodeType, childType: NodeType) => boolean;
  /** When set, this node may only be inserted under one of these parent types
   *  (e.g. tab-pane ⇒ ["tabs"]). */
  allowParents?: NodeType[];
}

export interface FieldDescriptor {
  type: NodeType;
  label: string;
  /** Palette grouping header. */
  category: string;
  /** Extra props (beyond type/name/label) a freshly dropped node starts with. */
  defaults: Record<string, unknown>;
  /** Type-specific settings rendered in the property panel. */
  settings: SettingDescriptor[];
  defaultValueKind: DefaultValueKind;
  /** Validation rule kinds the panel offers for this type. Omitted/empty hides the
   *  Validation section (the type has no meaningful field-level rules to add). */
  validations?: ValidationRuleType[];
}

/** One palette chip for a type that exposes several authoring presets of itself (e.g.
 *  `array` → list/cards/table, `upload` → button/dragger). Each variant seeds the SAME
 *  schema `type` plus a small `patch` of default props. This is the minimal, in-app seed
 *  of the future preset system (Track P): a preset is a richer, persisted variant. */
export interface PaletteVariant {
  /** Stable suffix for the palette id/key (e.g. "card" ⇒ id "array:card"). */
  id: string;
  label: string;
  /** One-line palette tooltip; falls back to the type's hint when absent. */
  hint?: string;
  /** Extra default props merged into the freshly seeded node (e.g. `{ variant: "table" }`). */
  patch: Record<string, unknown>;
}

/** A full component meta: a {@link FieldDescriptor} plus designer behavior. */
export interface ComponentMeta extends FieldDescriptor {
  behavior: ComponentBehavior;
  /** Optional palette/outline icon (emoji or glyph). */
  icon?: string;
  /** Whether the palette offers this type. Containers stay false until Phase E. */
  showInPalette: boolean;
  /** When set, the palette renders one chip PER variant instead of a single type chip
   *  (still one schema `type`). The drag seeds `newField(type) + variant.patch`. */
  paletteVariants?: PaletteVariant[];
  /** Whether the node carries a schema `name` (value-bearing). Containers are nameless. */
  named: boolean;
}

/** A single palette chip the UI renders: a type to seed plus an optional default-prop
 *  patch (from a {@link PaletteVariant}). Plain types expand to one entry with no patch. */
export interface PaletteEntry {
  /** Stable id (React key + drag identity): the type, or `type:variantId`. */
  id: string;
  type: FieldType;
  label: string;
  category: string;
  hint?: string;
  /** Extra default props the drop merges into the seeded node. */
  patch?: Record<string, unknown>;
}
