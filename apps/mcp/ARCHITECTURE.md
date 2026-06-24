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
| `generate_form` | Prompt → valid `FormSchema` via the LLM pipeline (`@org/form-ai`). Needs server creds. |
| `generate_workflow` | Prompt → valid `WorkflowDefinition` via the LLM pipeline (`@org/workflow-ai`). Needs server creds. |

## Boundaries (non-negotiable)

- **The contract stays the source of truth.** This app only *projects* and
  *validates* it — it never re-implements field rules. Capabilities/JSON Schema
  come straight from `@org/form-schema` + `@org/workflow-schema`.
- **Two authoring paths, one guarantee.** `create_*` is the **no-LLM, zero-token**
  path (an agent composes the draft, we `migrate` + Zod-parse it). `generate_*`
  (P3/C4) adds the LLM path via `@org/{form,workflow}-ai` — the *same* validate +
  repair loop, so the output is contract- (and for workflows, graph-) valid either
  way. Credentials come from the server **environment** (`AI_API_KEY`, optional
  `AI_PROVIDER`/`AI_BASE_URL`/`AI_MODEL`) since stdio has no per-request headers; a
  missing key is reported as a tool error, never a crash. The provider is injected
  via `createServer({ resolveProvider })` (default reads env) — the same seam the
  api uses, so tests run with a scripted provider and zero network.
- **No eval.** JSONLogic guards/conditions are data, evaluated safely downstream.
- **stdout is the JSON-RPC channel** — logs go to stderr only.

## Layout

```
src/
  tools.ts      pure normalizeForm / normalizeWorkflow (draft -> valid | errors)
  provider.ts   resolveProviderFromEnv(): env -> AiProvider for the generate_* tools
  server.ts     createServer(deps): registers the 7 tools (SDK wiring, no logic)
  index.ts      stdio entry point (bin: form-platform-mcp)
```

Pure logic (`tools.ts`) is unit-tested directly; `server.test.ts` drives the real
MCP protocol over an in-memory transport (the acceptance check) — including the
`generate_*` tools with a scripted provider (no tokens, real Zod validation).

## Run

- `pnpm --filter @app/mcp build && pnpm --filter @app/mcp start` (or `dev` via tsx).
- Register the built `dist/index.js` (exposed as the `form-platform-mcp` bin) as an
  MCP stdio server in your host config.
