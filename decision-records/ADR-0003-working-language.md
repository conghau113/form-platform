# ADR-0003: Working language for conversation and questions

- **Status:** Open (as of 2026-07-03) — DoR gate for T3.3.1 (documentation standard); decide before E3, does not block E0–E2
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register A5

## Context

The owner has fixed the artifact language policy: engineering artifacts (agents, skills,
prompts, standards, governance, ADRs) in English; product/business documentation may stay
Vietnamese. Unfixed: the language of *conversation* — status updates, completion summaries,
`AskUserQuestion` prompts, plan-mode plans. Standing (pre-framework) memory conventions say
questions and completion summaries are delivered in Vietnamese; this session has run
entirely in English because the owner wrote in English.

## Problem

Ambiguity here produces inconsistent sessions (some VI, some EN, some mixed), and the
framework's prompts must encode ONE rule — otherwise every artifact that templates a
user-facing message guesses.

## Constraints

- Artifact language is already decided (English) and out of scope here.
- Product UI language (vi/en unification, roadmap P1c) is a separate product decision,
  untouched by this ADR.

## Options

### Option A — Vietnamese conversation, English artifacts
Status quo of the standing conventions: summaries, questions, plan reviews in Vietnamese;
all committed artifacts in English.

- **Pros:** matches two explicit owner conventions already on record; fastest owner
  comprehension for review-heavy phases; zero cost.
- **Cons:** context-switching between artifact text (EN) and its discussion (VI);
  occasional terminology mismatch when a VI summary describes an EN artifact.
- **Affected areas:** framework prompt templates; the two memory conventions stay valid.
- **Maintenance cost:** none.
- **Migration risk:** none.

### Option B — English everywhere
Conversation follows the artifact policy.

- **Pros:** one language end-to-end; summaries can quote artifacts verbatim.
- **Cons:** overrides two standing owner preferences without an owner request to do so;
  slower review reading if VI remains the owner's faster review language.
- **Maintenance cost:** none, plus two memory conventions must be retired.
- **Migration risk:** none technically; preference risk only.

### Option C — Mirror the owner's language per message
Reply in whatever language the owner used last.

- **Pros:** adaptive; matches how this session naturally unfolded.
- **Cons:** non-deterministic rule; templates (question options, plan headers) can't be
  pre-written in one language; mixed transcripts.
- **Maintenance cost:** small but perpetual ambiguity — the exact thing this phase exists
  to remove.

## Risks

Minimal in all options; the cost of choosing wrong is friction, not breakage. The real risk
is *not choosing* — Option C by default.

## Recommendation

**Option A.** Objectively stronger because it is the only option backed by explicit,
recorded owner preference (two standing conventions), and the mandate of this Decision
phase is to eliminate ambiguity, which C institutionalizes. B is viable but requires the
owner to actively revoke their own prior conventions — that revocation, if desired, is
precisely what this ADR's review can express.

## Confidence

Medium. This is pure owner preference; the recommendation rests on recorded conventions,
and this English-language session is weak counter-evidence.

## Evidence

- Memory conventions: "Ask questions in Vietnamese", "Summarize in Vietnamese"
  (both pre-date this track).
- Owner's language policy statement this session (artifacts EN, product docs VI ok).
- This session conducted in English by the owner.

## Open Questions

1. Confirm A, or use this ADR to switch to B — either way the choice gets codified into
   framework prompt templates and the memory conventions updated to match.
