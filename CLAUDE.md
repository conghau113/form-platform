# Project memory

@AGENTS.md

## Claude Code specifics (keep this file tiny — it loads every session)
- Use the `explorer` subagent (Haiku) to investigate the repo or read large files.
  Delegate discovery so THIS context stays clean.
- Before executing ANY plan: run the `plan-reviewer` subagent on the plan file, fix every
  `required` finding, and only then write code. Design bugs are cheapest to fix in the plan.
- After implementing a change, run the `reviewer` subagent before committing.
- Self-verify: run `pnpm typecheck` and `pnpm test`; fix until green before saying done.
- Use plan mode (shift+tab) for multi-file / cross-package work.
- `/clear` between unrelated tasks. When context fills, `/compact` with a focus note.
