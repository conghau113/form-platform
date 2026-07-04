<!-- TEMPLATE — use to plan a task/phase before starting (the DoR boundary). Not a report. -->

# Phase plan — <task id> — <title>

- **Cx size:** S (≤ half a session) | M (one phase) | L (must be split before work)
- **Goal (verifiable):** <success stated as a check, not "make it work" — dor-dod>

**DoR** (must all hold before writing — change-approval Step1–2, dor-dod):
- ☐ Gating ADR Accepted (if any): <ADR / n-a>
- ☐ Nature declared: normative | descriptive | executable | evidence → fixes the review route
- ☐ Architectural? if yes, freeze-gate 5 elements cleared (constitution §11)
- ☐ Evidence floor met BEFORE writing (extraction reads L0, not docs): <work-class → floor>
- ☐ Upstream merged

**Work-class & evidence floor** (dor-dod): bug=E1-repro · feature=E2-reads+E1-smoke ·
refactor=suite-before/after · doc=E2-vs-L0+verified-on · governance=traceability+owner-ratify+manifest ·
verification=E1. → **this task:** <class → floor>

**Steps → verify:**
1. <step> → verify: <check>
2. <step> → verify: <check>
3. <step> → verify: <check>

**DoD** (dor-dod): ☐ header matches nature · ☐ registered in index.yaml if governed ·
☐ reviewed on nature checklist + ratified per routing matrix · ☐ commit + tracker + memory ·
☐ repo checks left green · ☐ changeset if a package changed

- **Risks / rollback:** <text + git revert; one-way doors → 6-step disposal / advisory-first>
