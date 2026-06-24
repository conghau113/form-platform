import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateForm } from "@org/form-ai";
import { FORM_JSON_SCHEMA, formCapabilities } from "@org/form-schema";
import { generateWorkflow } from "@org/workflow-ai";
import { WORKFLOW_JSON_SCHEMA, workflowCapabilities } from "@org/workflow-schema";
import { z } from "zod";
import { type ResolveProvider, resolveProviderFromEnv } from "./provider.js";
import { normalizeForm, normalizeWorkflow } from "./tools.js";

/**
 * The AI-agent-native MCP server. It exposes the form + workflow contracts as
 * the open compile target an agent talks to:
 *   - discovery: `list_capabilities`, `get_form_schema`, `get_workflow_schema`
 *   - authoring (no LLM): `create_form`, `create_workflow` — validate & migrate
 *     a draft the agent already authored into a contract-VALID document or
 *     structured errors. Zero-token path for agents that compose the JSON.
 *   - generation (LLM, P3/C4): `generate_form`, `generate_workflow` — turn a
 *     natural-language prompt into the same guaranteed-valid document via the
 *     `@org/{form,workflow}-ai` pipeline (Zod + graph repair loop). Needs server
 *     credentials (see {@link resolveProviderFromEnv}); never eval.
 */

export interface ServerDeps {
  /** Resolve the LLM provider for the generate_* tools. Injectable for tests. */
  resolveProvider?: ResolveProvider;
}

/** Wrap any JSON payload as an MCP text tool result. */
function jsonResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function createServer(deps: ServerDeps = {}): McpServer {
  const resolveProvider = deps.resolveProvider ?? resolveProviderFromEnv;
  const server = new McpServer({ name: "form-platform", version: "0.1.0" });

  server.registerTool(
    "list_capabilities",
    {
      title: "List capabilities",
      description:
        "List every field type (form) and node/transition/guard primitive (workflow) this contract supports, with value shapes — what an agent can compose.",
    },
    async () => jsonResult({ form: formCapabilities(), workflow: workflowCapabilities() }),
  );

  server.registerTool(
    "get_form_schema",
    {
      title: "Get form JSON Schema",
      description:
        "Return the form contract as a JSON Schema (draft-07) for validating/authoring a FormSchema.",
    },
    async () => jsonResult(FORM_JSON_SCHEMA),
  );

  server.registerTool(
    "get_workflow_schema",
    {
      title: "Get workflow JSON Schema",
      description:
        "Return the workflow contract as a JSON Schema (draft-07) for validating/authoring a WorkflowDefinition.",
    },
    async () => jsonResult(WORKFLOW_JSON_SCHEMA),
  );

  server.registerTool(
    "create_form",
    {
      title: "Create form",
      description:
        "Validate & normalize a form draft into a guaranteed-valid FormSchema (migrated to the current version). `formVersion` may be omitted. Returns the valid form, or { ok:false, errors } describing what to fix.",
      inputSchema: { form: z.unknown().describe("A FormSchema draft (object).") },
    },
    async ({ form }) => {
      const result = normalizeForm(form);
      return jsonResult(result, !result.ok);
    },
  );

  server.registerTool(
    "create_workflow",
    {
      title: "Create workflow",
      description:
        "Validate & normalize a workflow draft into a guaranteed-valid WorkflowDefinition. `workflowVersion` may be omitted. Returns the valid definition, or { ok:false, errors } describing what to fix.",
      inputSchema: { workflow: z.unknown().describe("A WorkflowDefinition draft (object).") },
    },
    async ({ workflow }) => {
      const result = normalizeWorkflow(workflow);
      return jsonResult(result, !result.ok);
    },
  );

  const generateInput = {
    prompt: z.string().min(1).describe("Natural-language description of what to build."),
    guidance: z
      .string()
      .optional()
      .describe("Optional extra house-style guidance appended to the system prompt."),
    maxRepairs: z
      .number()
      .int()
      .min(0)
      .max(5)
      .optional()
      .describe("Validation-repair rounds after the first attempt (default 3)."),
  };

  server.registerTool(
    "generate_form",
    {
      title: "Generate form with AI",
      description:
        "Turn a natural-language prompt into a guaranteed-valid FormSchema using the LLM pipeline (generates → Zod-validates → repairs up to `maxRepairs` times). Requires server AI credentials. Returns { ok:true, form, attempts } or { ok:false, errors, attempts }.",
      inputSchema: generateInput,
    },
    async ({ prompt, guidance, maxRepairs }) => {
      const resolution = resolveProvider();
      if (!resolution.ok) return jsonResult({ ok: false, errors: [resolution.error] }, true);
      const result = await generateForm(resolution.provider, { prompt, guidance }, { maxRepairs });
      return jsonResult(result, !result.ok);
    },
  );

  server.registerTool(
    "generate_workflow",
    {
      title: "Generate workflow with AI",
      description:
        "Turn a natural-language prompt into a guaranteed-valid WorkflowDefinition using the LLM pipeline (generates → Zod + graph-validates → repairs up to `maxRepairs` times). Requires server AI credentials. Returns { ok:true, workflow, attempts } or { ok:false, errors, attempts }.",
      inputSchema: generateInput,
    },
    async ({ prompt, guidance, maxRepairs }) => {
      const resolution = resolveProvider();
      if (!resolution.ok) return jsonResult({ ok: false, errors: [resolution.error] }, true);
      const result = await generateWorkflow(
        resolution.provider,
        { prompt, guidance },
        { maxRepairs },
      );
      return jsonResult(result, !result.ok);
    },
  );

  return server;
}
