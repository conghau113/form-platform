# ADR-0004: Framework audience and portability

- **Status:** Accepted (owner, 2026-07-03) — recommendation as written, via blueprint & roadmap approval
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register B1

## Context

Today the engineering org is effectively one human (the owner) plus Claude Code, on one
Windows machine. Claude Code's memory — which currently carries a large share of project
knowledge (resume files, gotchas, conventions) — is machine-local and NOT in the repo.
The framework's stated purpose is to make Claude Code a *long-term team member*, and the
product roadmap anticipates clients (EVN-like) installing the product, possibly with their
own engineers reading this repo someday.

## Problem

How self-contained must framework artifacts be? If they may assume this machine, this
memory, and this owner, they are cheaper to write but die with the machine. If they must
be fully portable (fresh clone on a new machine = fully functional framework), they cost
more to write and maintain but survive team growth, machine changes, and CI execution.

## Constraints

- Owner's simplicity contract (global CLAUDE.md): no speculative features — "flexibility
  that wasn't requested" is explicitly banned.
- Memory is machine-local by harness design; the repo cannot contain it.
- Some machine facts are unavoidable session context (ports, Docker, Windows paths) and
  already live in repo docs (`docs/usage.md`).

## Options

### Option A — Solo-optimized
Artifacts may reference memory entries, absolute local paths, and this-machine facts.

- **Pros:** cheapest to write; matches today's reality.
- **Cons:** a fresh clone (new machine, CI runner, future teammate, or memory loss) gets a
  framework full of dangling references; contradicts "long-term team member" — long-term
  implies surviving environment change.
- **Affected areas:** all framework artifacts.
- **Maintenance cost:** low now, catastrophic at the first environment change (full audit
  of every artifact).
- **Migration risk:** deferred, not avoided.

### Option B — Strictly team-portable
Artifacts are fully self-contained, machine-agnostic, and onboarding-grade: a new engineer
(human or AI) with only the repo can execute the whole lifecycle. Includes human-oriented
onboarding docs, multi-reviewer workflow provisions, etc.

- **Pros:** maximally durable; doubles as onboarding documentation.
- **Cons:** builds multi-user process (approval chains, role docs) no one uses today —
  direct violation of the owner's no-speculation contract; heavier to maintain.
- **Maintenance cost:** highest; speculative surfaces rot fastest (they're never exercised,
  so drift is never noticed — the worst drift profile).
- **Migration risk:** none, but ongoing dead weight.

### Option C — Portable-by-default where free, solo-scale in process
Artifacts use repo-relative paths and are self-contained (no memory dependencies: memory
may *point at* framework docs, never the reverse). Machine facts live in exactly one
governed doc (the runbook) that everything else references. But process design stays
solo-scale: one approver (the owner), no speculative team workflow.

- **Pros:** durability where it costs nothing (path discipline, self-containment are
  write-time habits, not features); zero speculative process; a future teammate needs only
  the runbook updated, not an artifact audit.
- **Cons:** slightly more discipline per artifact than A.
- **Affected areas:** all framework artifacts (a writing rule, not a structure).
- **Maintenance cost:** near A's; one runbook as the single machine-facts surface.
- **Migration risk:** minimal.

## Risks

- The subtle failure in A is invisible until it hurts: nothing breaks while the machine and
  memory persist, so the debt accrues silently.
- In C, the discipline must be enforceable (a governance check that artifacts contain no
  absolute local paths / memory references), else it decays into A.

## Recommendation

**Option C.** Objectively stronger because it takes B's durability exactly where durability
is free and refuses it exactly where it becomes speculation — which is the documented
owner contract. A optimizes for a present that the framework's own purpose statement
("long-term") says will change; B builds process for a team that doesn't exist.

## Confidence

High. The owner's own simplicity contract nearly forces C once the memory-locality fact
is on the table.

## Evidence

- Memory directory is outside the repo (harness design, path verified).
- Owner's global CLAUDE.md: "No 'flexibility' or 'configurability' that wasn't requested."
- `docs/usage.md` already plays the single-runbook role for machine facts (ports, Docker).
- Product roadmap anticipates external installations (vendor↔client model), i.e., future
  readers are plausible but not present.

## Open Questions

1. Will any human other than the owner (e.g., an EVN engineer) plausibly read framework
   artifacts within the next year? (If yes, C gains a small onboarding-index artifact.)
2. Confirm the rule "memory may point at framework docs; framework docs never depend on
   memory" as a governance constraint.
