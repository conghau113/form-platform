# Observe queue — §13 Amend backlog

> **Nature:** Reference / living register (L2-adjacent working queue — NOT append-only evidence and
> NOT index-registered; it is a worklist, like `release-blockers.yaml`). · **Opened:** 2026-07-15
> (E8 T8.1.3) · **Authority:** constitution §13 (Operate → Observe → **Amend** → Audit) + §14
> (anti-bureaucracy — items leave the queue when resolved or demoted; nothing accumulates for its own
> sake). · **Source of items:** the append-only reports under `reports/` + filed findings.

The **Observe → Amend** stage of the operating loop. Reports (`reports/…`, append-only evidence) capture
what happened; this queue distills them into **amendment candidates awaiting an owner decision**. Each
item names its evidence, the change it proposes, and who must act. Items are **removed** (not struck
through) once resolved — the evidence report retains the history. **No item is a self-executed change:**
normative-L1 / gate-blocking flips require the owner (a decision record, §8/§15).

## Amendment candidates (owner decides)

| # | Candidate | Evidence | Owner action | Status |
|---|---|---|---|---|
| A1 | **Promote `ci-knowledge-index` + `ci-traceability` to blocking** — drop `continue-on-error`. | Clean advisory phase complete: detectors proven (T6.2.1 6-class / T6.2.2 4-class seeds) + [AUDIT-2026-07-15](audits/AUDIT-2026-07-15.md) clean + [CALIBRATION](calibration/CALIBRATION-2026-07-15.md) 13/13. §8 eligibility met. | Ratify the flip (a **decision record** — the flip itself needs one). | open |
| A2 | **Fix compose `AUTH_BOOTSTRAP_*` crash-loop** so `ci-e2e` can boot green and start its **N=3** clean-run clock. | `env.ts` `AUTH_BOOTSTRAP_*` are `.optional()` but compose passes empty strings → Zod rejects → advisory `e2e.yml` has never booted green (hidden by `continue-on-error`). Filed T7.2.1 (product/infra, out of framework track). | Fix in product `env.ts` (empty→undefined) or drop the vars from compose when unset. Then N=3 → later A-item to flip `ci-e2e` blocking. | open |
| A3 | **F1 (security): restore the 4 `.env` read-denies** in `.claude/settings.json`. | Working-copy `settings.json` (owner's uncommitted edit) dropped `Read(.env)` / `.env.*` / `**/.env` / `**/.env.*` vs committed HEAD — weakens the live secret-read guardrail (T6.2.3 F1). | Restore or explicitly confirm the intent. (Owner's out-of-track file — not agent-editable.) | open |

## Filed findings — remediation tasks (record-only until scheduled)

| # | Finding | Evidence | Disposition | Status |
|---|---|---|---|---|
| F2 | `gate-inventory` `deny-secret-read` **under-lists** the committed `.env` denies (names only `.pem` + `secrets/**`). | T6.2.3 F2; re-confirmed [CALIBRATION-2026-07-15](calibration/CALIBRATION-2026-07-15.md). | Own remediation task — resolve **with** A3 (register mirrors the settled deny set). | open |
| D1 | `docs/expansion/production-hardening.md` preamble "**11 packages**" → truth **10**. | E1 2026-07-04 (T2.1.1); `index.yaml unregistered_by_design`. | Low-severity stale figure; fix as its own doc task. | open |
| D2 | Dotted `apps/api/.env.example` = stale **SQLite-era duplicate** of `env.example`. | T2.3.1; `usage-runbook` note. | 6-step disposal door (Commit-BEFORE-Delete) as its own task. | open |
| D3 | `pnpm biome check --write .` (repo-wide) in **AGENTS.md `## Commands`** + **`accuracy-first` §5** contradicts **ADR-0023** (scoped Biome, never repo-wide). | Filed T5.1.1, re-affirmed T5.3.1. `accuracy-first` body is ADR-0001 **VERBATIM** → owner-only edit. | Owner decides the verbatim/operational wording. | open |
| B1 | **T3.4.1 + T3.4.2** (design/a11y standard + reference-repo read) blocked on **ADR-0009 / ADR-0010** owner grants (not delegable). | E3 4/6; tracker. | Owner supplies the two ADR grants to unblock E3. | open |

## Notes

- The queue opened at the E8 close with the first-audit distillate. Future audits + sweeps append their
  reports and add/remove queue items — this is the durable Observe→Amend surface the §13 loop needed.
- **v1.0 release ratification** (E0–E8 complete; `FRAMEWORK_VERSION` = 1, shape stable) is the standing
  owner gate — recorded in the tracker, not queued as a defect.
