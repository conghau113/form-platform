import { defineConfig, devices } from "@playwright/test";

// Thin critical-path e2e (framework E7, ADR-0008 Option C). The suite drives a REAL running
// stack — it starts nothing itself. Point it at a stack with `E2E_BASE_URL`:
//   • local dev stack  → http://localhost:5173 (Vite dev proxies /api → :3001) — the default
//   • docker-compose   → http://localhost:8080 (nginx serves the SPA + proxies /api → api)
// CI (.github/workflows/e2e.yml) boots the compose stack and sets E2E_BASE_URL=…:8080.
// Selectors are by role/label on purpose (resist antd DOM churn — ADR-0008 Risks).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // a stray test.only must fail CI, not silently narrow the run
  retries: process.env.CI ? 1 : 0, // one retry in CI tolerates a transient boot race, no more
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
