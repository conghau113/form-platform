import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FORM_JSON_SCHEMA, formCapabilities } from "@org/form-schema";
import { WORKFLOW_JSON_SCHEMA, workflowCapabilities } from "@org/workflow-schema";
import { z } from "zod";
import { normalizeForm, normalizeWorkflow } from "./tools.js";

/**
 * The minimal AI-agent-native MCP server (P0). It exposes the form + workflow
 * contracts as the open compile target an agent talks to:
 *   - discovery: `list_capabilities`, `get_form_schema`, `get_workflow_schema`
 *   - authoring: `create_form`, `create_workflow` — return a contract-VALID
 *     document (Zod-checked, migrated) or structured errors. No LLM call here
 *     (that is P1's `@org/form-ai`); this layer only guarantees validity.
 */

/** Wrap any JSON payload as an MCP text tool result. */
function jsonResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function createServer(): McpServer {
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

  return server;
}
