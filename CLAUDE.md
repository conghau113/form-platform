# Project memory

@AGENTS.md

## Governed framework (source of truth for how we work)
- Rules & lifecycle: `governance/` — constitution + policies + charters + procedures (L1, owner-only).
- Extracted knowledge: `knowledge/` — `index.yaml`, `standards/`, `runbook/`, `registries/` (L2, freshness-contracted).
- Decisions: `decision-records/` (ADRs). AGENTS.md golden rules point to their ADR/constitution homes.

## Claude Code specifics (keep this file tiny — it loads every session)
- Use the `explorer` subagent (Haiku) to investigate the repo or read large files.
  Delegate discovery so THIS context stays clean.
- After implementing a change, run the `reviewer` subagent before committing.
- Self-verify: run `pnpm typecheck` and `pnpm test`; fix until green before saying done.
- Use plan mode (shift+tab) for multi-file / cross-package work.
- `/clear` between unrelated tasks. When context fills, `/compact` with a focus note.
