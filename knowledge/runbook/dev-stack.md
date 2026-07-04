# Runbook — local dev stack (ports · env · run · gotchas)

> **Freshness contract** — descriptive (L2), registered in
> [`knowledge/index.yaml`](../index.yaml) as `runbook-dev-stack`. **Class:** E1 ·
> **Verified-on:** 2026-07-04 · **Cadence:** re-verify when a port, a run script, or the env
> contract changes; else each release. **Scope:** `apps/api/src/config/env.ts`,
> `apps/api/env.example`, `docker-compose.yml`, `package.json`, `apps/api/package.json`. The
> executable re-verify method (ports/scripts/env defaults) lives in the index entry. Drift =
> defect: file it, do not silently patch (constitution §10).

This is the single durable home for how to run and smoke-test the stack locally. It consolidates
what previously lived only in machine-local memory (`dev-stack-ports`) plus the operational facts in
`docs/usage.md`. Only gotchas that have recurred (**seen ≥2×**, constitution §8 climb-on-evidence)
are promoted here; one-off surprises stay in session memory.

## Ports (stable)

| Port | Service | URL |
|---|---|---|
| `5173` | Builder (Vite dev) | http://localhost:5173 |
| `3001` | API (NestJS) | http://localhost:3001 (health: `/health` → `{"status":"ok","db":"up"}`) |
| `5435` | Postgres (host → container `5432`) | DataGrip / psql → `localhost:5435` |

## Run

```bash
# 1. Postgres in the background (host port 5435)
docker compose up -d postgres
# 2. The whole app (turbo: api :3001 + builder Vite :5173 + package watchers)
pnpm dev
```

- `pnpm dev` = `turbo run dev` — **one process tree**. The api's own `dev` script is
  `tsc && node dist/main.js` (a compile-then-run, **NOT a watcher**).
- Self-host (everything in Docker): `docker compose up --build`; stop with `docker compose down`
  (`-v` also drops the `pgdata` volume = deletes DB data).

**Probe liveness** (curl is permission-blocked in this env — use `Test-NetConnection`):

```
powershell -NoProfile -Command "'api3001=' + (Test-NetConnection localhost -Port 3001 -WarningAction SilentlyContinue).TcpTestSucceeded; 'builder5173=' + (Test-NetConnection localhost -Port 5173 -WarningAction SilentlyContinue).TcpTestSucceeded"
```

(Don't put `$`-vars inside a double-quoted PowerShell `-Command` — Git Bash eats them; use literals.)

## Env

The **authoritative, current template is [`apps/api/env.example`](../../apps/api/env.example)** — copy it
to `apps/api/.env` (gitignored) and fill in. `ConfigModule` loads `[.env.<NODE_ENV>, .env]`; in Docker
the values come from the process env (docker-compose), not the files. The env contract is validated at
boot (`apps/api/src/config/env.ts`) and **fails fast** on a missing/malformed required var.

| Var | Required | Default | Note |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | **Postgres** connection string (e.g. `postgresql://formplatform:formplatform@localhost:5435/formplatform?schema=public`). The provider is `postgresql` — a `file:` SQLite URL will not work. |
| `PORT` | | `3001` | HTTP port |
| `CORS_ORIGINS` | | `http://localhost:5173` | comma-separated origin allowlist; empty = block cross-origin |
| `JWT_SECRET` | ✅ | — | access-token signing key (**≥ 16 chars**; missing/short ⇒ fail-fast) |
| `JWT_ACCESS_EXPIRES_IN` | | `15m` | short access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | | `30d` | rotating, revocable refresh token |
| `AUTH_COOKIE_SECURE` | | `false` | set `true` in production (HTTPS-only cookie) |
| `AUTH_BOOTSTRAP_EMAIL` / `_PASSWORD` | | — | optional boot-seed admin (adopts pre-2A `ownerId="local"` data) |
| `AI_*` | | see file | optional BYOK fallbacks; lenient parse in `ai.config.ts` |

> ⚠️ **Stale duplicate (FINDING, filed 2026-07-04):** `apps/api/.env.example` (dotted) still shows the
> pre-switch SQLite `file:` URL and W0/D4 comments. It is superseded by `env.example` (no dot). Do not
> copy the dotted file. Disposition (update or 6-step disposal) is a separate remediation task.

## Gotchas (promoted — each seen ≥2× across sessions)

1. **`pnpm dev` is one turbo tree.** Killing a single child (e.g. the api `node dist/main.js`) tears
   down the whole stack (builder too). To restart, relaunch `pnpm dev`.
2. **The api `dev` script has no watch.** It is `tsc && node dist/main.js`, so a source change is not
   picked up live — rebuild/relaunch. Consequently a **live smoke runs the compiled `dist`, not `tsx`**;
   after an api change, rebuild before smoking, and kill any old server still bound to `3001` first
   (a lingering pre-change server answers with stale behavior / new one hits EADDRINUSE).
3. **Prisma EPERM on Windows while the api is running** (the client DLL is locked): stop the stack →
   `pnpm --filter @app/api db:generate` / `db:migrate` → relaunch `pnpm dev`.
4. **EADDRINUSE means the stack is already up.** Probe first (above); reuse a running stack rather than
   starting a second `pnpm dev`.
5. **Rebuild a package's `dist` after changing it** — turbo cache + Vite pre-bundling will otherwise
   serve the stale build. e.g. `pnpm --filter ./packages/form-renderer-web build` then reload the page.
6. **Don't run `pnpm dev` and a full `docker compose up` at the same time** — both bind `3001`. Pick one.
