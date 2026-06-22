import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

/**
 * End-to-end via the real MCP protocol (in-memory transport): an agent client
 * talks to our server exactly as Claude Desktop / the Agent SDK would. This is
 * the P0 acceptance check — "agent calls MCP → gets a Zod-valid FormSchema".
 */
async function connectClient(): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

// biome-ignore lint/suspicious/noExplicitAny: tool results are protocol JSON.
function payloadOf(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("form-platform MCP server", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connectClient();
  });

  it("advertises the five P0 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_form",
      "create_workflow",
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
