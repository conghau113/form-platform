import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { localizeWorkflow } from "./localize.js";

const base: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "Approval",
  start: "a",
  defaultLocale: "en",
  locales: ["vi"],
  i18n: { title: { vi: "Phê duyệt" } },
  nodes: [
    { id: "a", status: "Created", i18n: { status: { vi: "Đã tạo" } } },
    { id: "b", status: "Done" },
  ],
  transitions: [{ id: "t1", from: "a", to: "b", action: "next", i18n: { action: { vi: "Tiếp" } } }],
};

describe("localizeWorkflow", () => {
  it("is a no-op (deep-equal) for a definition with no i18n", () => {
    const plain: WorkflowDefinition = {
      workflowVersion: 1,
      id: "wf",
      title: "T",
      start: "a",
      nodes: [{ id: "a", status: "Created" }],
      transitions: [],
    };
    expect(localizeWorkflow(plain, "vi")).toEqual(plain);
  });

  it("localizes the title and node status, stripping the i18n maps", () => {
    const out = localizeWorkflow(base, "vi", "en");
    expect(out.title).toBe("Phê duyệt");
    expect(out.nodes[0].status).toBe("Đã tạo");
    expect(out.i18n).toBeUndefined();
    expect(out.nodes[0].i18n).toBeUndefined();
    // defaultLocale / locales are preserved.
    expect(out.defaultLocale).toBe("en");
    expect(out.locales).toEqual(["vi"]);
  });

  it("never overwrites identifiers (node.id, transition.action)", () => {
    const out = localizeWorkflow(base, "vi", "en");
    expect(out.nodes[0].id).toBe("a");
    expect(out.transitions[0].action).toBe("next");
    // The transition's i18n map is left intact for the call site to resolve the label.
    expect(out.transitions[0].i18n?.action.vi).toBe("Tiếp");
  });

  it("falls back when the requested locale has no translation", () => {
    const out = localizeWorkflow(base, "fr", "vi");
    expect(out.title).toBe("Phê duyệt");
    expect(out.nodes[0].status).toBe("Đã tạo");
  });

  it("keeps the authored default when neither locale nor fallback match", () => {
    const out = localizeWorkflow(base, "fr");
    expect(out.title).toBe("Approval");
    expect(out.nodes[0].status).toBe("Created");
  });

  it("does not mutate its input", () => {
    const snapshot = structuredClone(base);
    localizeWorkflow(base, "vi", "en");
    expect(base).toEqual(snapshot);
  });
});
