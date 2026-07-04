<!-- TEMPLATE — copy to reports/audits/AUDIT-<date>.md and fill. Delete this comment. -->

# Framework audit — <YYYY-MM-DD>

> **Nature:** Evidence (append-only, §5) · **Date:** <YYYY-MM-DD> · **Auditor:** <agent/owner>
> **Method:** the framework checks itself against §13 health signals · **Result:** <one-line health verdict>
> **Evidence class:** E1 (signals computed from existing artifacts — no new bookkeeping, §13)

The periodic self-audit (constitution §13 Audit; roadmap E8). Measure only signals **computable
from existing artifacts**:

| Health signal (§13) | Value | Baseline / trend |
|---|---|---|
| Share of constraints on ladder rung ≥2 | <%> | (gate-inventory) |
| Oldest undischarged impact manifest (§9) | <age / id> | |
| Oldest past-due freshness contract (§10) | <age / artifact> | (index.yaml verified-on) |
| Traceability coverage of L3 bindings | <%> | (each binding names its L1/L2 source) |
| Escaped defects: found by audit vs by accident | <n / n> | |

- **Findings:** <what the audit surfaced>
- **Escaped defects:** <defects that slipped past the gates>
- **Recommendations → Amend queue:** <constitution/policy/gate changes to propose (owner decides)>
- **Metrics baseline snapshot** (blueprint §9): <numbers to carry forward>
