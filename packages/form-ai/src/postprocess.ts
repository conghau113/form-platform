import type { FormSchema } from "@org/form-schema";

/**
 * Deterministic clean-ups applied AFTER the draft validates, so a small model
 * slip doesn't produce a technically-valid-but-broken form. Pure: clones the
 * input, never mutates it.
 */

/**
 * Ensure every node `name` is unique across the whole tree. Duplicate names
 * collide in the submitted object (later fields overwrite earlier ones), so a
 * repeated `email` becomes `email`, `email_2`, `email_3`… The first occurrence
 * keeps its name; subsequent ones get the lowest free `_n` suffix.
 */
export function dedupeFieldNames(form: FormSchema): FormSchema {
  const clone = structuredClone(form);
  const seen = new Set<string>();

  const walk = (nodes: unknown[]): void => {
    for (const node of nodes ?? []) {
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        if (typeof obj.name === "string") {
          let name = obj.name;
          if (seen.has(name)) {
            let i = 2;
            while (seen.has(`${obj.name}_${i}`)) i++;
            name = `${obj.name}_${i}`;
            obj.name = name;
          }
          seen.add(name);
        }
        if (Array.isArray(obj.children)) walk(obj.children);
        if (Array.isArray(obj.itemFields)) walk(obj.itemFields);
      }
    }
  };

  walk(clone.fields);
  return clone;
}
