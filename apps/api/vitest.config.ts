import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server-side code; no DOM. The importer test spawns the Prisma CLI, so allow extra time.
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
