# api — architecture

NestJS backend for the form platform. **Prisma**-backed persistence (SQLite in dev, behind a
repository interface) for projects, folders, forms, themes, presets, and project members. The
server is the source of truth: every saved **form**/**theme**/**preset** body is run through the
schema (`migrate` / `migrateTheme` / the preset parse) — validate + normalise — before it is
stored, so an older or malformed contract can never land. ESM, `module: NodeNext` → relative
imports use explicit `.js` extensions.

## Layering (controller → service → repository)
A request flows through three layers; each has one job and never reaches across:
- **Controller** (`*.controller.ts`) — the HTTP edge only. Reads params/query/body, validates
  **non-contract** bodies via a DTO + the global `ValidationPipe`, and delegates to its service.
  Never imports Prisma; never contains business rules.
- **Service** (`*.service.ts`) — business logic + access control (`requireAccess`). Calls the
  repository **interfaces**, not Prisma. Never reads `req`/`res` (no HTTP types leak in).
- **Repository** — the data-access seam. The interface lives in
  `persistence/repositories/<entity>.repo.ts` (an abstract class used as the DI token); the Prisma
  implementation lives in `persistence/prisma/prisma-<entity>.repo.ts`. **Prisma is confined to
  `persistence/prisma/`** — swapping the store touches nothing above it.

`PersistenceModule` is `@Global`, so feature services inject the repo interfaces without importing
it. `PrismaService` (the `PrismaClient` lifecycle) lives only in `persistence/prisma/`.

## Layout (`src/`)
| Concern | Path |
|---|---|
| Bootstrap (helmet, **CORS allowlist**, global `ValidationPipe`, port) | `main.ts` |
| Root module — `ConfigModule` (Zod env validate) + `ThrottlerModule` + feature modules | `app.module.ts` |
| Env contract — Zod schema + `validateEnv` (fail-fast) + `parseCorsOrigins` | `config/env.ts` |
| Health probe — `GET /health` runs `SELECT 1` (process + DB) | `modules/health/` |
| Auth seam — `@CurrentOwner()` reads `x-owner-id` (default `SEED_OWNER_ID`) | `auth/current-owner.decorator.ts` |
| Slug helpers + path/id guards | `common/` |
| Persistence — repo **interfaces** + Prisma impls + `PrismaService` | `persistence/{repositories,prisma}/` |
| Projects (CRUD + RBAC `requireAccess` + `:id/tree`) | `modules/projects/{projects.*}` |
| Project members / sharing (W5) | `modules/projects/{members.*}` |
| Folders (nested, cycle-guarded moves, cascade delete) | `modules/folders/` |
| Forms (save/load/list/move/delete; body = the form contract) | `modules/forms/` |
| Themes (save/load per form id; body = design tokens) | `modules/themes/` |
| Presets (global ∪ project library; promote to global) | `modules/presets/` |
| Request DTOs (non-contract bodies) | `modules/<feature>/dto/` |
| One-off importer (flat `.data/*.json` → DB) | `scripts/import-files-to-db.ts` |

## Validation — two distinct gates
1. **Contract bodies** (`POST /forms`, `POST /themes/:id`, `POST /presets`) are typed `@Body()
   body: unknown` and validated by the **schema** in the service (`migrate()` / `migrateTheme()` /
   the preset `parse`). They carry no DTO metadata, so the global `ValidationPipe` leaves them
   untouched — there is exactly one source of truth for the contract (`@org/form-schema` /
   `@org/form-theme`), never duplicated here.
2. **Non-contract bodies** (project/folder/member/form-move) use a **class-validator DTO** under
   `modules/<feature>/dto/`, so a wrong-typed payload is rejected with **400 at the edge** before
   the service runs. The pipe is configured `{ whitelist: true, transform: true,
   transformOptions: { exposeUnsetFields: false } }` — unknown keys are stripped, and absent
   optional keys stay absent (the folder-move path distinguishes a rename from a move-to-root by
   the **presence** of `parentId`, so an injected `parentId: undefined` would be a bug).

> DTO classes must be imported as **values** (not `import type`) in controllers — `@Body() dto:
> Foo` relies on `emitDecoratorMetadata` emitting the runtime class reference for the pipe.

## Security hardening (production-hardening 1D)
Infrastructure-level only — **real authentication arrives in Phase 2**.
- **Env validation** — `ConfigModule.forRoot({ validate: validateEnv })` parses the environment with
  Zod at boot; a missing/malformed required var (`DATABASE_URL`) **fails fast** instead of erroring
  mid-request. Optional vars take defaults + coerce (`config/env.ts`).
- **CORS** — `main.ts` enables an **allowlist** from `CORS_ORIGINS` (comma-separated); an empty list
  disables cross-origin requests. No allow-all fallback.
- **helmet** — `app.use(helmet())` sets standard security headers.
- **Rate limiting** — `ThrottlerModule` + a global `ThrottlerGuard` cap requests/IP
  (`THROTTLE_TTL`/`THROTTLE_LIMIT`); `/health` opts out via `@SkipThrottle()`.

> **Trust boundary:** `x-owner-id` (the `@CurrentOwner()` seam) and the `?roles=` query are
> **operator-declared, NOT a security boundary** — any client can set them. They identify *who the
> caller claims to be* for tenancy/RBAC shaping, not *who they are*. Real auth (verified identity +
> server-enforced authorization) lands in **Phase 2**; until then this API assumes a trusted caller.

## Access control (Track W5)
`ProjectsService.requireAccess(userId, projectId, minRole)` is the single gate. The canonical owner
(`Project.ownerId`) always resolves to the `owner` role; other users get the role on their
`ProjectMember` grant (`editor` / `viewer`). No access → **404** (never leaks existence); access
but too low a role → **403**. Read paths require `viewer`, writes require `editor`, and
project rename/delete + member management require `owner`. Folder/form/theme/preset services all
resolve their owning project through `requireAccess` rather than re-checking ownership.

## Adding a feature
Create `src/modules/<feature>/` with a `*.module.ts` (declares controllers + providers) and
register it in `app.module.ts`'s `imports`. Put data access behind a new repo **interface** in
`persistence/repositories/` with a Prisma impl in `persistence/prisma/`. Give non-contract request
bodies a DTO under `dto/`; leave contract bodies on the schema's `migrate`/parse.

## Endpoints (all carry `x-owner-id`; default `SEED_OWNER_ID`)
- **Health** — `GET /health` (no auth, throttle-exempt; `SELECT 1` → `{ status, db }`)
- **Projects** — `POST /projects` · `GET /projects` (owned ∪ shared) · `GET /projects/:id` ·
  `GET /projects/:id/tree` · `PATCH /projects/:id` (owner) · `DELETE /projects/:id` (owner)
- **Members** — `GET /projects/:id/members` (viewer+) · `POST` · `PATCH /:userId` ·
  `DELETE /:userId` (mutations owner-only)
- **Folders** — `POST /folders` · `PATCH /folders/:id` (rename/move; cycle → 409) ·
  `DELETE /folders/:id` (non-empty → 409 unless `?cascade=true`)
- **Forms** — `POST /forms` (save; invalid → 400; optional `?projectId=&folderId=`) ·
  `GET /forms?projectId=` (summaries) · `GET /forms/:id` (404 if missing/not visible) ·
  `PATCH /forms/:id/move` · `DELETE /forms/:id`
- **Themes** — `POST /themes/:id` (editor) · `GET /themes/:id` (viewer; 404 if none)
- **Presets** — `GET /presets?projectId=` (global ∪ project) · `POST /presets` (upsert; invalid →
  400) · `POST /presets/:id/promote` (→ global) · `DELETE /presets/:id`
