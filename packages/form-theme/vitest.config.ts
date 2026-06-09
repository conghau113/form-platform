import { defineConfig } from "vitest/config";

// antd's barrel pulls in React-dependent modules; jsdom keeps importing `theme`
// (for its algorithms) happy without a DOM-less crash.
export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
