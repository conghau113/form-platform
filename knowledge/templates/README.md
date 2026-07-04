# Report templates

Skeletons for the framework's four report types + the per-phase plan. A **report** is an
**Evidence** artifact (constitution §5): it records what happened, is **append-only**, needs
**no ratification**, and carries `date · method · result` in its header. Reports are filed
under `reports/{drift,reviews,audits,calibration}/` (append-only; never edit a past report —
supersede with a new dated one).

These templates are **reference** (L2), not descriptive-of-L0, so they are **not** registered in
`knowledge/index.yaml`. Keep them minimal — a skeleton of required fields, not ceremony (§14).

| Template | Produced when | Feeds |
|---|---|---|
| `drift-report.md` | a freshness method (index.yaml) fails against L0 (§10) | remediation task; §13 freshness health |
| `review-report.md` | an artifact is reviewed on its nature checklist (review-workflow §2) | change-approval decision |
| `audit-report.md` | the periodic framework self-audit (E8; §13 Audit) | Amend queue; metrics baseline |
| `calibration-report.md` | the index methods are run as a batch (E2 validation; freshness sweep) | verified-on updates; method fixes |
| `phase-plan.md` | before starting a task/phase (DoR boundary) | the task's own execution + review |
