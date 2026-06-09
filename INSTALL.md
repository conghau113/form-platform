# Where each file goes (overlay at the monorepo root)

```
<repo-root>/
  AGENTS.md                  single source of truth (Cursor reads natively)
  CLAUDE.md                  imports AGENTS.md (@AGENTS.md) + Claude Code notes
  biome.json                 lint + format config
  .claude/
    settings.json            autonomous permissions + PostToolUse format hook
    agents/explorer.md        Haiku read-only researcher (context isolation)
    agents/reviewer.md        Opus diff reviewer against golden rules
  .cursor/rules/
    000-core.mdc             alwaysApply, kept short (token tax)
    schema.mdc               auto-attaches on packages/*-schema/**
    renderers.mdc            auto-attaches on packages/form-renderer-*/**
```

## Notes
- `CLAUDE.md` uses `@AGENTS.md` so there is ONE context file, not two that drift.
- Per-package nested `CLAUDE.md` is supported — add tiny ones only where a package
  needs special notes; Claude Code loads them on demand, not globally.
- The format hook needs `jq` installed. Adjust or remove if you prefer.
- Cursor: turn on Agent mode + auto-run, and add the same allowlist spirit in
  Settings > Agent (allow pnpm/git, deny push/publish/rm).
- Hooks/permissions schema evolve — pin tool versions and re-check the docs on setup.
