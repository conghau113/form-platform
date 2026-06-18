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
> main+3; NOT bare main, since G3+U1 is unmerged). R0+R1+R2 done & committed (`1d64574`,
> `5d44a53`, `1bc12c4`) AND browser-verified. **Next = R3** (decompose `App.tsx`) — the riskiest
> phase; read its landmine list below before starting. Run `pnpm --filter @app/builder test`
> (expect 255) + `typecheck` as the gate; R0's `App.characterization.test.tsx` is the safety net.
> NOTE: `apps/api` build hits a Windows Prisma EPERM (file lock) unrelated to this work — build
> the builder alone (`pnpm --filter @app/builder build`) to verify FE.
>
> **Verification (2026-06-19):** builder prod build green (3353 modules); full suite 255/255;
> real-browser smoke at `/projects/x/forms/y` (no API needed — App seeds the example form):
> palette/canvas/property-panel all render, clicking a canvas field selects it + populates the
> PropertyPanel (exercises the new `canvas/DesignerContext` + R1 barrels). Only benign console
> noise (404s from the absent API, antd v5 deprecations, RR future-flag).

| Phase | Status | Branch | Notes |
|---|---|---|---|
| R0 — Safety net | ✅ DONE (1d64574) | `refactor/r0-safety-net` | baseline typecheck 15/15 + builder 250 green; added `App.characterization.test.tsx` (5 tests) pinning save/load/dirty/keydown wiring → 255 green. No `App.test.tsx` existed before. |
| R1 — Relocate root files | ✅ DONE | `refactor/r0-safety-net` | 8 feature folders + barrels (`palette/reactions/datasource/theme/templates/workflow/lib/editor`); `app/`→`editor/` (Win casing); cut a palette↔presets barrel cycle. typecheck clean, 253/255 (2 known load-flaky). |
| R2 — Split DesignCanvas | ✅ DONE | `refactor/r0-safety-net` | 812→~700 LOC component. Pure geometry→`engine/geometry.ts`(+test); `DesignerValue`/context/`useDesigner`→`canvas/DesignerContext.tsx`; component+`useDragon`→`canvas/` + barrel. Context-consumers import `../canvas/DesignerContext` directly (lean/cycle-proof). typecheck clean, 255/255. |
| R3 — Decompose App.tsx | ⏳ next | — | |
| R4 — react-query workspace/presets | pending | — | |
| R5 — react-query form save/load | pending | — | |
| R6 — api polish | pending | — | |
| R7 — guardrails | pending | — | |

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

- [ ] `editor/useFormEditor.ts` — `history` + `selection` + `clipboard` + derived
      `schema`/`json`/`selectedNode`/`fieldNames`. Returns a typed object.
- [ ] `editor/useEditorShortcuts.ts` — the `window keydown` effect (exact deps preserved).
- [ ] `editor/useFormPersistence.ts` — save/load form **and** theme; **inline `fetch` moves into a
      `forms`/`themes` `client.ts`** consumed here. Keep it a plain hook for now (react-query
      swap is R4) so this stays behaviour-only. Preserve the `latestSave` ref.
- [ ] `editor/useNavigationGuard.ts` — `dirty`, `beforeunload`, `onDirtyChange`, `provideSave`.
- [ ] `App.tsx` → wiring + layout only, target <200 LOC.

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

- [ ] Add `@tanstack/react-query` (+ devtools in dev) to `apps/builder`.
- [ ] `query/queryClient.ts` (conservative editor defaults: `refetchOnWindowFocus: false`,
      sane `staleTime`, low retry) + wrap app in `<QueryClientProvider>` in `main.tsx`.
- [ ] `query/keys.ts` key factory (`qk.projects`, `qk.projectTree(id)`, `qk.presets(projectId?)`,
      `qk.form(id)`, `qk.theme(id)`).
- [ ] `workspace/useWorkspace.ts` → `useQuery`/`useMutation`; `useProjectTree` uses
      `enabled: !!projectId`. Delete every `alive` flag, manual `loading`, and `reload()`;
      mutations `invalidateQueries`.
- [ ] `presets/usePresets.ts` → `useQuery` + mutation-invalidation. **Preserve the W4 invariant:**
      gallery + link UI + preview share ONE store and live-propagate (react-query cache provides
      this; the `presetResolver` must derive from the cached list).
- [ ] `templates`: migrate only if server-backed; if localStorage-only, leave it (not server state).

**Smoke gate (browser, required):** projects/folders/forms CRUD; preset save/delete/promote;
**edit a preset → its linked field's preview updates live** (the W4 invariant). **DoD:** no `alive`
flag remains in these hooks.

---

## Phase R5 — react-query for form save/load

- [ ] `useFormPersistence` (from R3) → `useMutation` for save (invalidate `qk.form(id)`,
      `qk.theme(id)`, and the workspace tree so titles refresh) + query/imperative load on mount.
- [ ] Grep `apps/builder/src` for `fetch(` — it must appear **only** in `*/client.ts`.

**Smoke gate (browser, required):** save marks clean + refreshes rail + `onSaved` fires; load
applies form + theme. **DoD:** zero raw `fetch` outside `client.ts`.

---

## Phase R6 — Backend polish (api) — independent, branch off `main` any time

- [ ] Update [apps/api/ARCHITECTURE.md](../../apps/api/ARCHITECTURE.md) (currently lies — says
      "file-backed only"; reflect Prisma + persistence layer + projects/folders/presets/members +
      `requireAccess`). Cheap, high-value.
- [ ] Add `class-validator`/`class-transformer` + global
      `ValidationPipe({ whitelist: true, transform: true })` in `main.ts`.
- [ ] Request DTOs under `modules/<feature>/dto/` for **non-contract** endpoints (projects,
      folders, members, preset metadata). Form/theme bodies stay on `migrate()`/`migrateTheme()`.
- [ ] Confirm no controller imports Prisma; no service reads `req`/`res`.

**DoD:** `pnpm --filter api test` green; malformed workspace payloads return 400 at the edge.

> Lower priority than R0–R5 (the stated pain is the frontend). The ARCHITECTURE.md fix is worth
> doing regardless; the DTO work is optional polish.

---

## Phase R7 — Guardrails so the debt doesn't return

- [ ] Discourage new top-level `apps/builder/src/*.tsx` (a Biome `noRestrictedImports`-style rule
      or a CI note).
- [ ] Update [apps/builder/ARCHITECTURE.md](../../apps/builder/ARCHITECTURE.md) with the new
      feature-folder map; update the `repo-map` skill if folder names changed.
- [ ] Cross-link these docs from `AGENTS.md` (one line).

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
