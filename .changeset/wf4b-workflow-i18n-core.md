---
"@org/workflow-core": minor
---

Add `localizeWorkflow(def, locale, fallbackLocale?)` (WF4b), the mirror of form-core's
`localizeForm`. It deep-clones a workflow definition and resolves the `i18n` overrides for one
locale — the definition `title` and each node's `status` label — falling back to `fallbackLocale`
then the authored default, and stripping the `i18n` maps. IDENTIFIERS ARE NEVER TOUCHED: `node.id`
and `transition.action` are left as-is (`action` is the event the engine matches on); a transition's
action display label is resolved at the call site. Purely declarative (never eval); a definition
with no `i18n` round-trips unchanged.
