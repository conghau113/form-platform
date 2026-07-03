# ADR-0014: Additive schema evolution & formVersion decoupling

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; the decision predates ADR practice and was in force from the founding of `form-schema` (origin commit in Evidence).
- **Deciders:** Owner
- **Source:** AGENTS.md "Architecture (non-negotiable)" + `packages/form-schema` code; memory note `form-platform-additive-schema-rule`.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

The JSON form schema is the product's central contract: one schema drives many
renderers, and saved forms are durable data that outlives any single package
release. `packages/form-schema` owns `CURRENT_FORM_VERSION` (a data-shape version
number, currently `3`) and a migration chain, both decoupled from the npm package
version. This constraint governs every change to the schema shape.

## Decision

The form JSON contract evolves **additively and versioned**, never destructively:

- `formVersion` is the data-shape version and is **decoupled from the npm package
  version.** Changing the JSON shape requires three things together: bump
  `CURRENT_FORM_VERSION`, add a migration `N → N+1`, and add a test that migrates
  an old fixture up to the current shape.
- **Older saved JSON must never break.** `migrate()` upgrades any supported older
  version to the current shape before validation; a document newer than the
  renderer supports is rejected with a clear "upgrade your renderer" error.
- Renderer changes must be **additive** — older schema versions keep rendering.
- Runtime/governance envelopes that carry a form (e.g. `FormVersion`, `Submission`,
  `Preset`) are decoupled from `CURRENT_FORM_VERSION`: their envelope can grow
  without triggering a form migration.

## Rationale

The *why* is the hazard the version number exists to prevent: a form authored today
may be submitted years from now, so a shape change that silently invalidated old JSON
would corrupt real user data with no recovery path. Coupling the data version to the
package version would force a data migration on every unrelated code release and make
"which shapes are readable" impossible to reason about. The migration-chain-plus-test
requirement makes backward compatibility a *mechanically enforced* property (an old
fixture must still migrate green) rather than a promise — which is exactly what a
contract consumed by multiple independent renderers needs. A future session that
"simplified" the schema by dropping a field or renaming it in place, without a
migration, would break every stored form silently; recording this rationale is the
guard against that.

## Evidence

- `packages/form-schema/src/schema.ts:9` — `export const CURRENT_FORM_VERSION = 3 as const`.
- `packages/form-schema/src/migrate.ts:13-64` — the migration chain (v1→v2 `colSpanDesktop`
  → `layout.colSpan.lg`; v2→v3 `show:false` → `visibleWhen`), the "package version and data
  version are deliberately decoupled" comment, and the newer-than-supported guard (lines 52-57).
- `packages/form-schema/src/form-version.ts:4-14` — `FormVersion` "decoupled from
  `CURRENT_FORM_VERSION` (its envelope can grow without a form migration)".
- AGENTS.md, "Architecture (non-negotiable)": "`formVersion` is decoupled from the npm
  package version. Changing the JSON shape requires: bump `CURRENT_FORM_VERSION` + add a
  migration N->N+1 + a test that migrates an old fixture to current. NEVER break older saved
  JSON." + Conventions: "Renderer changes must be ADDITIVE — older schema versions keep rendering."
- Origin commit: `180d921` *feat(form-schema): versioned contract, migrations, textarea field + tests*.
- Tests enforcing it live in `packages/form-schema/src/migrate.test.ts`.
