# `@app/mcp` — Model Context Protocol server

The agent-facing front door to the form + workflow contracts (AI-agent-native P0).
An MCP host (Claude Desktop, VS Code, the Agent SDK) speaks to it over **stdio**
and gets the contracts as an *open compile target*: discover what's available,
fetch the JSON Schema, and turn a draft into a **guaranteed-valid** document.

## What it exposes (tools)

| Tool | Purpose |
|---|---|
| `list_capabilities` | Every field type + workflow primitive, with value shapes. |
| `get_form_schema` | The form contract as JSON Schema (draft-07). |
| `get_workflow_schema` | The workflow contract as JSON Schema (draft-07). |
| `create_form` | Validate & normalize a form draft → valid `FormSchema` or `{ok:false, errors}`. |
| `create_workflow` | Validate & normalize a workflow draft → valid `WorkflowDefinition` or errors. |

## Boundaries (non-negotiable)

- **The contract stays the source of truth.** This app only *projects* and
  *validates* it — it never re-implements field rules. Capabilities/JSON Schema
  come straight from `@org/form-schema` + `@org/workflow-schema`.
- **No LLM here.** `create_*` only guarantees validity (`migrate` + Zod parse).
  Prompt → form generation is P1 (`@org/form-ai`), injected, BYOK.
- **No eval.** JSONLogic guards/conditions are data, evaluated safely downstream.
- **stdout is the JSON-RPC channel** — logs go to stderr only.

## Layout

```
src/
  tools.ts      pure normalizeForm / normalizeWorkflow (draft -> valid | errors)
  server.ts     createServer(): registers the 5 tools (SDK wiring, no logic)
  index.ts      stdio entry point (bin: form-platform-mcp)
```

Pure logic (`tools.ts`) is unit-tested directly; `server.test.ts` drives the real
MCP protocol over an in-memory transport (the P0 acceptance check).

## Run

- `pnpm --filter @app/mcp build && pnpm --filter @app/mcp start` (or `dev` via tsx).
- Register the built `dist/index.js` (exposed as the `form-platform-mcp` bin) as an
  MCP stdio server in your host config.
