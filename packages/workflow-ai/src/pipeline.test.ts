import type { AiCompletionRequest, AiMessage, AiProvider } from "@org/ai-core";
import { describe, expect, it } from "vitest";
import { generateWorkflow, refineWorkflow } from "./pipeline.js";

/** Concatenate every text part of a message for substring assertions. */
function messageText(messages: AiMessage[], role: AiMessage["role"]): string {
  return messages
    .filter((m) => m.role === role)
    .flatMap((m) => m.content)
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n");
}

/** A provider that replays scripted responses and records the requests it saw. */
function scriptedProvider(responses: string[]): AiProvider & { calls: AiCompletionRequest[] } {
  const calls: AiCompletionRequest[] = [];
  let i = 0;
  return {
    calls,
    async complete(req) {
      calls.push(req);
      const text = responses[Math.min(i, responses.length - 1)];
      i++;
      return { text };
    },
  };
}

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

/** A realistic 3-level approval — the C-track demo shape, graph-valid. */
const threeLevelApproval = JSON.stringify({
  id: "leave-3-level",
  title: "Duyệt nghỉ phép 3 cấp",
  start: "draft",
  nodes: [
    { id: "draft", status: "Nháp" },
    { id: "l1", status: "Chờ quản lý" },
    { id: "l2", status: "Chờ trưởng phòng" },
    { id: "l3", status: "Chờ giám đốc" },
    { id: "approved", status: "Đã duyệt" },
    { id: "rejected", status: "Từ chối" },
  ],
  transitions: [
    { id: "submit", from: "draft", to: "l1", action: "submit" },
    { id: "l1ok", from: "l1", to: "l2", action: "approve" },
    { id: "l2ok", from: "l2", to: "l3", action: "approve" },
    { id: "l3ok", from: "l3", to: "approved", action: "approve" },
    { id: "l1no", from: "l1", to: "rejected", action: "reject" },
    { id: "l2no", from: "l2", to: "rejected", action: "reject" },
    { id: "l3no", from: "l3", to: "rejected", action: "reject" },
  ],
});

describe("generateWorkflow", () => {
  it("returns a contract- and graph-valid workflow on the first attempt", async () => {
    const provider = scriptedProvider([validWorkflow]);
    const result = await generateWorkflow(provider, { prompt: "a leave request flow" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(1);
    expect(result.workflow.workflowVersion).toBe(1);
    expect(result.workflow.start).toBe("draft");
  });

  it("accepts a multi-level approval graph", async () => {
    const provider = scriptedProvider([threeLevelApproval]);
    const result = await generateWorkflow(provider, { prompt: "duyệt nghỉ phép 3 cấp" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workflow.nodes).toHaveLength(6);
    expect(result.workflow.transitions).toHaveLength(7);
  });

  it("repairs a graph-invalid draft (unreachable node) on a follow-up round", async () => {
    // First reply leaves "approved" unreachable (no transitions); second is valid.
    const unreachable = JSON.stringify({
      id: "x",
      title: "X",
      start: "draft",
      nodes: [
        { id: "draft", status: "Draft" },
        { id: "approved", status: "Approved" },
      ],
      transitions: [],
    });
    const provider = scriptedProvider([unreachable, validWorkflow]);
    const result = await generateWorkflow(provider, { prompt: "x" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    // The repair turn carries the graph error back to the model.
    const repairTurn = provider.calls[1].messages;
    expect(repairTurn.some((m) => m.role === "assistant")).toBe(true);
    expect(messageText(repairTurn, "user").toLowerCase()).toContain("reachable");
  });

  it("gives up after maxRepairs and reports structured errors", async () => {
    const provider = scriptedProvider(["not json at all"]);
    const result = await generateWorkflow(provider, { prompt: "x" }, { maxRepairs: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.attempts).toBe(2); // 1 + 1 repair
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("embeds the primitive catalog in the system prompt", async () => {
    const provider = scriptedProvider([validWorkflow]);
    await generateWorkflow(provider, { prompt: "x" });
    const system = messageText(provider.calls[0].messages, "system");
    expect(system).toContain("transition");
    expect(system).toContain("start");
  });

  it("passes the workflow JSON Schema to the provider by default", async () => {
    const provider = scriptedProvider([validWorkflow]);
    await generateWorkflow(provider, { prompt: "x" });
    expect(provider.calls[0].jsonSchema).toBeDefined();
  });
});

describe("refineWorkflow", () => {
  it("carries the current workflow and the instruction into the request", async () => {
    const provider = scriptedProvider([validWorkflow]);
    const current = JSON.parse(validWorkflow);
    const result = await refineWorkflow(provider, {
      currentWorkflow: current,
      instruction: "add a manager approval step",
    });

    expect(result.ok).toBe(true);
    const userText = messageText(provider.calls[0].messages, "user");
    expect(userText).toContain("add a manager approval step");
    expect(userText).toContain("leave-approval");
    // The system prompt switches into edit mode.
    expect(messageText(provider.calls[0].messages, "system")).toContain("EDITING");
  });
});
