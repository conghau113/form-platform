# api — architecture

> **Freshness contract** — descriptive (L2), registered in
> [`knowledge/index.yaml`](../../knowledge/index.yaml) as `api-architecture`. **Class:** E1 ·
> **Verified-on:** 2026-07-03 (framework T0.2.1) · **Cadence:** re-verify when an api module /
> repository / endpoint or the auth / tenancy / RBAC / DB-engine posture changes; else each release.
> **Scope:** `apps/api/src/**`, `apps/api/prisma/schema.prisma`. The executable re-verify method
> (14 modules · 17 repo interfaces · 17 Prisma impls · Postgres provider) lives in the index entry.
> Drift = defect: file it, do not silently patch (constitution §10).

NestJS backend for the form platform. **Prisma**-backed **PostgreSQL** persistence (behind a
repository interface) for users, tenants, projects, folders, forms, form versions, themes, presets,
project members, RBAC roles, org units, workflows + instances, submissions, status catalog, refresh
tokens, and an audit log. The server is the source of truth: every saved **form**/**theme**/**preset**
/**workflow** body is run through the schema (`migrate` / `migrateTheme` / the preset parse /
`migrateWorkflow`) — validate + normalise — before it is stored, so an older or malformed contract can
never land. ESM, `module: NodeNext` → relative imports use explicit `.js` extensions.

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
| Bootstrap (helmet, **CORS allowlist** w/ credentials, global `ValidationPipe`, port) | `main.ts` |
| Root module — `ConfigModule` (Zod env validate) + `ThrottlerModule` + 14 feature modules | `app.module.ts` |
| Env contract — Zod schema + `validateEnv` (fail-fast) + `parseCorsOrigins` + `durationToMs` | `config/env.ts` |
| Auth primitives — global `JwtAuthGuard`, `@CurrentOwner()` (reads verified `sub`), `@Public`, `@RequireFunction` + `FunctionGuard`, cookie helpers, function catalog | `auth/` |
| Auth endpoints — register/login/refresh/logout + JWT issuance + cookie set | `modules/auth/` |
| RBAC — data-driven roles → function codes; `@RequireFunction` admin surfaces (C4) | `modules/rbac/` |
| Health probe — `GET /health` runs `SELECT 1` (process + DB) | `modules/health/` |
| Slug helpers + path/id guards + constants | `common/` |
| Persistence — repo **interfaces** + Prisma impls + `PrismaService` (17 repos) | `persistence/{repositories,prisma}/` |
| Tenants (multi-tenant scoping; personal + team tenants, B) | `modules/tenants/` |
| Org units (per-tenant org hierarchy) | `modules/org-units/` |
| Projects (CRUD + `requireAccess` + `:id/tree`) | `modules/projects/{projects.*}` |
| Project members / sharing (W5) | `modules/projects/{members.*}` |
| Folders (nested, cycle-guarded moves, cascade delete) | `modules/folders/` |
| Forms (save/load/list/move/delete; body = the form contract) | `modules/forms/{forms.*}` |
| Form versions (draft → publish → version history; body pinned per version, FB1) | `modules/forms/{form-versions.*}` |
| Workflows (state-machine contract; save/load/list/move/delete) + instances (start/advance) | `modules/workflows/` |
| Submissions (validated form submits; field-level RBAC masking, FS) | `modules/submissions/` |
| Status catalog (global ∪ tenant status library) | `modules/status-catalog/` |
| Themes (save/load per form id; body = design tokens) | `modules/themes/` |
| Presets (global ∪ project library; promote to global) | `modules/presets/` |
| AI generate/refine (BYOK credentials → form/preset/workflow) | `modules/ai/` |
| Request DTOs (non-contract bodies) | `modules/<feature>/dto/` |
| One-off importer (flat `.data/*.json` → DB) | `scripts/import-files-to-db.ts` |

## Validation — two distinct gates
1. **Contract bodies** (`POST /forms`, `POST /themes/:id`, `POST /presets`, `POST /workflows`) are
   typed `@Body() body: unknown` and validated by the **schema** in the service (`migrate()` /
   `migrateTheme()` / the preset `parse` / `migrateWorkflow()`). They carry no DTO metadata, so the
   global `ValidationPipe` leaves them untouched — there is exactly one source of truth for the
   contract (`@org/form-schema` / `@org/form-theme` / `@org/workflow-schema`), never duplicated here.
2. **Non-contract bodies** (project/folder/member/form-move/auth/rbac/org-unit/submission/instance)
   use a **class-validator DTO** under `modules/<feature>/dto/`, so a wrong-typed payload is rejected
   with **400 at the edge** before the service runs. The pipe is configured `{ whitelist: true,
   transform: true, transformOptions: { exposeUnsetFields: false } }` — unknown keys are stripped, and
   absent optional keys stay absent (the folder-move path distinguishes a rename from a move-to-root by
   the **presence** of `parentId`, so an injected `parentId: undefined` would be a bug).

> DTO classes must be imported as **values** (not `import type`) in controllers — `@Body() dto:
> Foo` relies on `emitDecoratorMetadata` emitting the runtime class reference for the pipe.

## Authentication & security (production-hardening 1D / 2A / 2B / A1)
Real authentication is **shipped** (JWT, secure-by-default). Layers:
- **Env validation** — `ConfigModule.forRoot({ validate: validateEnv })` parses the environment with
  Zod at boot; a missing/malformed required var (`DATABASE_URL`, `JWT_SECRET`) **fails fast** instead
  of erroring mid-request. Optional vars take defaults + coerce (`config/env.ts`).
- **JWT auth (2A)** — `AuthModule` registers a **global `JwtAuthGuard`**: every route needs a valid
  token unless marked `@Public` (only `/health`, `/auth/register`, `/auth/login`, `/auth/refresh`,
  `/auth/logout`). The browser SPA sends the token as an **HttpOnly `access_token` cookie (2B)**;
  non-browser clients may use `Authorization: Bearer <jwt>`. The verified payload is stashed on
  `req.user`, so `@CurrentOwner()` resolves the tenant from a **trusted `sub`**, replacing the old
  operator-declared `x-owner-id` header. A short-lived access token pairs with a **rotating, revocable
  refresh token (A1)** persisted in the DB (`refresh-token.repo`) and mirrored in a cookie whose
  `maxAge` matches its lifetime; `/auth/logout-all` revokes every session. `AUTH_COOKIE_SECURE=true`
  sets the cookie `Secure` flag in production. An optional bootstrap admin
  (`AUTH_BOOTSTRAP_EMAIL`/`AUTH_BOOTSTRAP_PASSWORD`) is seeded at boot so pre-2A `ownerId="local"`
  data stays reachable.
- **CORS** — `main.ts` enables an **allowlist** from `CORS_ORIGINS` (comma-separated) with
  `credentials: true` (so the auth cookie is sent); an empty list disables cross-origin requests. No
  allow-all fallback.
- **helmet** — `app.use(helmet())` sets standard security headers (CSP off — JSON API, not HTML).
- **Rate limiting** — `ThrottlerModule` + a global `ThrottlerGuard` cap requests/IP
  (`THROTTLE_TTL`/`THROTTLE_LIMIT`); `/health` opts out via `@SkipThrottle()`.

> **Trust boundary:** identity is now **verified** — `@CurrentOwner()` derives the caller from the
> JWT `sub`, not a client-set header. The remaining operator-declared input is the form-submission
> `?roles=` "acting as" query (field-level RBAC / masking, FS2): it shapes *which fields a caller
> claims to act on*, not *who they are*. Authentication and project/function authorization below are
> server-enforced.

## Access control — three layers
1. **Authentication** — the global `JwtAuthGuard` (above). No valid token → **401**.
2. **Project access** (`ProjectsService.requireAccess(userId, projectId, minRole)`) — the single gate
   for project/folder/form/theme/preset/workflow/submission paths. A user's role on a project is the
   **highest** of: the canonical owner (`Project.ownerId` → `owner`), their `ProjectMember` grant
   (`editor`/`viewer`, W5), and — **B3** — the role their RBAC functions map to in the project's
   **tenant** (`projectRoleFromFunctions`; union semantics, an explicit low grant never demotes a
   tenant admin). No access → **404** (never leaks existence); access but too low a role → **403**.
   Reads require `viewer`, writes `editor`, project rename/delete + member management `owner`. Folder/
   form/theme/preset/workflow services resolve their owning project through `requireAccess` rather than
   re-checking ownership. Tenancy scopes reads through this same chokepoint (B3) and writes create into
   the caller's team tenant with per-tenant slugs (B4).
3. **Function-level RBAC** (`@RequireFunction` + global `FunctionGuard`, C4) — data-driven admin
   authorization for the `/rbac` surfaces. A route lists the permission **function codes** it needs;
   the guard admits the caller when their effective functions (the **union over the roles they hold in
   their tenant**) include **any** required code (any-of, D1) — or the `*` superadmin wildcard. No
   tenant / insufficient functions → **403**. Routes without `@RequireFunction` are not function-gated
   (they still require authentication). Server-side is the real boundary; the client only hides nav.

## Adding a feature
Create `src/modules/<feature>/` with a `*.module.ts` (declares controllers + providers) and
register it in `app.module.ts`'s `imports`. Put data access behind a new repo **interface** in
`persistence/repositories/` with a Prisma impl in `persistence/prisma/`. Give non-contract request
bodies a DTO under `dto/`; leave contract bodies on the schema's `migrate`/parse. Gate admin routes
with `@RequireFunction(...)`; mark unauthenticated entry points `@Public()`.

## Endpoints
Every route requires a valid JWT (cookie or `Bearer`) unless marked **public**; `@CurrentOwner()`
resolves the caller from the token `sub`.
- **Health** — `GET /health` (**public**, throttle-exempt; `SELECT 1` → `{ status, db }`)
- **Auth** — `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout`
  (all **public**; set/clear the auth cookies) · `POST /auth/logout-all` · `GET /auth/me`
- **Tenants** — `GET /tenants` (the caller's tenants)
- **Org units** — `GET /org-units` · `POST` · `PATCH /:id` · `DELETE /:id`
- **Projects** — `POST /projects` · `GET /projects` (owned ∪ shared ∪ tenant-visible) ·
  `GET /projects/:id` · `GET /projects/:id/tree` · `PATCH /projects/:id` (owner) ·
  `DELETE /projects/:id` (owner)
- **Members** — `GET /projects/:projectId/members` (viewer+) · `POST` · `PATCH /:userId` ·
  `DELETE /:userId` (mutations owner-only)
- **RBAC** — `GET /rbac/me/functions` · `GET /rbac/functions` `[role.admin]` ·
  `GET /rbac/roles` `[role.admin|user.admin]` · `POST /rbac/roles` · `PATCH /rbac/roles/:id` ·
  `DELETE /rbac/roles/:id` · `PUT /rbac/roles/:id/functions` (all `[role.admin]`) ·
  `GET /rbac/users` · `POST /rbac/users` · `GET /rbac/users/:userId/roles` ·
  `PUT /rbac/users/:userId/roles` (all `[user.admin]`)
- **Folders** — `POST /folders` · `PATCH /folders/:id` (rename/move; cycle → 409) ·
  `DELETE /folders/:id` (non-empty → 409 unless `?cascade=true`)
- **Forms** — `POST /forms` (save; invalid → 400; optional `?projectId=&folderId=`) ·
  `GET /forms?projectId=` (summaries) · `GET /forms/:id` (404 if missing/not visible) ·
  `PATCH /forms/:id/move` · `DELETE /forms/:id`
- **Form versions** — `POST /forms/:id/publish` · `GET /forms/:id/versions` ·
  `GET /forms/:id/active-version` (`FormVersion | null`) · `GET /forms/:id/versions/:version` ·
  `POST /forms/:id/versions/:version/clone-draft`
- **Workflows** — `POST /workflows` (save; invalid → 400) · `GET /workflows?projectId=` ·
  `GET /workflows/:id` · `PATCH /workflows/:id/move` · `DELETE /workflows/:id`
- **Workflow instances** — `POST /workflows/:workflowId/instances` (start) ·
  `GET /workflows/:workflowId/instances` · `GET /workflow-instances/:instanceId` ·
  `POST /workflow-instances/:instanceId/advance`
- **Submissions** — `POST /forms/:formId/submissions` (validated against the pinned version;
  field-level RBAC strip) · `GET /forms/:formId/submissions` · `GET /submissions/:id` (masked by role)
- **Themes** — `POST /themes/:id` (editor) · `GET /themes/:id` (viewer; 404 if none)
- **Presets** — `GET /presets?projectId=` (global ∪ project) · `POST /presets` (upsert; invalid →
  400) · `POST /presets/:id/promote` (→ global) · `DELETE /presets/:id`
- **Status catalog** — `GET /status-catalog?projectId=` · `POST /status-catalog` (upsert) ·
  `POST /status-catalog/:code/promote` (→ global) · `DELETE /status-catalog/:code`
- **AI** — `POST /ai/forms/generate` · `POST /ai/forms/refine` · `POST /ai/presets/generate` ·
  `POST /ai/workflows/generate` · `POST /ai/workflows/refine` (BYOK credentials via header)
