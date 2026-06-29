import { childrenOf, type FieldNode, type FormSchema, isLayoutContainer } from "@org/form-schema";

/**
 * Field-level diff between two form bodies (FB1b) — used to show "what changed since a published
 * version" and to drive the editor's content-based draft-ahead badge. PURE: no fetch, no state.
 *
 * Forms are flattened to a `path -> leaf field` map. Layout containers are value-transparent, so
 * their children keep the parent path; an `array` nests its rows, so its item fields are keyed under
 * `name[].child`. `display-text` carries no value and is ignored (mirrors the runtime walk in
 * form-core's `buildZodSchema`). Comparison is by path: present only in `next` ⇒ added, only in
 * `base` ⇒ removed, in both but not deep-equal ⇒ changed (with the differing top-level prop keys).
 */

/** A leaf field located at a flattened path (e.g. `email`, `items[].qty`). */
export interface FieldRef {
  path: string;
  /** The field's `type` (e.g. `text`, `select`) — for a readable label. */
  type: string;
  /** The field's authored label, when it has one. */
  label?: string;
}

/** A leaf present in both forms whose definition changed. */
export interface ChangedField extends FieldRef {
  /** Top-level prop keys that differ between base and next (e.g. `required`, `label`, `options`). */
  changedKeys: string[];
}

export interface FormDiff {
  added: FieldRef[];
  removed: FieldRef[];
  changed: ChangedField[];
}

/** Flatten a form to `path -> leaf node`, skipping value-less display nodes. */
function flattenLeaves(form: FormSchema): Map<string, FieldNode> {
  const out = new Map<string, FieldNode>();
  const walk = (nodes: FieldNode[], prefix: string): void => {
    for (const node of nodes) {
      if (isLayoutContainer(node)) {
        walk(childrenOf(node) ?? [], prefix); // transparent: children share the parent path
        continue;
      }
      if (node.type === "array") {
        walk(childrenOf(node) ?? [], `${prefix}${node.name}[].`);
        continue;
      }
      if (node.type === "display-text") continue; // value-less, not a data field
      out.set(`${prefix}${node.name}`, node);
    }
  };
  walk(form.fields, "");
  return out;
}

function ref(path: string, node: FieldNode): FieldRef {
  const label = "label" in node && typeof node.label === "string" ? node.label : undefined;
  return label ? { path, type: node.type, label } : { path, type: node.type };
}

/** Top-level prop keys that differ between two leaf nodes (deep-equal per value via JSON). */
function diffKeys(a: FieldNode, b: FieldNode): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: string[] = [];
  for (const k of keys) {
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) changed.push(k);
  }
  return changed;
}

/** Diff two form bodies at the field level. `base` is the older snapshot (e.g. a published version),
 *  `next` the newer one (e.g. the current draft). */
export function diffForms(base: FormSchema, next: FormSchema): FormDiff {
  const baseLeaves = flattenLeaves(base);
  const nextLeaves = flattenLeaves(next);
  const added: FieldRef[] = [];
  const removed: FieldRef[] = [];
  const changed: ChangedField[] = [];

  for (const [path, node] of nextLeaves) {
    const before = baseLeaves.get(path);
    if (!before) {
      added.push(ref(path, node));
      continue;
    }
    const keys = diffKeys(before, node);
    if (keys.length > 0) changed.push({ ...ref(path, node), changedKeys: keys });
  }
  for (const [path, node] of baseLeaves) {
    if (!nextLeaves.has(path)) removed.push(ref(path, node));
  }
  return { added, removed, changed };
}

/** True when two form bodies differ at the field level (drives the draft-ahead badge). */
export function hasFormChanges(diff: FormDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}
