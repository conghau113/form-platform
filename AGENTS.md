# Form Platform — agent guide

Schema-driven form (and later workflow) builder. One versioned JSON contract
drives many platform renderers. Read this fully; it is the single source of truth
for every AI agent working in this repo.

## Architecture (non-negotiable)
- The JSON schema IS the contract. `packages/form-schema` (Zod + inferred types)
  is the single source of truth. Renderers CONSUME it; never duplicate validation
  or logic inside a renderer.
- `formVersion` is decoupled from the npm package version. Changing the JSON shape
  requires: bump `CURRENT_FORM_VERSION` + add a migration N->N+1 + a test that
  migrates an old fixture to current. NEVER break older saved JSON.
- One schema, many renderers. Shared behavior (migrate, conditional logic, RBAC)
  lives in `packages/form-core`. Only the leaf component mapping + layout
  interpretation is platform-specific.
- Conditional logic uses JSONLogic via form-core. NEVER eval() / new Function()
  on schema-provided expressions.
- `react`, `react-dom`, `antd`, `react-native` are peerDependencies in renderers.
  Never add them as dependencies; never bundle them.

## Layout
```
packages/
  form-schema       contract: types, Zod, formVersion + migrations (zod only, tiny)
  form-core         shared runtime: JSONLogic conditions, RBAC, registry interface
  form-renderer-web    antd renderer, responsive (24-col xs/sm/md/lg)
  form-renderer-native React Native renderer, single column
  workflow-schema   (later) state machine contract; nodes reference forms by id
  workflow-core     (later) engine, runs on FE AND NestJS BE
apps/
  builder           the drag-drop editor, hosted once (Vite + antd + dnd-kit)
```

## Conventions
- TypeScript strict. No `any` in public APIs. `moduleResolution: bundler`.
- Small, focused modules. Public surface via barrel `index.ts`. This keeps each
  file cheap for an agent to read.
- Tooling: pnpm + Turborepo, Biome (lint+format), Vitest (test), Changesets (release).
- Renderer changes must be ADDITIVE — older schema versions keep rendering.

## Commands
- `pnpm install` · `pnpm build` (turbo) · `pnpm typecheck` · `pnpm test`
- `pnpm biome check --write .` — lint + format
- `pnpm changeset` — record a version bump before any package change is "done"

## Definition of done
typecheck passes, tests pass, biome clean, and a changeset exists for any changed
package. Verify these yourself before reporting completion.
