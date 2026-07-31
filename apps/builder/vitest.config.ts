import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Same reason as the renderer package: the heavier render suites (PropertyPanel.validation,
    // App.characterization) run several seconds per test once the pool is busy, so the 5s default
    // fails by load rather than by defect.
    testTimeout: 20_000,
  },
});
