# Procedures

A **procedure** is an L1 (normative) **runbook**: it sequences the policies into the actual
step-by-step lifecycle an agent lives while doing a unit of work. Policies state the rules *by
nature* (change-approval, DoR/DoD, review-workflow, verification); a procedure **wires them into
one ordered path** and points to each rule at the step where it applies — it does **not** restate
policy content (a rule has exactly one home; §5, §14).

Procedures are Governance Core, alongside the constitution, policies, and charters (constitution
§2 L1, §4 precedence rung 5). The L3 **skill** that an agent actually runs regenerates FROM a
procedure in E5 (T5.1.2) and must trace to it — the **procedure-vs-skill split** (the same
source-vs-binding shape as the charter-vs-binding split; blueprint Phase 4). Change the lifecycle
here; the skill follows.

**Admission rule (E4):** no procedure is written without **≥2 real recurrences** of the pattern it
codifies, and one real phase is **dry-run** under it before it is marked Active. This is the
no-speculation rule (constitution §14) applied to the framework's own process — we codify what we
have already lived, not what we imagine.

| Procedure | Codifies | Binding (E5) |
|---|---|---|
| [phase-execution](phase-execution.md) | one governed phase, resume → plan → DoR → implement → verify → review → commit → record → stop | skill (T5.1.2) |
| [drift-sweep](sweeps.md#a-drift-sweep--specifics) | batch-run the `index.yaml` methods; L2 doc vs L0; file drift, fix detector bugs | skill (T5.1.2) |
| [conformance-sweep](sweeps.md#b-conformance-sweep--specifics) | batch-run the golden-rule / standard checks; L0 vs rule; complements the per-diff reviewer | skill (T5.1.2) |
| [knowledge-promotion](knowledge-promotion.md) | graduate a durable fact from machine-local memory into a governed L2 artifact; thin the memory to a pointer | skill (T5.1.2) |
