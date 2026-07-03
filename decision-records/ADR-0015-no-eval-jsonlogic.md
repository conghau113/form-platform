# ADR-0015: Conditional logic via JSONLogic — never eval()/new Function()

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; in force from the founding of `form-core` (origin commit in Evidence).
- **Deciders:** Owner
- **Source:** AGENTS.md "Architecture (non-negotiable)" + `packages/form-core/src/conditions.ts`.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

Forms carry schema-provided expressions — field visibility (`visibleWhen`) and field
linkage (reactions) — that must be evaluated at runtime, on both the front end and the
NestJS back end, and identically across every renderer. Those expressions arrive as
data inside form JSON that may be authored or edited by many parties. `packages/form-core`
owns their evaluation.

## Decision

Schema-provided expressions are **plain JSON data interpreted by JSONLogic**
(`json-logic-js`), through a single choke point in `form-core`. The platform
**never** calls `eval()` or `new Function()` on any schema-provided rule. Every
renderer delegates to the same `form-core` evaluator so visibility and linkage
behave identically everywhere.

## Rationale

The expressions travel as data through the system and are evaluated server-side as well
as in the browser, so treating them as executable code would be a direct
remote-code-execution vector: a crafted rule in a stored form could run arbitrary code on
the API. JSONLogic is a *data* interpreter — it can only evaluate the fixed set of
operators it implements, so a malicious rule can at worst produce a wrong boolean, never
escape into host execution. Routing all evaluation through one function
(`evalRule`) also guarantees a single, consistent semantics across web/native/back end
rather than subtly different behaviors per renderer. This is the kind of constraint a
future session is most likely to "optimize" away — `new Function(rule)` looks faster and
more flexible than a JSONLogic dependency — which is precisely why the security rationale
must be on record, not just the rule.

## Evidence

- `packages/form-core/src/conditions.ts:4-8` — module doc: "SAFE conditional evaluation.
  The rule is plain JSON data interpreted by json-logic-js. We never use eval() /
  new Function() on schema-provided rules."
- `packages/form-core/src/conditions.ts:18-20` — `evalRule` = "The single choke point for
  SAFE rule evaluation … NEVER eval()", delegating to `jsonLogic.apply(rule, values)`.
- AGENTS.md, "Architecture (non-negotiable)": "Conditional logic uses JSONLogic via
  form-core. NEVER eval() / new Function() on schema-provided expressions."
- Enforced-practice check (assumption register, 2026-07-03): zero `eval`/`new Function`
  occurrences in the codebase.
- Origin commit: `2a934d2` *feat(form-core): JSONLogic conditions, RBAC, registry + unit tests*.
