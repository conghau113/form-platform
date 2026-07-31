import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server-side code; no DOM. The importer test's beforeAll starts a Postgres container and
    // spawns the Prisma CLI: ~19s idle, but ~190s measured while the other packages' suites run
    // in parallel, so 60s was not enough. Budget ~1.9x the worst measurement. Note the container
    // start itself is capped by Testcontainers' own 120s health check, so this budget really
    // covers the `prisma db push` that follows it.
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 360_000,
  },
});
