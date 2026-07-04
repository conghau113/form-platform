---
name: knowledge-promotion
description: Graduate a durable fact out of machine-local session memory into a governed L2 knowledge artifact (runbook / registry / index-registered doc) once it has recurred ≥2× across sessions — choose one L2 home, re-ground in L0 (do NOT copy the memory text), register a freshness contract, and thin the memory to a pointer (never delete). A normative rule or load-bearing decision forks to L1 (a policy or retro-ADR, ADR-0012), not here. Use WHENEVER a memory fact has proven durable and needs a shareable, auditable home. Binds governance/procedures/knowledge-promotion.md.
---

# knowledge-promotion — memory → L2

> **Layer:** L3 — Execution Adapter (skill binding). Originates no rule (constitution §2); it is the
> operational rendering of a governed procedure — read the source for the *rule*, this for the *run*.
> **Source:** [`governance/procedures/knowledge-promotion.md`](../../../governance/procedures/knowledge-promotion.md)
> — the L1 normative procedure (ratified 2026-07-05, owner-delegated). One home §5: the full steps,
> the fork rationale, and admission evidence live there; this condenses them.
> **Regenerated:** E5 T5.1.2 · 2026-07-05 — condensed from source, no drift.

Session memory is the fast, private, **un-versioned incubator** — the right home for a fact while it
is still provisional. Once a fact is **proven durable** (recurs across sessions, others rely on it),
leaving it only in memory makes it un-auditable and un-shareable → **promote** it to L2, give it a
freshness contract, and **thin the memory to a pointer** so there is exactly one home (§5).

## The 8 steps → verify
1. **Identify a candidate** — a fact living only in memory (or duplicated in an ungoverned doc) that
   has **recurred ≥2× across sessions** (§8 climb-on-evidence). → *verify:* cite the ≥2 sightings; a
   one-off stays in memory.
2. **Classify the nature — fork if not descriptive.** A descriptive operational fact (ports, env, a
   gotcha, a roster, a gate) → **L2**, continue here. A **normative rule** or a **load-bearing
   decision whose *why* is missing** → **L1** (policy or retro-ADR, ADR-0012) — leave and run
   change-approval. → *verify:* nature named; non-descriptive routed out.
3. **Choose the one L2 home** — the existing `runbook/` / `registries/` / index-registered doc it
   belongs to; create a new artifact only when none fits (§14). → *verify:* one home named.
4. **Re-ground in L0 — do NOT copy the memory text.** Memory may be stale. Verify each fact against
   its **source** (`env.ts`, `.github/workflows/`, `.claude/agents/`, `schema.prisma`, …) and write
   the **verified** value. A memory-vs-L0 contradiction is **filed as a finding** (§10), never
   silently corrected. → *verify:* each promoted fact traces to an L0 anchor; contradictions filed.
5. **Apply the ≥2× filter per item** — when promoting a set, only sub-items seen ≥2× graduate;
   one-offs stay in memory (the gotcha sub-filter). → *verify:* each promoted item carries its ≥2×.
6. **Register the freshness contract** — a new descriptive doc gets a `knowledge/index.yaml` entry
   (class · scope globs · verified-on · **executable method**), calibrated once against L0, + a header
   stamp pointing to that entry (method stays authoritative in the index only). Updating an existing
   artifact bumps `verified-on` only on a real re-verification. → *verify:* method runs green; entry
   and header agree.
7. **Thin the memory to a pointer** — replace the promoted body with a one-line fast-recall + a link
   to the governed artifact. Do **not** delete it (recall speed is why memory exists); do **not** leave
   the full copy (two homes → drift, §5). Update the `MEMORY.md` index line. → *verify:* memory holds
   only the pointer; `MEMORY.md` agrees.
8. **Commit & record** — one concern; then hand to the `phase-execution` skill Steps 8–10 (own row
   `_pending_`, backfill prior, stop). → *verify:* `git log` shows one single-concern commit.

## The core discipline
- **Promote the lived fact, not memory's phrasing** — Step 4 re-grounds in L0; the memory line is a
  pointer *to* the source, never the authority.
- **≥2× or it stays local** — memory is the incubator; only proven-durable facts pay a governed home.
- **Descriptive → L2, normative → L1** — the Step-2 fork keeps natures unmixed (§5).

## Does NOT
Not the retro-ADR / policy path (normative → L1 via ADR-0012, runs change-approval) · not a
drift-sweep (that re-checks an *already-governed* L2 doc vs L0 — see the `sweeps` skill; this
*creates* the home for a fact that had none) · not memory deletion (Step 7 thins to a pointer, never
empties).
