---
"@org/workflow-core": patch
---

`advance()` accepts `ctx.actor` and stamps it on the history entry it appends
(product roadmap Phase E work-order tracking).

The key is written **only** when an actor is supplied, so callers that don't
identify one produce byte-identical history to before — no behavior change and
no fixture churn. The engine stays pure: it records who was passed in, it never
resolves or authorizes an identity.
