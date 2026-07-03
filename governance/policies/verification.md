# Policy: Verification

> **Artifact nature:** Normative (L1 — Policy)
> **Status:** Active · **Version:** 1.0 (semver-lite)
> **Authority:** Owner · **Ratified:** 2026-07-03 · **Verified-on:** 2026-07-03
> **Source (traceability):** constitution §7 (evidence classes), §10 (freshness);
> `dor-dod.md` (work-class floors). This policy is the **L1 home of the `accuracy-first`
> working contract** — that skill becomes its regenerable L3 binding (epic E5), so the
> rules originate here, not in a prompt (constitution §2). On conflict the constitution
> wins (precedence stack §4).

How the framework knows a claim is true. `dor-dod.md` types the evidence floor by
**work-class** (a gate on the whole task); this policy types it by **claim** — every
individual assertion an agent makes — and lifts the owner's accuracy-first contract
("verify by running, not asserting") into normative rules.

The founding reason: a rule stated only in a skill/prompt and not traceable to L1 is not a
rule — it is a bug in L3 (constitution §2). The `accuracy-first` skill states real rules;
this policy is where they legally live.

Evidence class names (E1–E5) are defined once in constitution §7 and only referenced here.

---

## 1. Evidence floor per claim

Every claim carries an evidence class (§7). The **floor** is the weakest class that claim
type may rest on. E5 (recall) never satisfies a governed claim alone — it must be upgraded
(run it, read the source) before use.

| Claim type | Floor | Discharged by |
|---|---|---|
| **Behavior** ("it works / the fix passes / the endpoint returns X") | **E1** | An observed run this session: test output, live smoke, MCP browser check. Never assertion. |
| **Structure / count** ("14 modules", "the folder has 3 files") | **E1 or E2** | `ls`/`grep`/`find` output (E1), or the actual lines read from L0 (E2). |
| **Version / config** ("Node ≥20", "the port is 3001") | **E2** | The actual line in `package.json` / config / `schema.prisma`, read this session. |
| **Derived** ("therefore 17 repos across 14 modules") | **E3** | Stated reasoning over cited E1/E2 facts — the inputs must themselves meet their floor. |
| **"Done"** (a task is complete) | **E1** | The DoD proof for its work-class (`dor-dod.md`) actually run, not asserted. |

A claim that cannot meet its floor is **not made** — it is downgraded to an explicit
"unverified" and either upgraded or dropped. Laundering E5 recall into a stated fact is the
exact mechanism the anti-drift mandate exists to stop.

## 2. The verification loop (normative)

The five rules of the accuracy-first contract, stated normatively. The skill of the same
name is their L3 binding.

1. **Investigate before acting.** Read the actual code / contract / config involved; trace
   the data flow end to end and name exact files/lines. Never answer "why is this broken"
   from memory (that is an E5 claim about behavior, which needs E1).
2. **Reproduce empirically.** Prove a cause by observation — run the failing call, hit the
   live endpoint, inspect the real request/response, check what's listening on a port. A
   diagnosis is unfinished until demonstrated (E1), not argued. A theory disproven by
   evidence is discarded, and the dead end is stated.
3. **Fix root causes.** Prefer the root-cause fix to a symptom patch; when a workaround is
   the right call, say so and name the real fix. Explain the mechanism — why it broke and
   why the fix works — backed by the step-2 evidence.
4. **Verify by running, not by claiming.** A behavior claim is discharged only by an
   observed run (constitution §7: behavior always needs E1). The project bar
   (`typecheck` / `test` / biome / changeset) *plus* demonstrated correctness.
5. **Report faithfully.** Outcomes are reported as they are. Flaky, skipped, or unverified
   is said with the evidence. **Never round "tests fail" / "didn't run it" up to "done."**

## 3. Confidence & decay

Confidence = f(evidence class, age) (constitution §7). A claim is only as strong as its
class *and* as fresh as its freshness contract allows (§10). An E1 fact past its verify-by
date decays toward unverified and must be re-checked at read time before it grounds a new
decision — a stale E1 is treated as E5 until re-run. This is why descriptive artifacts
carry a `verified-on` and a re-verify method (`dor-dod.md`, review-workflow §2).

## 4. Relationship to the other policies

- `dor-dod.md` sets the **task-level** floor (by work-class) and the DoD proof; this policy
  sets the **claim-level** floor and the loop that produces the evidence.
- `review-workflow.md` §2 uses these floors in the nature checklists (a descriptive claim
  must trace to L0 at its stated class; an executable check must run green = E1).
- `change-approval.md` Step 3 names the floor per nature at intake; this policy is the
  standard those floors point to.

## Note

The `accuracy-first` skill is the **L3 binding** of this policy. When it is regenerated as a
traceable binding (epic E5, T5.1.1), its text is kept verbatim per ADR-0001 and its header
cites this policy as its source — closing the "prompts never originate rules" loop
(constitution §2).
