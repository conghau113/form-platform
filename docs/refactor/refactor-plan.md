# Refactor plan — apps cleanup (builder god-component + feature folders + react-query)

> Companion to [frontend-architecture.md](./frontend-architecture.md) (the target state) and
> [AGENTS.md](../../AGENTS.md) (golden rules). This file is the **execution checklist**.
>
> **Strategy (owner-locked 2026-06-18):** incremental, one branch/PR per phase, typecheck+test
> green between every phase, **pure structural — no behaviour change**. react-query: YES.
> Extract a `form-builder-core` package: NOT NOW (keep logic in-app, foldered).

---

## Progress log

> **RESUME HERE (next session):** Branch `refactor/r0-safety-net` (off `feat/builder-ux-g3-u1` =
> main+3; NOT bare main, since G3+U1 is unmerged). **R0–R7 ALL done & committed** (`1d64574`,
> `5d44a53`, `1bc12c4`, R3 `cefe4fc`, R4 `2e749fc`, R5 `004a8a2`, R6 `2e1dbad`, R7 = this commit).
> **R4 done & COMMITTED** (reviewer PASS, no blockers,
> 1 nit folded — package.json alpha order): `@tanstack/react-query` added to the builder; workspace
> (`useProjects`/`useProjectTree`) + presets (`usePresets`) migrated off hand-rolled
> `useState`+`useEffect`+`alive` to `useQuery`/`useMutation` with `invalidateQueries`. New
> `query/{queryClient,keys,index,testing}`; `main.tsx` wraps `<QueryClientProvider>` (+ dev
> Devtools); `reload()` → cache `invalidate()` (ExplorerRail/ProjectWorkspace prop renamed).
> typecheck clean, builder 255/255 (R0 characterization + presets tests pass; presets test now uses
> a stateful fake `/presets` server under a QueryClientProvider), prod build green (3370 modules).
> **R5 done & COMMITTED** (reviewer PASS): `useFormPersistence` save → `useMutation`; `fetch(` now
> ONLY in the 3 `client.ts`. **R6 done & COMMITTED** (reviewer PASS, api 47/47): rewrote stale
> `apps/api/ARCHITECTURE.md`; global `ValidationPipe` + class-validator DTOs for non-contract bodies
> (projects/folders/members/form-move); contract bodies (form/theme/preset) stay schema-validated;
> new `dto-validation.test.ts` pins 400-at-edge. **R7 done & COMMITTED** (`structure.test.ts` guard
> against new root `src/*.tsx`; rewrote `apps/builder/ARCHITECTURE.md`; updated repo-map skill;
> cross-linked from AGENTS.md). **REFACTOR R0–R7 COMPLETE.**
>
> **Remaining before merge (owner):** (1) browser smoke for R3–R5 — undo/redo, copy/paste, kbd
> move, delete, save→clean+rail refresh, load→form+theme, import/export, unsaved-changes guard,
> projects/folders/forms CRUD, preset save/delete/promote, edit-preset→linked-preview-updates-live.
> (2) Merge `refactor/r0-safety-net` → `main`. Branch is off `feat/builder-ux-g3-u1` (=main+3, G3+U1
> unmerged) — decide that ordering at merge time. NOTE: `apps/api` typecheck/build runs `prisma
> generate` (Windows Prisma EPERM) — run `tsc --noEmit` directly; build the builder alone for FE.
>
> **Verification (2026-06-19):** builder prod build green (R3 3353 → R4 3370 modules); full suite
> 255/255; R3 real-browser smoke at `/projects/x/forms/y` (no API needed — App seeds the example
> form): palette/canvas/property-panel render, clicking a canvas field selects it + populates the
> PropertyPanel. Only benign console noise (404s from the absent API, antd v5 deprecations, RR
> future-flag). R4 browser smoke (projects/folders/forms CRUD + preset save/delete/promote + W4
> live-propagation) still pending owner.

| Phase | Status | Branch | Notes |
|---|---|---|---|
| R0 — Safety net | ✅ DONE (1d64574) | `refactor/r0-safety-net` | baseline typecheck 15/15 + builder 250 green; added `App.characterization.test.tsx` (5 tests) pinning save/load/dirty/keydown wiring → 255 green. No `App.test.tsx` existed before. |
| R1 — Relocate root files | ✅ DONE | `refactor/r0-safety-net` | 8 feature folders + barrels (`palette/reactions/datasource/theme/templates/workflow/lib/editor`); `app/`→`editor/` (Win casing); cut a palette↔presets barrel cycle. typecheck clean, 253/255 (2 known load-flaky). |
| R2 — Split DesignCanvas | ✅ DONE | `refactor/r0-safety-net` | 812→~700 LOC component. Pure geometry→`engine/geometry.ts`(+test); `DesignerValue`/context/`useDesigner`→`canvas/DesignerContext.tsx`; component+`useDragon`→`canvas/` + barrel. Context-consumers import `../canvas/DesignerContext` directly (lean/cycle-proof). typecheck clean, 255/255. |
| R3 — Decompose App.tsx | ✅ DONE (cefe4fc) | `refactor/r0-safety-net` | 604→388 LOC shell (logic ~240 + JSX layout ~148). 4 hooks + a client extracted into `editor/`: `useFormEditor` (history/selection/clipboard + derived schema/json/selected/fieldNames + applyJson/loadSchema), `useEditorShortcuts` (keydown, dep set `[history,tree,selection,clipboard]` preserved verbatim w/ biome-ignore), `useFormPersistence` (tokens/savedTokens/savedIndex + onSave/onLoad via new `client.ts` + formId load-on-mount), `useNavigationGuard` (dirty + onDirtyChange + latestSave-ref/stableSave/provideSave + beforeunload). `client.ts` = the only `fetch` site (postForm/postTheme/getForm/getTheme + `API` const). barrel updated. typecheck clean, biome clean, builder 255/255 (R0 characterization passes UNCHANGED). reviewer PASS no blockers. **Browser smoke pending owner.** |
| R4 — react-query workspace/presets | ✅ DONE | `refactor/r0-safety-net` | `@tanstack/react-query` added; `query/` module (queryClient + `qk` keys + barrel + test helpers); `main.tsx` wraps `QueryClientProvider` (+ dev Devtools). `useProjects`/`useProjectTree`/`usePresets` → `useQuery`+`useMutation`; deleted every `alive` flag + manual `loading`/`reload` → `invalidateQueries`. W4 invariant preserved (one cache entry per `qk.presets(projectId)`, App calls `usePresets` once). presets test → stateful fake server + provider wrapper; R0 characterization wrapped in `renderWithQuery`, assertions unchanged. typecheck clean, 255/255, prod build green (3370 modules). reviewer PASS. Browser smoke pending owner. |
| R5 — react-query form save/load | ✅ DONE | `refactor/r0-safety-net` | `useFormPersistence` save → `useMutation` (snapshot {index,tokens} → POST form→theme via client → onSuccess commits clean baselines + invalidates `qk.form(id)`/`qk.theme(id)` + `onSaved?.()`). `onSave(): Promise<boolean>` preserved (nav-guard ref + Save button). Load stays imperative (resets history). `fetch(` now ONLY in editor/workspace/presets `client.ts`. typecheck clean, 255/255 (R0 characterization 5/5 unchanged), prod build green. reviewer PASS. Browser smoke pending owner. |
| R6 — api polish | ✅ DONE | `refactor/r0-safety-net` | Rewrote stale `apps/api/ARCHITECTURE.md` (Prisma + controller/service/repo layering + RBAC `requireAccess` + the two validation gates). Added `class-validator`/`class-transformer` + global `ValidationPipe({whitelist,transform,exposeUnsetFields:false})`. class-validator DTOs under `modules/*/dto/` for NON-contract bodies (projects/folders/members/form-move); contract bodies (form/theme/preset) stay `@Body() unknown` → schema `migrate()`/parse (no duplication). New `dto-validation.test.ts` proves 400-at-edge + whitelist strip + `parentId` presence invariant. api 47/47 (+6), tsc clean, biome clean. reviewer PASS. |
| R7 — guardrails | ✅ DONE | `refactor/r0-safety-net` | `structure.test.ts` guard (no new root `src/*.tsx`); rewrote `apps/builder/ARCHITECTURE.md` top-level layout → feature-folder map + react-query section; updated `repo-map` skill (builder folders + api Prisma/DTO); cross-linked refactor docs from `AGENTS.md`. builder 256/256 (1 known load-flake isolated-passes). **R0–R7 COMPLETE.** |

## Structure decision (2026-06-19): keep FLAT feature folders, reject full FSD

An external review (Codex) proposed a full Feature-Sliced Design layout
(`app/pages/features/entities/shared` + 6 new packages: `form-builder-core`, `api-contracts`,
`api-client`, `ui`, `config`, `testing`). **Decision: keep the flat post-R1 feature folders.**
- The real maintainability wins are R3 (god-component split) + react-query (R4/R5) — those happen
  regardless of folder depth. Flat-vs-FSD is largely cosmetic.
- Re-nesting ~70 already-foldered files into `features/*/` is a second mass move touching hundreds
  of import lines for marginal benefit — the exact waste we are avoiding.
- `entities/` would duplicate `@org/form-schema` (the contract) → violates the project's #1 rule.
- Owner chose "no new packages." `form-builder-core` stays deferred (no 2nd consumer).
- Revisit FSD-lite only if a 2nd app (e.g. an embed portal) or a multi-dev team appears.

## Anti-waste principles (read before starting)

This refactor only pays off if it is done deliberately. Four rules keep it from becoming churn:

1. **Every phase ships something real.** No phase may end with "infrastructure added but unused."
   If a PR has no observable improvement (cleaner tree, deleted boilerplate, or a working
   migrated feature), it is mis-scoped — merge it into the phase that consumes it.
2. **Do it as a block, before more features pile on.** The feature roadmap (V2→R2→R7) is
   paused. **Land R0–R3 (the structural core) first and merge to `main` fast**, so new feature
   branches build on the new layout. A big file-move that races against in-flight feature
   branches = merge hell. If a feature is urgent, do it on the *new* structure, not in parallel
   with the move.
3. **`pnpm test` is necessary, not sufficient.** Drag, marquee, column-resize, spring-load,
   keyboard nav, and the save/load round-trip are **not** fully unit-tested. Each phase that
   touches them has a **manual smoke gate** (browser) — skipping it is how a "green" refactor
   ships a broken canvas.
4. **Characterize before you cut.** Where behaviour is untested (notably `App.tsx`), write
   tests that capture *current* behaviour **first**, then refactor under them. A refactor with
   no safety net is a rewrite in disguise.

## Ground rules for every phase

1. Branch off `main`: `refactor/<phase-id>-<slug>`. Merge to `main` quickly; don't let branches rot.
2. **Behaviour must not change.** Existing tests stay green *without edits to their assertions*
   (moving a test file / fixing an import is fine; changing an assertion means you changed
   behaviour — stop and flag it).
3. Builder imports are extensionless and resolve folders via `index.ts` — when you move a file,
   maintain the barrel and update importers. Watch for circular imports through barrels.
4. `pnpm typecheck && pnpm test` + the phase's manual smoke gate before every commit; run the
   `reviewer` subagent; biome only on touched files.
5. One phase = one focused PR. Record every moved path in the PR description.

---

## Phase R0 — Safety net BEFORE any move (this is real work, not a formality)

The single highest-leverage phase. `App.tsx` (the thing R3 dismantles) has **no
`App.test.tsx`** today — its keyboard shortcuts, save/load, and dirty-guard are only covered
indirectly. Build the net first.

- [ ] Baseline: `pnpm typecheck` + `pnpm test` green; record builder test count; confirm/annotate
      any load-flaky tests (they pass in isolation) so they aren't blamed on the refactor.
- [ ] **Audit coverage of `App.tsx` behaviour.** List what is and isn't tested:
      keyboard (undo/redo, select-all, copy/paste, keyboard-move, delete), save/load (form +
      theme), dirty calc + nav guard, import/export.
- [ ] **Write characterization tests for the gaps** (`editor/App.test.tsx` or focused hook tests),
      mocking `fetch`. These assert *current* behaviour exactly — they are the contract R3 must
      preserve. Do not "fix" anything here; just pin behaviour.
- [ ] Manual smoke once, to know the baseline UX: load a form, drag a field from the palette,
      marquee-select, resize a column, undo/redo, save, reload. Note anything already quirky.
- [ ] Commit: the two refactor docs + the new characterization tests (a genuinely valuable
      commit on its own — better-tested editor even if we stopped here).

**Definition of done:** the editor's core behaviours are now pinned by tests that will fail
loudly if R2/R3 change them.

---

## Phase R1 — Relocate root feature files into folders (pure move) ✅ DONE

Biggest readability win, lowest risk. Move, add barrels, fix imports. **No logic edits.**

- [x] `palette/` ← `Palette.tsx`, `PaletteChip.tsx`
- [x] `reactions/` ← `ReactionsEditor.tsx` (+ `.test`)
- [x] `datasource/` ← `DataSourceEditor.tsx` (+ `.test`), `TreeOptionsEditor.tsx` (+ `.test`)
- [x] `theme/` ← `ThemeEditor.tsx`
- [x] `templates/` ← `TemplateGallery.tsx` (+ `.test`), `templates.ts`
- [x] `workflow/` ← `WorkflowEditor.tsx`, `workflow-model.ts` (+ `.test`)
- [x] `lib/` ← `io.ts` (+ `.test`), `pins.ts` (+ `.test`)
- [x] `editor/` ← `history.ts` (+ `.test`) (the editor-state hook wrapper; renamed from `app/`
      to avoid a Windows case collision with `App.tsx`)
- [x] Each new folder gets `index.ts` (public surface only); importers updated to barrels.
- [x] Broke a would-be import cycle: `presets/PresetSection` imports `DraggableChip` from the
      `../palette/PaletteChip` file directly (the `../palette` barrel pulls in `Palette`, which
      imports the preset module).

**Result:** root `src/*.tsx` reduced to `App.tsx` + `DesignCanvas.tsx` (R2) + `main.tsx` +
`useDragon.ts` (R2) + 2 folder-test files. typecheck clean; builder 253/255 (the 2 fails are the
known load-flaky `PropertyPanel.validation` severity tests — 14/14 in isolation).

**Smoke gate:** app boots, every relocated feature still opens (palette drag, reactions editor,
datasource editor, theme editor, template gallery, workflow tab). **DoD:** typecheck + full test
green, no assertion changed.

---

## Phase R2 — Split `DesignCanvas.tsx` (812 LOC → 3 concerns) ✅ DONE

- [x] Moved pure geometry (`edgeScroll`, `springLoadTarget`, `normalizeBox`, `boxesIntersect`,
      `Box`) → `engine/geometry.ts`; moved their 3 tests → `engine/geometry.test.ts`.
- [x] Extracted `DesignerValue`/`DesignerProvider`/`useDesigner` → `canvas/DesignerContext.tsx`.
- [x] `DesignCanvas.tsx` + `useDragon.ts` → `canvas/` with `index.ts` barrel. Importers updated:
      `App`→`./canvas`, `ViewPanel`→`../canvas`; context-only consumers (`Palette`,
      `PresetSection`, `OutlineTree`, `OutlineTree.test`) import `../canvas/DesignerContext`
      directly to keep their module graph lean and cycle-proof.

**Result:** root `src/*.tsx` is now just `App.tsx` + `main.tsx` (+ 2 folder-test files). typecheck
clean; builder 255/255 (all green this run). Browser smoke gate (drag/marquee/resize/spring-load)
still pending owner verification.

**Smoke gate (browser, required):** drag-create from palette, on-canvas move, marquee select,
**column resize** (the D8 grid drag), **spring-load** (dwell over a closed tab/collapse mid-drag),
auto-scroll near edges. **DoD:** geometry tests pass unchanged in their new home.

---

## Phase R3 — Decompose `App.tsx` (604 LOC) into hooks + thin shell

The god component. Extract **one hook at a time**, re-running R0's characterization tests after
each extraction. Known closure/state landmines — get these right or behaviour drifts silently:

- ⚠️ The `keydown` effect depends on `[history, tree, selection, clipboard]` — preserve the exact
  dep set or shortcuts go stale.
- ⚠️ `useFormPersistence` must keep the **`latestSave` ref** trick (the nav guard calls a stable
  fn that reads the newest closure) — naively passing `onSave` reintroduces the stale-save bug.
- ⚠️ `dirty = history.index !== savedIndex || JSON.stringify(tokens) !== JSON.stringify(savedTokens)`
  — both halves must survive; theme edits count as dirty.
- ⚠️ The `formId` load effect is intentionally keyed on `formId` only (biome-ignored) — keep it.

Extraction order:

- [x] `editor/useFormEditor.ts` — `history` + `selection` + `clipboard` + derived
      `schema`/`json`/`selectedNode`/`fieldNames`. Returns a typed object.
- [x] `editor/useEditorShortcuts.ts` — the `window keydown` effect (exact deps preserved).
- [x] `editor/useFormPersistence.ts` — save/load form **and** theme; inline `fetch` moved into
      `editor/client.ts` (postForm/postTheme/getForm/getTheme) consumed here. Plain hook for now
      (react-query swap is R5); the `latestSave` ref lives in `useNavigationGuard` (unchanged).
- [x] `editor/useNavigationGuard.ts` — `dirty`, `beforeunload`, `onDirtyChange`, `provideSave`.
- [x] `App.tsx` → wiring + layout only. **604 → 388 LOC** (logic ~240, JSX layout ~148 — the
      remaining bulk is the irreducible header/3-pane layout; the tangled God-component *logic*
      is fully extracted, which was the actual goal). All `fetch` now lives in `client.ts`.

**Smoke gate (browser, required):** every R0 behaviour — undo/redo, copy/paste, keyboard move,
delete, save (marks clean + refreshes rail), load (applies form + theme), import/export, and the
unsaved-changes guard on navigate + on refresh. **DoD:** R0 characterization tests pass *unchanged*.

> After R3 lands and merges, the structural core is done. R4–R6 are independent improvements that
> can be sequenced or paused without leaving the tree in a worse state.

---

## Phase R4 — react-query for workspace + presets (infra **and** first migration in one PR)

> Infra alone delivers nothing, so it ships together with the hooks that use it — this single PR
> deletes the hand-rolled `alive`-flag/`reload()` boilerplate and replaces it with cache +
> invalidation. That is the observable win.

- [x] Add `@tanstack/react-query` (+ devtools in dev) to `apps/builder`.
- [x] `query/queryClient.ts` (conservative editor defaults: `refetchOnWindowFocus: false`,
      `staleTime: 30s`, `retry: false`) + wrap app in `<QueryClientProvider>` in `main.tsx`
      (+ dev-only `<ReactQueryDevtools>`). Plus `query/index.ts` barrel + `query/testing.tsx`
      (`renderWithQuery`/`renderHookWithQuery` test helpers).
- [x] `query/keys.ts` key factory (`qk.projects`, `qk.projectTree(id)`, `qk.presets(projectId?)`,
      `qk.form(id)`, `qk.theme(id)` — last two staged for R5).
- [x] `workspace/useWorkspace.ts` → `useQuery`/`useMutation`; `useProjectTree` uses
      `enabled: !!projectId`. Deleted every `alive` flag + manual `loading`; `reload()` replaced by
      a cache `invalidate()` (ExplorerRail/ProjectWorkspace prop renamed `reload`→`invalidate`);
      project create/rename/remove are mutations that `invalidateQueries`.
- [x] `presets/usePresets.ts` → `useQuery` + save/remove/promote mutations that `invalidateQueries`.
      W4 invariant preserved: App calls `usePresets(projectId)` ONCE and threads the resolver down,
      so gallery + link UI + preview share the single `qk.presets(projectId)` cache entry.
- [x] `templates`: LEFT as-is — `useUserTemplates` is localStorage-only (not server state).

**Smoke gate (browser, required):** projects/folders/forms CRUD; preset save/delete/promote;
**edit a preset → its linked field's preview updates live** (the W4 invariant). **DoD:** no `alive`
flag remains in these hooks.

---

## Phase R5 — react-query for form save/load

- [x] `useFormPersistence` (from R3) → `useMutation` for save: mutationFn snapshots
      `{historyIndex, tokens}` and POSTs form→theme via `./client`, throwing tagged errors on
      non-OK; `onSuccess` commits the clean baselines, invalidates `qk.form(id)` + `qk.theme(id)`,
      and fires `onSaved?.()` (the workspace-tree refresh seam — the tree key stays decoupled from
      this hook). Public `onSave(): Promise<boolean>` preserved for the nav-guard ref + Save button.
      Load stays IMPERATIVE on mount (it resets editor history → a passive cached query must not).
- [x] Grep `apps/builder/src` for `fetch(` — appears **only** in the 3 `*/client.ts`
      (editor/workspace/presets). ✓

**Smoke gate (browser, required):** save marks clean + refreshes rail + `onSaved` fires; load
applies form + theme. **DoD:** zero raw `fetch` outside `client.ts`. **DONE** — reviewer PASS,
typecheck clean, builder 255/255 (R0 characterization 5/5 unchanged), prod build green. Browser
smoke pending owner.

---

## Phase R6 — Backend polish (api) — independent, branch off `main` any time

- [x] Updated [apps/api/ARCHITECTURE.md](../../apps/api/ARCHITECTURE.md) — now reflects Prisma +
      the controller/service/repo-interface layering + RBAC `requireAccess` + the two validation
      gates + every module/endpoint (was stale "file-backed only", forms/themes only).
- [x] Added `class-validator`/`class-transformer` + global `ValidationPipe({ whitelist: true,
      transform: true, transformOptions: { exposeUnsetFields: false } })` in `main.ts`.
      `exposeUnsetFields: false` (with tsconfig `useDefineForClassFields: false`) keeps an absent
      optional absent → the folder-move path's `"parentId" in dto` check stays correct.
- [x] Request DTOs under `modules/<feature>/dto/` for **non-contract** bodies: projects
      (create/update), folders (create/update), members (grant/update-role), forms (move).
      **Contract bodies (form/theme/preset) stay `@Body() unknown`** → schema `migrate()` /
      `migrateTheme()` / preset-parse (the pipe skips `Object` metatype — no duplicated validation).
      DTOs imported as VALUES in controllers (`emitDecoratorMetadata` needs the runtime class ref).
- [x] Confirmed no controller imports Prisma (only persistence/prisma/* touch it); no service reads
      `req`/`res`.

**DoD:** `pnpm --filter api test` green (**47/47**, +6 new `dto-validation.test.ts`); malformed
workspace payloads return **400 at the edge** (pinned by the new test: wrong type → 400, whitelist
strips unknowns, role narrowing, `parentId` presence). tsc clean, biome clean. reviewer PASS.
**DONE.** (DTOs for the preset body were intentionally NOT added — the preset is a contract type
validated by `@org/form-schema`; a class-validator DTO would duplicate the contract.)

> Lower priority than R0–R5 (the stated pain is the frontend). The ARCHITECTURE.md fix is worth
> doing regardless; the DTO work is optional polish.

---

## Phase R7 — Guardrails so the debt doesn't return

- [x] Discourage new top-level `apps/builder/src/*.tsx` — a **test guard** (`src/structure.test.ts`)
      asserts root non-test `*.tsx` ⊆ `{App.tsx, main.tsx}`; a stray `src/Foo.tsx` fails the suite by
      name (stronger than a Biome import rule, which can't see file placement).
- [x] Updated [apps/builder/ARCHITECTURE.md](../../apps/builder/ARCHITECTURE.md) — top-level layout
      is now the feature-folder map (editor/canvas/palette/presets/workspace/query/…) + a
      "react-query only / `fetch` in `client.ts`" section. Updated the `repo-map` skill's builder +
      api rows (builder feature folders; api Prisma + controller/service/repo + DTOs).
- [x] Cross-linked the refactor docs + per-app `ARCHITECTURE.md` from `AGENTS.md` (one bullet under
      Conventions).

**DONE.** builder 256/256 (the new structure test; 1 PropertyPanel.validation severity test is the
known load-flake — 14/14 isolated). typecheck + biome clean. **Refactor R0–R7 COMPLETE.**

---

## What we explicitly are NOT doing (avoids the classic refactor over-reach)

- **No `@org/form-builder-core` package.** `engine/` is already pure + tested; no second consumer
  exists. Revisit when the native renderer or a second editor app needs it.
- **No 4-layer DDD on the backend.** Controller/service/repo + DTOs is the right altitude.
- **No state library** (zustand/redux). `useHistory` + extracted hooks (client state) +
  react-query (server state) cover it.
- **No feature/behaviour changes.** Entirely structural. Feature expansion resumes on
  V2→R2→R7 (memory `renderer-portability-track-v`) — on the *new* structure, after R0–R3 merge.
- **No mass file renames for taste** (e.g. lowercasing `PropertyPanel/`). Not worth the churn.

## Dependency graph

```
R0 ─→ R1 ─→ R2 ─→ R3        (structural core — land & merge FIRST, in order)
                   └─→ R4 ─→ R5   (react-query; sequential, each ships a real win)
R6 (api)  — independent, any time off main
R7 (guardrails) — last, locks in the result
```
</content>
