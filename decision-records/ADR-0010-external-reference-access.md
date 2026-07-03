# ADR-0010: Access policy for external reference repositories (EVN / web-admin / estd)

- **Status:** Open (as of 2026-07-03) — DoR gate for T3.4.2 (benchmark distillation); decide before E3, does not block E0–E2
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register F4

## Context

Three local reference codebases inform the product roadmap: `E:\web\evn\core-service`
(client RBAC/org model), `E:\web\web-admin` (client admin UI patterns), `E:\web\estd`
(complete auth suite). The roadmap's evidence ledger (§7) records reads from all three on
2026-07-01. Current `.claude/settings.json` scopes standing read access to
`E:\web\web-tool\**` only — the references are reachable today only via per-call
permission prompts. The governing product principle is explicit: **model after, never
copy** ("phỏng theo, KHÔNG copy") — the references are another party's code.

## Problem

Framework capabilities (UX research, architecture benchmarking, future phase design for
C3/D2–D4/E which are modeled on EVN patterns) will repeatedly want these sources. The
access mechanism determines friction, and — more importantly — the governance layer must
decide how third-party code may influence framework/product artifacts without leaking
into them.

## Constraints

- IP boundary: reference code must never be copied into this repo's code or artifacts;
  the existing principle and the vendor↔client business relationship both demand it.
- Claude Code permission model: standing grants via `additionalDirectories`/allow-rules,
  or per-call prompts (owner present), define the only mechanisms available.
- Evidence-ledger practice exists and works (roadmap §7 proves the pattern).

## Options

### Option A — Standing read grant
Add the three paths to `additionalDirectories` (read-only by convention).

- **Pros:** zero friction; deep benchmarking possible in any session, including
  owner-absent autonomous work.
- **Cons:** every future session — whatever its task — can silently read client code;
  raises the chance of unconscious pattern-copying (verbatim structures drifting into
  generated code); a standing exposure the governance layer would itself flag as
  unnecessary privilege.
- **Affected areas:** `.claude/settings.json`.
- **Maintenance cost:** none technically; ongoing IP-discipline burden on every session.
- **Migration risk:** none; revocable.

### Option B — Curated extracts only
No direct access; the owner reads and pastes/summarizes relevant fragments on request.

- **Pros:** hardest IP boundary; owner sees exactly what crosses.
- **Cons:** bottlenecks research on owner availability; the roadmap's best-grounded
  sections (§1.1 RBAC analysis) were produced by direct reads — B would have made them
  shallower; contradicts the demonstrated working pattern.
- **Maintenance cost:** owner-side, recurring.
- **Migration risk:** none.

### Option C — On-demand access + distillation rule (codified status quo)
Keep per-call permission prompts as the mechanism (owner consciously grants, per session,
when the task warrants). Add a governance rule making the boundary explicit: reference
reads must produce *distilled patterns + evidence-ledger entries* (source path, date,
conclusion); raw reference code never enters repo artifacts; generated code is written
from the distillation, not from the source in context.

- **Pros:** friction is proportional (reference reads are occasional — a few sessions per
  track, per history); each access is a conscious owner decision; the distillation rule
  turns existing good practice (§7 ledger) into enforceable policy; least standing
  privilege.
- **Cons:** owner must be present to grant (blocks autonomous benchmarking sessions);
  repeated prompts within a session are mildly annoying.
- **Affected areas:** governance doc (one rule); no settings change.
- **Maintenance cost:** near zero.
- **Migration risk:** none; can upgrade to A later if friction proves real.

## Risks

- (A) The failure mode is silent and cumulative: no single session decides to copy, but
  patterns absorbed verbatim across many sessions erode the "phỏng theo" line. Detection
  is hard; prevention (least privilege) is cheap.
- (C) If a future framework capability needs *systematic* reference analysis (e.g., a full
  web-admin UX audit for ADR-0009's benchmark corpus), per-call prompting becomes genuinely
  painful — that specific session can be granted temporary access; the policy should say so.
- All options: the references are snapshots on a local disk — they may themselves be
  outdated relative to the client's real systems. Ledger entries must carry dates.

## Recommendation

**Option C.** Objectively stronger because it matches the demonstrated frequency of need
(occasional, task-driven) with the minimal standing privilege, and it converts the one
practice that has already worked well (evidence-ledger distillation) into policy instead
of habit. A optimizes for a friction that history says is rare, at the cost of a
permanent, hard-to-audit IP exposure; B discards a proven research capability.

## Confidence

High. Usage history, the IP principle, and least-privilege all point the same way; the
only cost of C (prompt friction) is recoverable by escalating to A later, while A's cost
is not symmetrical to walk back (exposure already happened).

## Evidence

- `.claude/settings.json` read in full: no reference paths in `additionalDirectories`
  (verified 2026-07-03).
- Roadmap §7 evidence ledger: reads of all three references on 2026-07-01 with per-file
  conclusions — the distillation pattern working in practice.
- Product principle (roadmap §1.1): "phỏng theo, KHÔNG copy" — owner-ratified 2026-07-01.

## Open Questions

1. Confirm reads should remain read-only *and* that no reference-derived text may be
   quoted verbatim in committed artifacts (only distilled patterns + ledger entries)?
2. Pre-authorize the one known upcoming systematic need — a web-admin UX benchmark pass
   for ADR-0009 — as a session-scoped grant when it happens?
