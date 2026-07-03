# ADR-0006: Review scope for deferred surfaces (form-renderer-native and peers)

- **Status:** Accepted (owner, 2026-07-03) — Option A as recommended
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register C4

## Context

`packages/form-renderer-native` is declared "DEFERRED (web first)" in AGENTS.md. Verified
state: 2 source files (`FormRenderer.native.tsx`, `index.ts`), **zero tests**, no `test`
script, but it *is* in the build/typecheck pipeline (has `build`/`typecheck` scripts, so
turbo runs it) and depends on `form-schema`/`form-core`. The renderers cursor-rule and
AGENTS.md still state native conventions (single column, `hideOnMobile`/`mobileOrder`) as
if maintained. Similar dormant surfaces exist at the docs level (superseded trackers).

## Problem

The framework's review workflow must know whether every renderer-affecting change
(schema additions, form-core changes) needs a native-parity consideration. Reviewing
against a surface nobody exercises taxes every review with unverifiable assertions;
ignoring it silently lets the contract drift away from what native could ever implement.

## Constraints

- Golden rule: renderer changes must be additive; the *contract* must remain
  multi-renderer-capable — this holds regardless of whether native is actively reviewed.
- The package still compiles in CI (a hard floor that exists today for free).
- Deleting a package is a product decision, beyond the framework's authority.

## Options

### Option A — Explicitly frozen, with an unfreeze gate
Governance marks the package frozen: reviews do not assess native parity; CI
typecheck/build remains the only guard; any commit touching the package requires an
explicit unfreeze decision (a new ADR or owner sign-off). Docs mentioning native
conventions get a one-line "deferred — conventions preserved for future resumption" marker.

- **Pros:** zero recurring review cost; codifies the reality that has held for months;
  the compile-floor still catches contract breakage; unfreezing is a conscious event.
- **Cons:** contract decisions made web-only for a long period may accumulate
  native-hostile assumptions that surface only at resumption.
- **Affected areas:** governance review-workflow doc; one marker line in AGENTS.md /
  renderers rule.
- **Maintenance cost:** near zero.
- **Migration risk:** none now; a resumption audit later (which exists in every option).

### Option B — Maintained surface
Every schema/form-core/renderer review includes a native-parity check.

- **Pros:** contract stays demonstrably multi-renderer.
- **Cons:** parity claims are unverifiable — there are no native tests and no native app to
  run; reviewers would assert compatibility with a 2-file stub, which is theater; recurring
  cost on every review forever.
- **Maintenance cost:** highest, for assurance that cannot actually be demonstrated.
- **Migration risk:** none.

### Option C — Remove the package until needed
Delete `form-renderer-native`, recreate at resumption.

- **Pros:** honest inventory; less pipeline noise.
- **Cons:** destructive; loses the compile-floor guard (today the stub *does* prove the
  contract types remain consumable outside antd); product-scope decision the framework
  shouldn't make; git history preserves it anyway but resumption friction rises.
- **Migration risk:** the only option with a destructive step.

## Risks

- (A) The real risk is *silent* unfreezing — someone extends the stub without the parity
  machinery existing; the unfreeze gate must be a review-workflow check, not a hope.
- (B) creates systematic false confidence, which is worse than acknowledged absence.
- The multi-renderer *contract* rule is not at stake in any option — it is enforced at the
  schema/form-core level (platform-free packages), not by the stub's existence.

## Recommendation

**Option A.** Objectively stronger because it converts the de-facto state into governed
state at zero cost, keeps the one guard that actually works today (compile floor), and
avoids both B's unverifiable review theater and C's destructive, out-of-authority step.
The genuine long-term concern (native-hostile drift in the contract) is better handled by
the existing platform-free package rule than by per-review parity claims.

## Confidence

High. Verified facts leave little room: a surface with zero tests cannot be meaningfully
"reviewed for parity" no matter what policy says.

## Evidence

- `ls packages/form-renderer-native/src` → 2 files; `package.json` has no test script
  (verified 2026-07-03).
- AGENTS.md: "form-renderer-native React Native renderer, single column — DEFERRED".
- Package depends only on `form-schema` + `form-core`; react/react-native are peerDeps.

## Open Questions

1. Confirm the same frozen-with-gate treatment for superseded docs/trackers (e.g., old
   workflow-track doc superseded by workflow-editor-v2) — freeze label instead of upkeep?
2. Is React Native still on the product horizon at all? (If firmly no, Option C becomes
   worth revisiting as a product decision.)
