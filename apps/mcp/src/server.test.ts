import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AiProvider } from "@org/form-ai";
import { beforeAll, describe, expect, it } from "vitest";
import type { ResolveProvider } from "./provider.js";
import { createServer, type ServerDeps } from "./server.js";

/**
 * End-to-end via the real MCP protocol (in-memory transport): an agent client
 * talks to our server exactly as Claude Desktop / the Agent SDK would. This is
 * the P0 acceptance check — "agent calls MCP → gets a Zod-valid FormSchema".
 */
async function connectClient(deps: ServerDeps = {}): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer(deps).connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** A deterministic provider that replays one canned model response — no network,
 *  zero tokens. The pipeline still runs the real Zod (+ graph) validation on it. */
function scriptedProvider(text: string): AiProvider {
  return { complete: async () => ({ text }) };
}

/** Resolver that always reports missing credentials — exercises the gated path. */
const noCreds: ResolveProvider = () => ({ ok: false, error: "Missing AI API key — test." });

// biome-ignore lint/suspicious/noExplicitAny: tool results are protocol JSON.
function payloadOf(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("form-platform MCP server", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connectClient();
  });

  it("advertises the discovery, authoring, and generation tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_form",
      "create_workflow",
      "generate_form",
      "generate_workflow",
      "get_form_schema",
      "get_workflow_schema",
      "list_capabilities",
    ]);
  });

  it("create_form returns a Zod-valid FormSchema for a draft", async () => {
    const result = await client.callTool({
      name: "create_form",
      arguments: { form: { id: "contact", title: "Contact", fields: [] } },
    });
    expect(result.isError).toBeFalsy();
    const payload = payloadOf(result);
    expect(payload.ok).toBe(true);
    expect(payload.value).toMatchObject({ id: "contact", title: "Contact", formVersion: 3 });
  });

  it("create_form flags an invalid draft as an error", async () => {
    const result = await client.callTool({
      name: "create_form",
      arguments: { form: { id: "x" } },
    });
    expect(result.isError).toBe(true);
    expect(payloadOf(result).ok).toBe(false);
  });

  it("get_form_schema returns the version-pinned JSON Schema", async () => {
    const result = await client.callTool({ name: "get_form_schema", arguments: {} });
    expect(payloadOf(result).$id).toBe("urn:form-platform:form:v3");
  });

  it("list_capabilities reports both contracts", async () => {
    const result = await client.callTool({ name: "list_capabilities", arguments: {} });
    const payload = payloadOf(result);
    expect(payload.form.fields.length).toBeGreaterThan(10);
    expect(payload.workflow.primitives.length).toBe(3);
  });
});

describe("generate_* tools (LLM pipeline, scripted provider)", () => {
  it("generate_form returns a Zod-valid FormSchema from a prompt", async () => {
    const draft = {
      id: "signup",
      title: "Signup",
      fields: [{ type: "text", name: "email", label: "Email" }],
    };
    const client = await connectClient({
      resolveProvider: () => ({ ok: true, provider: scriptedProvider(JSON.stringify(draft)) }),
    });
    const result = await client.callTool({
      name: "generate_form",
      arguments: { prompt: "a signup form with an email field" },
    });
    expect(result.isError).toBeFalsy();
    const payload = payloadOf(result);
    expect(payload.ok).toBe(true);
    expect(payload.form).toMatchObject({ id: "signup", formVersion: 3 });
  });

  it("generate_workflow returns a graph-valid WorkflowDefinition from a prompt", async () => {
    const draft = {
      id: "approval",
      title: "Approval",
      start: "draft",
      nodes: [
        { id: "draft", status: "active" },
        { id: "done", status: "done" },
      ],
      transitions: [{ id: "submit", from: "draft", to: "done", action: "Submit" }],
    };
    const client = await connectClient({
      resolveProvider: () => ({ ok: true, provider: scriptedProvider(JSON.stringify(draft)) }),
    });
    const result = await client.callTool({
      name: "generate_workflow",
      arguments: { prompt: "a one-step approval" },
    });
    expect(result.isError).toBeFalsy();
    const payload = payloadOf(result);
    expect(payload.ok).toBe(true);
    expect(payload.workflow).toMatchObject({ id: "approval", workflowVersion: 1 });
  });

  it("generate_form reports a tool error when no credentials are configured", async () => {
    const client = await connectClient({ resolveProvider: noCreds });
    const result = await client.callTool({
      name: "generate_form",
      arguments: { prompt: "anything" },
    });
    expect(result.isError).toBe(true);
    const payload = payloadOf(result);
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toMatch(/API key/i);
  });
});
