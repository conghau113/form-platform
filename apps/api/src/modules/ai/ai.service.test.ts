import { BadGatewayException, UnprocessableEntityException } from "@nestjs/common";
import type { AiProvider } from "@org/form-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiService } from "./ai.service.js";
import type { AiCredentials } from "./ai-credentials.decorator.js";
import type { AiProviderFactory } from "./ai-provider.factory.js";

/** A provider that always returns the same scripted text. */
function fixedProvider(text: string): AiProvider {
  return {
    async complete() {
      return { text };
    },
  };
}

/** A factory stub yielding a scripted provider — no network, no BYOK key needed. */
function factoryFor(provider: AiProvider): AiProviderFactory {
  return { create: () => provider } as unknown as AiProviderFactory;
}

const creds: AiCredentials = { provider: "openai" };

const validForm = JSON.stringify({
  id: "contact",
  title: "Contact",
  fields: [{ type: "text", name: "email", label: "Email" }],
});

const validWorkflow = JSON.stringify({
  id: "leave-approval",
  title: "Leave Approval",
  start: "draft",
  nodes: [
    { id: "draft", status: "Draft" },
    { id: "approved", status: "Approved" },
  ],
  transitions: [{ id: "submit", from: "draft", to: "approved", action: "submit" }],
});

describe("AiService", () => {
  const prevAllowlist = process.env.AI_URL_ALLOWLIST;

  beforeEach(() => {
    process.env.AI_URL_ALLOWLIST = "";
  });
  afterEach(() => {
    if (prevAllowlist === undefined) delete process.env.AI_URL_ALLOWLIST;
    else process.env.AI_URL_ALLOWLIST = prevAllowlist;
  });

  it("returns a contract-valid form for a good draft", async () => {
    const service = new AiService(factoryFor(fixedProvider(validForm)));
    const res = await service.generate(creds, { prompt: "a contact form" });

    expect(res.form.formVersion).toBe(3);
    expect(res.attempts).toBe(1);
    expect(res.strippedUrls).toEqual([]);
  });

  it("throws 422 with structured errors when the model never produces valid JSON", async () => {
    const service = new AiService(factoryFor(fixedProvider("not json")));
    await expect(service.generate(creds, { prompt: "x", maxRepairs: 1 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("throws 502 when the AI provider itself fails", async () => {
    const failing: AiProvider = {
      async complete() {
        throw new Error("No active credentials for provider: openai");
      },
    };
    const service = new AiService(factoryFor(failing));
    await expect(service.generate(creds, { prompt: "x" })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it("strips an off-allowlist submitUrl from the generated form", async () => {
    const withUrl = JSON.stringify({
      id: "f",
      title: "F",
      fields: [{ type: "text", name: "a", label: "A" }],
      settings: { submitUrl: "https://evil.test/collect" },
    });
    const service = new AiService(factoryFor(fixedProvider(withUrl)));
    const res = await service.generate(creds, { prompt: "x" });

    expect(res.form.settings?.submitUrl).toBeUndefined();
    expect(res.strippedUrls).toEqual(["https://evil.test/collect"]);
  });

  it("refines an existing form into a contract-valid result", async () => {
    const service = new AiService(factoryFor(fixedProvider(validForm)));
    const res = await service.refine(creds, {
      baseForm: { id: "contact", title: "Contact", fields: [] },
      instruction: "add an email field",
    });

    expect(res.form.formVersion).toBe(3);
    expect(res.form.fields).toHaveLength(1);
    expect(res.attempts).toBe(1);
  });

  it("throws 422 when a refine never yields valid JSON", async () => {
    const service = new AiService(factoryFor(fixedProvider("not json")));
    await expect(
      service.refine(creds, { baseForm: {}, instruction: "x", maxRepairs: 1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("keeps a submitUrl whose host is on the allowlist", async () => {
    process.env.AI_URL_ALLOWLIST = "myco.com";
    const withUrl = JSON.stringify({
      id: "f",
      title: "F",
      fields: [{ type: "text", name: "a", label: "A" }],
      settings: { submitUrl: "https://api.myco.com/submit" },
    });
    const service = new AiService(factoryFor(fixedProvider(withUrl)));
    const res = await service.generate(creds, { prompt: "x" });

    expect(res.form.settings?.submitUrl).toBe("https://api.myco.com/submit");
    expect(res.strippedUrls).toEqual([]);
  });

  it("returns a contract- and graph-valid workflow for a good draft", async () => {
    const service = new AiService(factoryFor(fixedProvider(validWorkflow)));
    const res = await service.generateWorkflow(creds, { prompt: "a leave approval flow" });

    expect(res.workflow.workflowVersion).toBe(1);
    expect(res.workflow.start).toBe("draft");
    expect(res.attempts).toBe(1);
  });

  it("throws 422 when the model never produces a valid workflow", async () => {
    const service = new AiService(factoryFor(fixedProvider("not json")));
    await expect(
      service.generateWorkflow(creds, { prompt: "x", maxRepairs: 1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("throws 502 when the provider fails during workflow generation", async () => {
    const failing: AiProvider = {
      async complete() {
        throw new Error("No active credentials for provider: openai");
      },
    };
    const service = new AiService(factoryFor(failing));
    await expect(service.generateWorkflow(creds, { prompt: "x" })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it("refines an existing workflow into a contract-valid result", async () => {
    const service = new AiService(factoryFor(fixedProvider(validWorkflow)));
    const res = await service.refineWorkflow(creds, {
      currentWorkflow: JSON.parse(validWorkflow),
      instruction: "add a rejection branch",
    });

    expect(res.workflow.workflowVersion).toBe(1);
    expect(res.attempts).toBe(1);
  });
});
