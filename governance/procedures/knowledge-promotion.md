# Procedure — knowledge promotion (memory → L2)

> **Artifact nature:** Normative (L1 — Governance Core / procedure)
> **Status:** Active · **Version:** 1.0 · **Authority:** Owner (ratified 2026-07-05, owner-delegated §3)
> **Source:** the dev-stack promotion lived in T2.3.1 (`55265f6`: memory `dev-stack-ports` + `docs/usage.md` → [`knowledge/runbook/dev-stack.md`](../../knowledge/runbook/dev-stack.md)) + its ≥2× gotcha sub-filter + the standing `MEMORY.md` topic-file discipline · policies [verification](../policies/verification.md) · [review-workflow](../policies/review-workflow.md) · constitution §5/§8/§10
> **Binding (L3):** a skill regenerates FROM this procedure (E5 T5.1.2) and must trace to it.

## Mandate

**Graduate a durable fact out of machine-local session memory into a governed L2 knowledge
artifact.** Session memory is fast, private, and un-versioned — the right home for a fact while it
is still provisional or conversation-specific. Once a fact has **proven durable** (recurs across
sessions, others rely on it), leaving it only in memory makes it un-auditable and un-shareable: it
must be **promoted** to L2 (a runbook, registry, or index-registered doc), given a freshness
contract, and the memory entry **thinned to a pointer** so there is exactly one home (§5).

This procedure covers the **descriptive** promotion only (memory → L2). A memory fact that turns
out to be a **normative rule or a load-bearing decision** promotes to **L1**, not L2 — that is the
retro-ADR path (ADR-0012 Option C, e.g. ADR-0023 lifting the scoped-Biome *why* out of memory) — a
different route; Step 2 forks to it.

## Admission evidence (why this procedure exists)

- **T2.3.1** (`55265f6`) is the end-to-end dry-run: the dev-stack facts that lived only in memory
  `dev-stack-ports` + the operational sections of `docs/usage.md` were consolidated into one
  governed runbook, re-grounded in `env.ts` / `env.example`, registered in `index.yaml`, and the
  memory was thinned to a pointer.
- Inside T2.3.1, the **≥2× gotcha sub-filter** ran the same loop at item granularity: 6 gotchas seen
  ≥2× graduated to the runbook; one-offs stayed in session memory.
- The standing `MEMORY.md` discipline (topic-file per fact, index line, "update don't duplicate,
  thin when promoted") is the same pattern applied continuously.

That is the ≥2× recurrence the E4 admission rule requires; T2.3.1 is its Active dry-run.

## Steps → verify

1. **Identify a promotion candidate.** A fact that lives only in machine-local memory (or is
   duplicated in an ungoverned doc) and has **recurred ≥2× across sessions** — the
   climb-on-evidence rule (constitution §8). → *verify:* cite the ≥2 sightings; a one-off stays in
   memory. *(verification policy: investigate before acting.)*

2. **Classify the nature — fork if not descriptive.** A **descriptive operational fact** (ports,
   env, a gotcha, an agent roster, a gate) promotes to **L2** and continues here. A **normative
   rule** or a **load-bearing decision whose *why* is missing** promotes to **L1** (a policy or a
   retro-ADR per ADR-0012) — leave this procedure and run change-approval. → *verify:* nature named;
   non-descriptive candidates routed out. *(constitution §5 — never mix natures.)*

3. **Choose the one L2 home.** The existing `runbook/`, `registries/`, or index-registered doc the
   fact belongs to; only create a new artifact when none fits (§14, no speculation). → *verify:* one
   home named; no second copy will remain.

4. **Re-ground in L0 — do not copy the memory text.** Memory may be stale. Verify each fact against
   its **source** (`env.ts`, `.github/workflows/`, `.claude/agents/`, `schema.prisma`, …) and write
   the **verified** value, not the remembered phrasing. A memory-vs-L0 contradiction is **filed as a
   finding** (§10), never silently corrected in the promotion. → *verify:* each promoted fact traces
   to an L0 anchor; contradictions filed. *(verification policy: reproduce empirically.)*

5. **Apply the ≥2× filter per item.** When promoting a set, only sub-items seen ≥2× graduate; one-offs
   stay in session memory (the gotcha sub-filter, §8). → *verify:* each promoted item carries its ≥2×
   evidence; one-offs left behind.

6. **Register the freshness contract.** A **new** descriptive doc gets an `knowledge/index.yaml`
   entry (class · scope globs · verified-on · **executable method**), calibrated once against L0, and
   a header stamp pointing to that entry — the method stays authoritative in the index only (T2.2.1).
   Updating an existing artifact refreshes its entry's `verified-on` only on a real re-verification.
   → *verify:* the method runs green; index entry and doc header agree. *(constitution §10.)*

7. **Thin the memory to a pointer.** Replace the promoted body with a one-line fast-recall + a link
   to the governed artifact. Do **not** delete it (recall speed is the reason memory exists); do
   **not** leave the full copy (two homes → drift, §5). Update the `MEMORY.md` index line. → *verify:*
   the memory entry holds only the pointer; `MEMORY.md` agrees.

8. **Commit & record.** One concern; then hand to [phase-execution](phase-execution.md) Steps 8–10
   (own row `_pending_`, backfill prior, stop). → *verify:* `git log` shows one single-concern commit.

## The core discipline

- **Promote the lived fact, not memory's phrasing** — Step 4 re-grounds in L0; the memory line is a
  pointer *to* the source, never the authority.
- **≥2× or it stays local** — memory is the incubator; only proven-durable facts pay the cost of a
  governed home (§8, §14).
- **Descriptive → L2, normative → L1** — the fork at Step 2 keeps natures unmixed (§5); this
  procedure owns only the descriptive leg.

## Scope — does NOT

- **Not** the retro-ADR / policy path — a normative rule or decision promotes to **L1** (ADR-0012
  Option C), which runs change-approval, not this procedure.
- **Not** a drift-sweep — that re-checks an *already-governed* L2 doc vs L0 (sweeps T4.2.2); this
  *creates* the governed home for a fact that had none.
- **Not** memory deletion — the memory entry is thinned to a pointer, never emptied (Step 7).
