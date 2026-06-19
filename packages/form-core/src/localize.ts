import { childrenOf, type FieldNode, type FormSchema } from "@org/form-schema";

/**
 * Resolve a form's per-node `i18n` overrides for ONE locale. Every translated text
 * attribute — leaf `label`/`placeholder`/`helpText`/`tooltip`/`extra`, container
 * `label`/`title`/`description`, `display-text` `content`, option `label`s and the form
 * `title` — is replaced by its value for `locale`, falling back to `fallbackLocale` and
 * then the authored default string. Returns a DEEP CLONE whose strings are plain (the
 * `i18n` maps are resolved away), so every downstream consumer (renderers, value walks)
 * reads localized strings with no further work and the resolved type stays string-typed.
 *
 * Purely declarative — NEVER eval. A form with no `i18n` (or no override for `locale`)
 * round-trips unchanged, so calling this is a no-op for non-localized forms.
 */
export function localizeForm(
  form: FormSchema,
  locale: string,
  fallbackLocale?: string,
): FormSchema {
  const clone: FormSchema = structuredClone(form);
  const pick = (by: Record<string, string> | undefined): string | undefined =>
    by ? (by[locale] ?? (fallbackLocale ? by[fallbackLocale] : undefined)) : undefined;

  // Form-level text (currently `title`).
  applyNodeI18n(clone as unknown as Record<string, unknown>, pick);

  const walk = (nodes: FieldNode[]): void => {
    for (const node of nodes) {
      const record = node as unknown as Record<string, unknown>;
      applyNodeI18n(record, pick);
      localizeOptions(record, pick);
      // childrenOf descends container `children` AND array `itemFields` (the row template).
      const kids = childrenOf(node);
      if (kids) walk(kids);
    }
  };
  walk(clone.fields);
  return clone;
}

type Pick = (by: Record<string, string> | undefined) => string | undefined;

/** Override a node's own text attributes from its `i18n` map, then strip the map. */
function applyNodeI18n(node: Record<string, unknown>, pick: Pick): void {
  const i18n = node.i18n as Record<string, Record<string, string>> | undefined;
  if (!i18n) return;
  for (const [attr, byLocale] of Object.entries(i18n)) {
    const translated = pick(byLocale);
    if (translated !== undefined) node[attr] = translated;
  }
  delete node.i18n;
}

/** Override each static option's `label` from its per-option `i18n` map, then strip it. */
function localizeOptions(node: Record<string, unknown>, pick: Pick): void {
  const options = node.options;
  if (!Array.isArray(options)) return;
  for (const opt of options) {
    if (opt && typeof opt === "object") {
      const o = opt as Record<string, unknown>;
      const translated = pick(o.i18n as Record<string, string> | undefined);
      if (translated !== undefined) o.label = translated;
      delete o.i18n;
    }
  }
}
