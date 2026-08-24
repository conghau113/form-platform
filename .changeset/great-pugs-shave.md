---
"@org/workflow-schema": patch
"@org/workflow-core": patch
---

Workflow contract: parallel-flow gateways and the marking a case stands on

A node may now carry `gateway: "fork" | "join"`, and a running instance may carry `tokens` (every
place the case currently stands) plus `scopes` (the fork run each token came from). `current` stays
required and is still written on every save, so a build that predates this keeps reading it and
working — read the marking through the new `readMarking(instance)` in `@org/workflow-core`, which
reports the single token at `current` for a case written before `tokens` existed.

Additive: every definition and instance this system has written parses unchanged, so
`CURRENT_WORKFLOW_VERSION` does not move and no migration is needed. (Strictly, a hand-written
definition that already carried a `gateway` key holding something other than `"fork"`/`"join"` used
to be accepted with the key silently dropped and now fails to parse — every write path validates
before storing, so nothing stored can be in that state.)

⚠️ This release adds the contract only; the engine that executes it lands in the same release (see
the E3a entry). Because the primitive catalog is rendered straight into the workflow-authoring system
prompt, its `gateway` entry tells the model NOT to emit one — still true after E3a and E4, for a
reason that has now changed twice: malformed gateways ARE rejected at save time as of E4, but the
editor still has no gateway authoring UI, so a workflow the model writes one into cannot be edited
afterwards.
