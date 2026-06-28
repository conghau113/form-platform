import type { WorkflowDefinition } from "@org/workflow-schema";

/**
 * Resolve a workflow's per-node / definition `i18n` overrides for ONE locale. The mirror of
 * form-core's `localizeForm`: the definition `title` and each node's `status` label are replaced
 * by their value for `locale` (falling back to `fallbackLocale`, then the authored default), and
 * the `i18n` maps are stripped. Returns a DEEP CLONE so downstream consumers read localized
 * strings with no further work.
 *
 * IDENTIFIERS ARE NEVER TOUCHED — like `localizeForm` leaving option `value` / field `name`, this
 * leaves `node.id` and `transition.action` alone (`action` is the event the engine matches on).
 * Transition display LABELS are resolved separately at the call site, since `action` is dual-purpose
 * and must stay the raw identifier here. `defaultLocale` / `locales` are preserved.
 *
 * Purely declarative — NEVER eval. A definition with no `i18n` (or no override for `locale`)
 * round-trips unchanged, so calling this is a no-op for non-localized workflows.
 */
export function localizeWorkflow(
  def: WorkflowDefinition,
  locale: string,
  fallbackLocale?: string,
): WorkflowDefinition {
  const clone: WorkflowDefinition = structuredClone(def);
  const pick = (by: Record<string, string> | undefined): string | undefined =>
    by ? (by[locale] ?? (fallbackLocale ? by[fallbackLocale] : undefined)) : undefined;

  // Definition-level text (currently `title`).
  applyI18n(clone as unknown as Record<string, unknown>, pick);
  // Node `status` labels. Transitions are intentionally left untouched (see the doc comment).
  for (const node of clone.nodes) {
    applyI18n(node as unknown as Record<string, unknown>, pick);
  }
  return clone;
}

type Pick = (by: Record<string, string> | undefined) => string | undefined;

/** Override an object's own text attributes from its `i18n` map, then strip the map. */
function applyI18n(obj: Record<string, unknown>, pick: Pick): void {
  const i18n = obj.i18n as Record<string, Record<string, string>> | undefined;
  if (!i18n) return;
  for (const [attr, byLocale] of Object.entries(i18n)) {
    const translated = pick(byLocale);
    if (translated !== undefined) obj[attr] = translated;
  }
  delete obj.i18n;
}
