# e2e — thin critical-path Playwright suite

Framework epic **E7** (ADR-0008 **Option C**): a deliberately small Playwright suite covering the
stable, high-value flows where automation's reliability is highest. Everything churn-prone (drag-drop
canvas, visual UX) stays on manual-MCP smoke. **Growth rule (T7.3.1): add a spec only when a flow has
broken twice** — this keeps Option C from decaying into a full-suite maintenance tax.

The suite drives a **real running stack**; it starts nothing itself. Point it at one with `E2E_BASE_URL`.

## Run it locally (against the dev stack)

```bash
# 1. bring up the dev stack (see knowledge/runbook/dev-stack.md): postgres :5435, api :3001, builder :5173
# 2. install the browser once
pnpm exec playwright install chromium
# 3. run (default E2E_BASE_URL = http://localhost:5173)
pnpm e2e
```

## Run it against the docker-compose stack (what CI does)

```bash
docker compose up -d --build           # postgres + api (auto-migrates) + builder (nginx :8080)
E2E_BASE_URL=http://localhost:8080 pnpm exec playwright test
docker compose down -v
```

## CI

`.github/workflows/e2e.yml` boots the compose stack and runs this suite against `:8080`. It is
**advisory-first** (constitution §8): the job is non-blocking for now. T7.3.1 promotes it to blocking
after N clean runs (dropping `continue-on-error` — a decision-record change).

## Specs

- `auth.spec.ts` — login/auth round-trip: API-arranged account → UI sign-in → lands on `/projects`;
  plus RequireAuth bounce (unauthenticated → `/login`).

Selectors are **by role/label** (resist antd DOM churn — ADR-0008).
