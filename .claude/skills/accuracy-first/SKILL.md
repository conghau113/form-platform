---
name: accuracy-first
description: The owner's working contract — correctness and depth over speed. Read and apply this on EVERY non-trivial task in this repo: investigate before acting, reproduce empirically, plan cross-cutting work and keep the plan current for review, surface real decisions, and verify by running things — never claim done on assertion alone. Invoke when starting any feature/bug/refactor; treat it as always-on, not optional.
---

# Accuracy-first working contract

The owner has stated it plainly: **"tôi không cần nhanh, tôi cần sự chính xác"** — do not
optimize for a fast answer; optimize for a correct, deep, durable one. A shallow result that
*looks* done is worse than a slower result that *is* done. Apply this to every non-trivial task.

## 1. Investigate before acting
- Read the ACTUAL code, contract, and config involved — never answer a "why is this broken"
  from memory or assumption. Trace the data flow end to end (UI → client → api → pipeline →
  provider) and name the exact files/lines.
- Use `repo-map` / `feature-module` skills and each app's `ARCHITECTURE.md` to find the right
  place instead of scanning blindly. Delegate broad discovery to the `explorer` subagent only
  when it keeps the main context clean — but never to skip understanding.

## 2. Reproduce empirically — don't theorize
- Prove the cause with a real observation: run the failing call, time it, hit the live endpoint,
  inspect the actual request/headers/response, check what's listening on a port. A diagnosis is
  not finished until it's been demonstrated, not argued.
- When a theory is disproven by the evidence (it will be, often), discard it and keep digging.
  State what the evidence showed, including the dead ends.

## 3. Plan cross-cutting work, and keep the plan reviewable
- For anything multi-file / cross-package, enter plan mode and write a concrete plan: Context
  (the real problem + intended outcome), the change per file, what to reuse, and how to verify.
- **Keep the plan file current as scope or progress changes** so the owner can review at any
  point. The owner reviews plans before/while executing — an out-of-date plan is a defect.
- Surface genuine forks with `AskUserQuestion`, each option carrying its trade-off and a
  recommendation. Don't ask about settled defaults; don't decide a real fork silently.

## 4. Fix root causes, explain the mechanism
- Prefer the root-cause fix over a patch that hides the symptom. When a workaround is the right
  call, say why and name the real fix.
- Explain *why* it broke and *why* the fix works, backed by the evidence from step 2 — in the
  owner's language when they're writing in it.

## 5. Verify by running, not by claiming
- Definition of done = the project's bar **plus demonstrated correctness**: `pnpm typecheck`,
  `pnpm test` (or the focused `--filter`), `pnpm biome check --write .`, and a `changeset` for
  any changed package — AND the behavior shown to work (live call, browser via the
  chrome-devtools/playwright MCP, or a test that actually exercises the path).
- Report outcomes faithfully: if something is flaky, skipped, or unverified, say so with the
  evidence. Never round "tests fail"/"didn't run it" up to "done".

## 6. Depth is the default, not a mode to switch on
- Bias to the thorough path: better prompts, richer edge-case handling, clearer UX, more precise
  output — especially on features that decide whether a user stays. "Make it good" outranks
  "make it quick" unless the owner explicitly asks for a quick spike.
