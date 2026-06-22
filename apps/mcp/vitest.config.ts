import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // MCP server is plain Node (stdio JSON-RPC); no DOM.
    environment: "node",
  },
});
