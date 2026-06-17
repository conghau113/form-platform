# Track W — Workspace: Projects, Folders & Project-scoped Field Library

> Planning doc (written 2026‑06‑16). Owner goal: turn the single‑form builder into a
> **production workspace** where users organise forms in **projects → nested folders
> (unlimited depth)**, and reuse a **named, project‑scoped field library** (presets like
> `organization_select`, `department_select`) across the features of a project.
>
> This is a *new track*, orthogonal to the builder‑UX v2 doc (taxonomy / setters / icons /
> presets P1–P3, all done). It adds an **organisational / CMS layer** on top of the form
> contract — it does **not** change the form contract for phases W0–W3.

---

## 0. The one principle that governs everything

**Organisational metadata lives OUTSIDE the versioned form contract** — exactly the call we
already made for `presets` and `theme`.

- A form's JSON (`formVersion`, `id`, `title`, `fields`, …) stays a **pure, renderer‑facing
  contract**. It NEVER gains `projectId` / `folderId`.
- *Where* a form sits in the tree is a separate **`FormRecord` index** linked by `form.id`.
- Consequence: re‑organising projects/folders never bumps `formVersion`, never touches a
  renderer, never needs a migration. The contract and the workspace evolve independently.

Only **W4 (linked fields)** ever touches the contract, and it does so additively
(`{ presetId, overrides? }`). Because both keys are *new optional* props (same character as
`validations`/`reactions`), this is purely additive: old JSON keeps parsing, so it needs **no
`CURRENT_FORM_VERSION` bump and no migration** — only a parse-compat test (per the additive
rule). The earlier "bump + migration + fixture" framing was corrected once W4 was built.

---

## 1. Outcome — what the user gets when Track W is done

- **Projects**: top‑level containers a user owns (e.g. "HR Platform", "Sales CRM").
- **Folders**: unlimited nesting inside a project (e.g. `HR / Onboarding / Step 1`), to group
  forms by feature. Rename, move (drag), delete; deleting a non‑empty folder is guarded.
- **Form management**: every form lives in exactly one folder (or the project root). Browse,
  search, create, duplicate, move, delete from an **Explorer** panel — no more "load by id".
- **Project field library**: named presets scoped to a project. A designer authors
  `organization_select`, `department_select`, … once; every feature/form drags them in.
  A global library exists too, for presets reused across projects.
- **Linked fields (W4, north star)**: a form field can *reference* a library preset; editing
  the preset propagates to every form using it, with per‑field `overrides` for local tweaks.
- **Ownership + minimal auth**: each project has an `ownerId`; a lightweight session gates
  access. Full multi‑tenant sharing/roles is deferred (W5) but the schema is owner‑aware
  from day one so it never needs a destructive refactor.

---

## 2. Locked decisions (owner delegated → recommended, 2026‑06‑16)

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| D1 | **Preset semantics** | **Hybrid (link + override), staged** | Vision is a design‑system → needs propagation. Ship copy‑on‑use now (exists), add linked+override in W4. |
| D2 | **Preset scope** | **Global + per‑project (2 levels)** | `organization_select` is project‑local, but a shared org library is wanted too. Allow "promote to global". |
| D3 | **Auth / tenancy** | **Design `ownerId` now, minimal auth first** | Owner‑aware schema from day one avoids a painful refactor; heavy multi‑tenant deferred to W5. |
| D4 | **Storage** | **Real DB (Prisma; SQLite dev / Postgres prod) behind a repository interface** | project→folder→form is relational + concurrent; file‑backed would be thrown away. Repo interface keeps controllers DB‑agnostic. |

---

## 3. Data model

```
Workspace?  (W5)         tenant boundary; deferred. ownerId on Project is the seam.
Project   { id, ownerId, name, slug, description?, createdAt, updatedAt }
Folder    { id, projectId, parentId | null, name, order, createdAt }   // adjacency list → unlimited tree
FormRecord{ id(=form.id), projectId, folderId | null, title, status?, updatedAt }   // org index, NOT the contract
  └─ Form JSON  (the contract — stored as today, keyed by id; unchanged)
Theme     { formId, tokens }                                          // already exists, re‑keyed by formId
Preset    { id, scope: "global" | "project", projectId | null,        // P1 shape + scope/owner
            name, fieldType, icon?, patch, ownerId, updatedAt }
```

**Tree = adjacency list (`parentId`)**, not materialized path or nested‑JSON:
- `parentId = null` → a project‑root folder; nest infinitely by pointing at a parent.
- Maps 1‑to‑1 to a SQL table; the `/projects/:id/tree` endpoint returns the flat folder +
  formRecord lists and the **client builds the tree** (antd `Tree` / `DirectoryTree`).
- Moving a form = update one `folderId`; moving a folder = update one `parentId`. No file
  rewrites, no cascade churn (guard against cycles on move).

**Why `FormRecord` is separate from the form JSON**: the contract stays pure; the index holds
the cacheable, query‑able org metadata (`title`, `folderId`, `updatedAt`, `status`) so listing
a folder never parses every form body.

---

## 4. Prisma schema sketch (W0/W1)

```prisma
model Project {
  id          String   @id @default(cuid())
  ownerId     String
  name        String
  slug        String
  description String?
  folders     Folder[]
  forms       FormRecord[]
  presets     Preset[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([ownerId, slug])
}

model Folder {
  id        String   @id @default(cuid())
  projectId String
  parentId  String?
  name      String
  order     Int      @default(0)
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parent    Folder?  @relation("FolderTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  Folder[] @relation("FolderTree")
  forms     FormRecord[]
  createdAt DateTime @default(now())
  @@index([projectId, parentId])
}

model FormRecord {
  id        String   @id            // == form.id; the contract JSON is stored alongside (json column or blob)
  projectId String
  folderId  String?
  title     String
  status    String?                 // draft|published (optional)
  body      Json                    // the migrated form contract (source of truth stays migrate())
  updatedAt DateTime @updatedAt
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  folder    Folder?  @relation(fields: [folderId], references: [id], onDelete: SetNull)
  @@index([projectId, folderId])
}

model Preset {
  id        String   @id @default(cuid())
  scope     String   // "global" | "project"
  projectId String?
  ownerId   String
  name      String
  fieldType String
  icon      String?
  patch     Json
  updatedAt DateTime @updatedAt
  @@index([scope, projectId])
}
```

> `migrate()` from `@org/form-schema` stays the single validation gate before any form body
> is written, exactly as `FormsService.save` does today — the DB just replaces the file sink.

---

## 5. API surface (NestJS, additive modules)

```
POST   /projects                 create            GET /projects               list (by owner)
GET    /projects/:id             one               PATCH/DELETE /projects/:id
GET    /projects/:id/tree        folders + formRecords (single payload to build the tree)

POST   /folders                  { projectId, parentId?, name }
PATCH  /folders/:id              rename / move (parentId) — reject cycles
DELETE /folders/:id              guard non‑empty (or cascade with confirm)

POST   /forms                    upsert (body + projectId + folderId); migrate() validates
GET    /forms/:id                load contract        DELETE /forms/:id
GET    /forms?projectId=&folderId=   list records (no body) for a folder

GET    /presets?scope=&projectId=    P1 endpoint + scope/projectId filter
POST   /presets                      upsert (+scope/projectId/ownerId)
DELETE /presets/:id
POST   /presets/:id/promote          project → global (D2)
```

**Repository pattern (D4):** controllers/services depend on `ProjectRepo`, `FolderRepo`,
`FormRepo`, `PresetRepo` *interfaces*. A `PrismaXRepo` implements them. This keeps the swap
file → SQLite → Postgres invisible above the repo layer, and keeps unit tests fast (in‑memory
fake repos).

---

## 6. Migrating the existing flat data (W0)

The current `.data/*.json` (one form per file), `*.theme.json`, and the single `presets.json`
must be adopted without loss:

1. Create a default project **"Unfiled"** owned by a seed user.
2. For each `<id>.json`: run `migrate()`, create a `FormRecord { id, projectId: unfiled,
   folderId: null, title: form.title, body }`.
3. For each `<id>.theme.json`: attach as that form's theme keyed by `formId`.
4. `presets.json` entries → `Preset { scope: "global", projectId: null }` (they were global).
5. Ship as an idempotent one‑shot script (`apps/api` script) + a test fixture; re‑runnable.

---

## 7. Builder UI (W2)

- **Explorer panel** (left rail): project switcher (dropdown) → `DirectoryTree` of folders +
  forms; context menu (new folder / new form / rename / move / delete / duplicate); drag a
  form between folders.
- **Router**: introduce `react-router` — today the builder only toggles `form`/`workflow`
  mode in `App.tsx`. Routes: `/projects`, `/projects/:id` (explorer), `/forms/:id/edit`
  (the existing builder), keeping the current editor intact as the leaf view.
- **Preset library panel**: the P2 gallery, now filtered to the open project's presets +
  the global library; "save current field as preset" asks scope (project vs global).

---

## 8. Phasing & deliverables

| Phase | Deliverable | Touches | Contract? | Effort | Status |
| --- | --- | --- | --- | --- | --- |
| **W0** | Prisma + repository interfaces; migrate flat `.data` → DB into "Unfiled"; existing `/forms` `/presets` `/themes` re‑backed by repos (no behaviour change) | api | none | L | ✅ **DONE** (uncommitted; reviewer PASS, no blockers) |
| **W1** | `Project` + `Folder` + `FormRecord` models, CRUD + `/tree`; `ownerId` + minimal auth (header `x-owner-id`) | api | none | L | ✅ **DONE** (reviewer PASS; typecheck 15/15, api 18/18, live smoke green) |
| **W2** | Builder Explorer (tree + CRUD + move) + `react-router`. **+W2.1 (master–detail):** Explorer + editor unified into one project page — persistent collapsible rail + nested `/projects/:projectId/forms/:formId` editor (data router + `useBlocker` unsaved-changes guard: Save/Discard/Cancel on any nav, `beforeunload` on refresh) | builder | none | L | ✅ **DONE** (uncommitted; reviewer PASS both W2 & W2.1; builder 221/221, prod build green) |
| **W3** | Preset `scope`/`projectId` (global + project), library filtered by project, promote‑to‑global | schema (additive) + api + builder | none (no formVersion bump; optional preset metadata + changeset) | M | ✅ **DONE** (uncommitted; form‑schema 56/56, api 23/23, builder 225/225, biome clean) |
| **W4** | **Linked fields**: additive `{ presetId, overrides? }` on field; form‑core `resolveLinkedFields` re‑syncs at render (preset `patch` base + instance `overrides`); missing/changed preset freezes to a snapshot; builder link/unlink UI + stale badge + shared preset store + injected `presetResolver` | schema + form‑core + renderer + builder | **additive, NO bump** (optional props per additive rule; parse‑compat test, no migration) | XL | ✅ **DONE** (uncommitted; reviewer PASS no blockers; schema 57, core 99, builder link/PresetLink 11, api 24, typecheck clean) |
| **W5** | **Project sharing / roles**: `ProjectMember` grant model (`editor`/`viewer`; owner stays implicit via `Project.ownerId`, so **no backfill**), role‑based `requireAccess` replacing the owner‑only gate (read=viewer, write=editor, project rename/delete=owner), `list` = owned ∪ shared, members API (`/projects/:id/members` GET/POST/PATCH/DELETE — mutations owner‑only), builder `ShareDialog` + "Shared" badge | api + builder | none | L | ✅ **DONE** (uncommitted; api 33/33 incl. 9 sharing tests, builder 240/240, typecheck + biome clean. **Scope:** project/folder/form sharing; *preset* visibility for collaborators is a follow‑up — see §10) |

**Recommended order:** W0 → W1 → W2 → W3 → (ship usable workspace) → W4 → W5.
W0–W3 give a fully usable, organised, production‑shaped workspace **without ever touching the
contract**; W4 is the design‑system payoff and is gated behind that stable base.

---

## 9. Long‑term development workflow (how each phase is built & shipped)

Every phase follows the repo's existing loop (see `AGENTS.md` / `CLAUDE.md`):

1. **Plan** the phase (plan mode for the cross‑package ones — W0, W1, W4). Write the sub‑task
   list into this doc's status table before coding.
2. **Build additively.** New optional props / new modules only. Old saved JSON keeps parsing.
   W4 (the only contract change) added optional `presetId`/`overrides` — purely additive, so it
   needed **no** `CURRENT_FORM_VERSION` bump and no migration, just a parse-compat test proving a
   current-version doc with the new keys still parses. (Bump + migration N→N+1 + a forward-migrate
   test is reserved for a *breaking* shape change — renaming/removing/retyping a prop.)
3. **Repository‑first on the backend.** New persistence goes behind a repo interface; services
   never import Prisma directly. Unit‑test against in‑memory fakes; integration‑test against
   SQLite.
4. **Self‑verify** before "done": `pnpm typecheck` + `pnpm test` green, `pnpm biome check`
   clean (scoped to changed files), a **changeset per changed PUBLISHED package**
   (`form-schema`, `form-core`, `form-renderer-web`); `apps/*` are private → no changeset.
5. **Reviewer subagent** before each commit; fix what it flags.
6. **Commit per phase** (owner gates the commit), update the status table + memory.

**Guardrails carried from the form contract (unchanged):**
- One contract, many renderers — workspace metadata never leaks into the contract or a
  renderer. Web‑only props stay marked; native must keep rendering.
- JSONLogic only — no `eval`/`new Function`. Presets/patches/overrides are declarative data.
- peerDeps — never bundle react/antd/react‑native in renderers.

---

## 10. Open items to resolve as we reach each phase

- **Auth mechanism** (W1): session cookie vs JWT vs an existing provider — pick when W1 starts.
- **Form id strategy**: today `form.id` is user‑authored and used as a filename. Under projects,
  prefer a generated `cuid()` id + a human `slug`/`title`; decide whether to keep author‑set ids
  for back‑compat (the migration must preserve existing ids regardless).
- **Folder delete policy** (W1): block non‑empty vs cascade‑with‑confirm.
- **Linked‑field conflict policy** (W4): what happens when a referenced preset is deleted or
  its `fieldType` changes — freeze last resolved value vs detach to a plain field.
- **Versioning forms** (later): published vs draft, history — `status` is reserved in
  `FormRecord` but the workflow is out of scope here.
- **Preset sharing for collaborators** (W5 follow‑up, ✅ DONE): project‑scoped presets are now a
  *shared project library* stored under the **project owner**, so every collaborator who can see
  the project sees the same library. `PresetsService` routes through `ProjectsService.requireAccess`:
  `list` gates `viewer` (the user's globals ∪ the project owner's project presets), `save`/`remove`
  gate `editor`, `promote` gates `owner`. Global presets stay personal to their owner; cross‑owner
  id reuse still → 409, another owner's global → 404. `PresetRepo.list(userId, project?)` +
  `findMeta` (replaced `findOwner`). Single‑owner default behaviour unchanged.
- **Save‑path access (fixed in W5)**: `FormsService.save` with no explicit `projectId` previously
  kept an existing form's placement *without any access check* (a W1 back‑compat gap that let any
  caller overwrite any form body by id). W5 now asserts `editor` on the form's current project on
  that branch too.
- **Theme access (W5 follow‑up, ✅ DONE)**: `/themes/:id` now reads `@CurrentOwner()` and
  `ThemesService` looks up the theme's form (`FormRepo`) and routes through `requireAccess`
  (load=viewer, save=editor); an unknown form id → 404, so no orphan themes. The controller
  re‑throws `HttpException` so 403/404 survive (only validation → 400). The builder still relies on
  the `@CurrentOwner` default (`SEED_OWNER_ID`) like its form client — sending a real `x-owner-id`
  from the theme client only matters once identity‑switching lands (not yet wired anywhere).
- **Batch `ProjectsService.list`** (✅ DONE): added `ProjectRepo.findByIds(ids)` (single
  `WHERE id IN (...)`, empty-array short-circuit); `list` now resolves all shared projects in one
  query, run alongside the owned-projects query. Behaviour identical.

---

*Related: `builder-ux-field-parity-v2.md` (presets P1–P3 — the in‑app foundation this builds
on), `formily-parity-dnd-props.md` (tracks X/D).*
