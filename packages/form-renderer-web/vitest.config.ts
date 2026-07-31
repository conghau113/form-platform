import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Vitest runs test FILES in parallel; under that load several render tests exceed the 5s
    // default even when this package runs alone. Raise the ceiling instead of tuning poolOptions
    // (machine-specific, and it would rot).
    testTimeout: 20_000,
  },
});
