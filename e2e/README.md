# e2e — thin critical-path Playwright suite

Framework epic **E7** (ADR-0008 **Option C**): a deliberately small Playwright suite covering the
stable, high-value flows where automation's reliability is highest. Everything churn-prone (drag-drop
canvas, visual UX) stays on manual-MCP smoke. **Growth rule: add a spec only when a flow has broken
twice** — this keeps Option C from decaying into a full-suite maintenance tax. The growth rule, the
flake policy, and the advisory→blocking promotion criteria are governed in
[`knowledge/standards/verification-standard.md`](../knowledge/standards/verification-standard.md) §5
(this README is the operational quick-start, not the source of truth).

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
**advisory-first** (constitution §8): the job is non-blocking. It is promoted to blocking (dropping
`continue-on-error` — a decision-record change) only after **N = 3 consecutive clean runs on `main`**
(verification-standard §5). ⚠️ That count is currently 0 — the compose api crash-loops on empty
`AUTH_BOOTSTRAP_*` (a filed product/infra finding), so the CI job has never booted green; the clock
starts once that finding is fixed.

## Specs

- `auth.spec.ts` — login/auth round-trip: API-arranged account → UI sign-in → lands on `/projects`;
  plus RequireAuth bounce (unauthenticated → `/login`).
- `project-form-crud.spec.ts` — project + form CRUD via the Explorer: create a project, create a
  form in it (persists across a reload), then rename and delete the form.
- `save-load.spec.ts` — editor save/load: edit the form in the JSON view, Save, reload, and confirm
  the edit was loaded back from the server.
- `publish.spec.ts` — publish a form: a fresh form reads "Chưa publish"; Publish freezes it into
  version 1 and the badge flips to "Đã publish v1".
- `submit-view.spec.ts` — submit + view: give a form a field, submit an answer via the Submissions
  view, then open its read-only detail and confirm the value round-trips.
- `workflow-run.spec.ts` — workflow run happy-path: API-arrange a two-state workflow, then drive the
  Run view — launch a case, fire the one action, and confirm it reaches the terminal state.
- `helpers.ts` — shared arrange-helpers (register + UI sign-in, create project, create form).

Selectors are **by role/label** (resist antd DOM churn — ADR-0008).
