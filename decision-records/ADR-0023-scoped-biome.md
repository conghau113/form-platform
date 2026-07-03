# ADR-0023: Biome runs scoped to changed files, never repo-wide --write

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04; convention in force during current development (see Evidence).
- **Deciders:** Owner
- **Source:** `.claude/settings.json` PostToolUse hook; memory note `biome-not-clean-at-baseline`; AGENTS.md Commands.

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

Biome is the lint+format tool. AGENTS.md lists `pnpm biome check --write .` as a command,
but the repository **baseline is not Biome-clean** — pre-existing files carry violations
that predate current work. An agent editing a few files could "helpfully" run the
repo-wide command and reformat the entire tree.

## Decision

Biome is applied **scoped to the files an agent actually changed**, never repo-wide with
`--write`. This is enforced automatically: a PostToolUse hook runs
`biome check --write` on **only the edited file's path** after each edit. The repo-wide
`biome check --write .` from AGENTS.md is treated as *not* something an agent runs across
the tree, because the baseline isn't clean; conformance is judged on changed files only.

## Rationale

Running `--write .` on a tree with pre-existing violations would reformat dozens of files
the agent never touched, producing an enormous diff in which the actual change is invisible
and unreviewable — a direct violation of the surgical-changes discipline (touch only what
the task requires). It would also make the agent implicitly "own" and take responsibility
for pre-existing issues it didn't introduce, blurring what a change is accountable for.
Scoping to changed files keeps every diff traceable to the task and lets formatting be
enforced without a disruptive one-time reformat of the whole repo. This *why* previously
lived only in machine-local memory (`biome-not-clean-at-baseline`) — precisely the
ADR-0012 hazard: a future session reading only the AGENTS.md command could run it
repo-wide and generate exactly the noise this convention exists to prevent.

## Evidence

- `.claude/settings.json` — PostToolUse hook: `jq -r '.tool_input.file_path // empty' |
  xargs -r pnpm biome check --write --no-errors-on-unmatched` (biomes **only the edited
  file**, not the tree).
- Memory note `biome-not-clean-at-baseline`: "never `biome check --write .` repo-wide;
  scope to changed files."
- AGENTS.md Commands lists `pnpm biome check --write .` — the command exists, but the
  enforced practice narrows it to changed files for the baseline reason above.
- `biome.json` at repo root; origin commit `b1b7176` *chore: scaffold monorepo tooling +
  agent config*.
