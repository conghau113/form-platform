---
name: feature-module
description: Scaffolding conventions for clean, maintainable code in apps/builder and apps/api — feature folders (no root *.tsx), one-concern files, pure logic in engine/, react-query data hooks (no hand-rolled fetch), NestJS module+DTO layering. Use this WHENEVER adding/refactoring a builder feature, a data-fetching hook, or an API endpoint, so generated code matches the house style.
---

# feature-module — how to write code in this repo

> **Layer:** L3 — Execution Adapter (skill binding). Originates no rule (constitution §2); it is the
> copy-paste rendering of the coding conventions, which live in the source.
> **Source:** [`knowledge/standards/coding-standard.md`](../../../knowledge/standards/coding-standard.md)
> (the extracted L2 standard) + `docs/refactor/frontend-architecture.md` (cited below) + each app's
> `ARCHITECTURE.md`. The additive-schema / no-`--write .` rules are L1 (ADR-0014 / ADR-0023).
> **Regenerated:** E5 T5.1.1 · 2026-07-05 — verified against source, no drift.

Authoritative source: [docs/refactor/frontend-architecture.md](../../../docs/refactor/frontend-architecture.md).
Refactor sequencing: [docs/refactor/refactor-plan.md](../../../docs/refactor/refactor-plan.md).
This skill is the **checklist + copy-paste templates**. Follow it before writing app code so
output is clean on the first pass, not after review.

## The five rules (memorise)

1. **No top-level `apps/builder/src/*.tsx`.** Every feature is a folder with an `index.ts`
   barrel. Import sibling features via the barrel, never reach into internals.
2. **One concern per file.** Pure logic → `*.ts` (+ `*.test.ts`, no React/antd import).
   React → `*.tsx`. Context → its own file. An exported pure helper inside a `.tsx` = defect.
3. **Components are thin.** ~250 LOC component budget; ~150 LOC hook; `App.tsx` <200 (wires
   only, never computes). Over budget ⇒ extract a hook or subcomponent.
4. **Server data = react-query.** `client.ts` (transport, the only place `fetch` is allowed)
   → `useQuery`/`useMutation` hook → component. Keys from `query/keys.ts`. Never re-introduce
   `useState`+`useEffect`+`alive`-flag fetching, nor a manual `reload()` — invalidate instead.
5. **Behaviour-preserving refactors keep tests green unedited.** Changing an assertion means
   you changed behaviour — stop and say so.

## Two habits that stop wasted work

- **Characterize before you cut.** Refactoring code whose behaviour isn't tested? Write tests
  pinning the *current* behaviour first, then refactor under them.
- **`pnpm test` ≠ verified.** Drag, marquee, column-resize, spring-load, keyboard nav, and
  save/load are browser behaviours. After touching them, smoke-test in a real browser — green
  units do not prove the canvas still works.

## Import conventions (don't mix)

- `apps/builder`: **no** extension; folder import → its `index.ts`.
- `apps/api` & `packages/form-renderer-web`: explicit **`.js`** extension (NodeNext).

---

## Template: a new builder feature folder

```
apps/builder/src/<feature>/
  <Feature>.tsx        # the component(s) — thin, declarative
  use<Feature>.ts      # local hook if there is stateful logic
  <feature>-logic.ts   # pure helpers + a .test.ts (if any)
  index.ts             # barrel: public surface ONLY
```

`index.ts`:
```ts
export { Feature } from "./Feature";
export type { FeatureProps } from "./Feature";
```

## Template: a data hook (react-query)

`client.ts` — transport (one fn per endpoint, throws server message on non-OK):
```ts
export async function listThings(): Promise<Thing[]> {
  const res = await fetch(`${API_BASE}/things`, { headers: ownerHeaders() });
  if (!res.ok) throw new Error(`List things failed: ${await readError(res)}`);
  return (await res.json()) as Thing[];
}
```

`query/keys.ts` — add the key:
```ts
things: ["things"] as const,
thing: (id: string) => ["things", id] as const,
```

`useThings.ts` — the hook:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query/keys";
import * as api from "./client";

export function useThings() {
  return useQuery({ queryKey: qk.things, queryFn: api.listThings });
}

export function useCreateThing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createThing,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.things }),
  });
}
```

Component reads `data`/`isPending`/`error` from the result — **no** local `loading`, **no**
`alive` flag, **no** manual `reload()`.

## Template: extracting a hook out of a fat component

Hook = React-state shell; call pure functions for the real work (mirror how `app/history.ts`
wraps `engine/history.ts`). Watch for closure landmines: preserve effect dep arrays exactly, and
keep `ref`-based "latest closure" tricks where a stable callback must read fresh state.
```ts
export function useFormEditor(initial: FormSchema) {
  const history = useHistory(() => schemaToTree(initial));   // engine = pure
  const [selection, setSelection] = useState(emptySelection);
  const schema = useMemo(() => treeToSchema(history.present), [history.present]);
  return { history, selection, setSelection, schema };       // typed object, not a tuple
}
```

## Template: a NestJS endpoint (api)

```
src/modules/<feature>/
  <feature>.module.ts      # imports controllers + providers; register in app.module.ts
  <feature>.controller.ts  # HTTP edge only — validate (DTO) + delegate to service
  <feature>.service.ts     # logic + access checks (requireAccess), calls repo interface
  dto/<action>.dto.ts      # class-validator DTO for non-contract bodies
```

- Controller never imports Prisma; service never reads `req`/`res`; repo holds no business
  rules. Data access goes through the repo **interface** in `persistence/repositories/`,
  implemented in `persistence/prisma/`.
- Non-contract bodies (projects/folders/members/preset metadata) get a DTO + the global
  `ValidationPipe`. Form/theme bodies stay validated by `migrate()`/`migrateTheme()`.

---

## Before you say "done"

- [ ] `pnpm typecheck` + `pnpm test` green **and** the relevant browser smoke gate passed.
- [ ] `pnpm biome check` clean on **touched** files only (never `--write .` repo-wide).
- [ ] No new root `apps/builder/src/*.tsx`; new folders have an `index.ts`.
- [ ] No `fetch(` outside a `client.ts`.
- [ ] Changeset for any changed **published** package (`packages/*`); `apps/*` need none.
- [ ] Changed the JSON contract shape? Migration + version bump + test (additive-schema rule) —
      otherwise STOP.
- [ ] Ran the `reviewer` subagent.
```
