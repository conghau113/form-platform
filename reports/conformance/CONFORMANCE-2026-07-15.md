# Conformance report — golden rules — 2026-07-15

> **Nature:** Evidence (append-only, §5) · **Date:** 2026-07-15 · **Author:** agent (Opus 4.8)
> **Method:** run each enforceable golden rule's own check against L0, repo-wide + retroactive (conformance-sweep; roadmap E8 first audit) · **Result:** 6 rules run · 6 conform · 0 real violation · 1 detector-calibration note (eval pattern too broad — documented FP class)
> **Evidence class:** E1 (each rule check executed against L0)

The **E8 first-audit conformance-sweep** (sweeps procedure §B) — L0 vs the normative rules,
repo-wide and retroactive, complementing the per-diff reviewer (which only guards at the door). This
is the first filed conformance report (§14: no dedicated report was created speculatively; this is the
first real sweep that must file one). No conformance-report *template* is authored — this file models
the calibration-report format.

| # | Rule (authority) | Method | Result |
|---|---|---|---|
| 1 | No `eval()` / `new Function()` on schema expressions (ADR-0015) | `\beval\(|new Function\(` absent from runtime src, comments skipped | **conform** (0 real calls) |
| 2 | `fetch()` confined to `apiFetch.ts` + `auth/client.ts` (builder rule) | grep `fetch(` in `apps/builder/src`, exclude the 2 clients | **conform** (clean) |
| 3 | Prisma access confined to `persistence/prisma` + carve-outs (ADR-0019 / coding-standard) | `this\.prisma\.` outside `persistence/prisma`/`modules/health`/`scripts` | **conform** (empty) |
| 4 | Renderer peerDeps: react/react-dom/antd/react-native never `dependencies` (ADR-0016) | inspect each renderer `package.json` deps vs peerDeps | **conform** (see below) |
| 5 | Feature-folder structure (no stray root `*.tsx`) — `structure.test.ts` gate | `vitest run src/structure.test.ts` | **conform** (1/1 pass) |
| 6 | NestJS services must not `import type` an injected provider (gate-promotion WATCH rule) | grep `import type { …(Service|Repository|PrismaService)` in api src | **conform** (none) |

## Rule 1 — no-eval (ADR-0015): the documented too-broad-pattern false-positive

Raw `\beval\(|new Function\(` across `packages/*/src` + `apps/*/src` returned **6 hits — all comment
prose**, exactly the FP class the sweeps procedure names (`eval(` matching a *"never eval()"* comment):

```
packages/form-core/src/conditions.ts:6:   * ... We never use eval() / new Function() on schema-provided rules.
packages/form-core/src/conditions.ts:17:  * ... interpret rules identically. NEVER eval(). */
packages/form-schema/src/schema.ts:27:    *  SAFE evaluator in form-core. NEVER eval() these rules. */
packages/form-schema/src/schema.ts:41:    *  Evaluated by form-core's reactions engine. NEVER eval() these rules. */
packages/workflow-schema/src/capabilities.ts:43:  summary: "... evaluated by a SAFE evaluator (never eval()).",
packages/workflow-schema/src/schema.ts:16:  * conditionSchema. NEVER eval() these rules.
```

**Tightened method** (skip comment lines `*`/`//`/`/*` + the never/SAFE prose) → **zero hits**. These
are documentation *asserting* the rule, not violating it. Detector bug (method too broad), not an L0
defect. **No real finding.** The precise catalogued method belongs to the standard that owns the rule
(coding-standard / ADR-0015); recorded here so the next sweep starts from the tightened pattern.

## Rule 4 — renderer peerDeps (ADR-0016): evidence

- **form-renderer-web** — `dependencies`: `@org/form-schema`, `@org/form-core`, `@hookform/resolvers`,
  `react-hook-form`, `zod`. `peerDependencies`: `@ant-design/icons`, `@tanstack/react-query`, `antd`,
  `react`, `react-dom`. → the 4 governed peers (react/react-dom/antd) are **peer, never dep**. ✓
- **form-renderer-native** (FROZEN, ADR-0006) — `dependencies`: `@org/form-schema`, `@org/form-core`.
  `peerDependencies`: `react`, `react-native`. → clean. ✓

## Real violations filed

None. All 6 rules conform; the only non-pass was the eval detector's known too-broad pattern (fixed in
method, not L0). No remediation task spawned.

## Verdict

L0 conforms to every enforceable golden rule under a retroactive repo-wide sweep — **0 real
violations**. Combined with the clean [CALIBRATION-2026-07-15](../calibration/CALIBRATION-2026-07-15.md)
drift-sweep, the **E8 first audit finds the framework's descriptive surface true and the product's
load-bearing rules obeyed**. Health-signal metrics baseline (§13) follows as T8.1.2 (audit report).
