#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/** Entry point: serve the form-platform MCP tools over stdio (the transport every
 *  MCP host — Claude Desktop, VS Code, the Agent SDK — speaks). */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // stderr only — stdout is the JSON-RPC channel.
  console.error("form-platform MCP server failed to start:", error);
  process.exit(1);
});
