import { CURRENT_FORM_VERSION } from "@org/form-schema";
import { CURRENT_WORKFLOW_VERSION } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { normalizeForm, normalizeWorkflow } from "./tools.js";

describe("normalizeForm", () => {
  it("stamps the current version on a draft that omits it", () => {
    const result = normalizeForm({ id: "f1", title: "Contact", fields: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.formVersion).toBe(CURRENT_FORM_VERSION);
  });

  it("migrates an older versioned draft to the current shape", () => {
    const result = normalizeForm({
      formVersion: 1,
      id: "f1",
      title: "Old",
      fields: [{ type: "text", name: "a", label: "A", colSpanDesktop: 12 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.formVersion).toBe(CURRENT_FORM_VERSION);
      // v1->v2 migration moved colSpanDesktop into layout.colSpan.lg
      expect(result.value.fields[0]).toMatchObject({ layout: { colSpan: { lg: 12 } } });
    }
  });

  it("reports structured errors for an invalid draft", () => {
    const result = normalizeForm({ id: "f1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join("\n")).toContain("title");
    }
  });

  it("reports a precise error for a non-object draft", () => {
    const result = normalizeForm("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/formVersion/);
  });
});

describe("normalizeWorkflow", () => {
  it("stamps the current version and validates a draft", () => {
    const result = normalizeWorkflow({
      id: "w1",
      title: "Approval",
      start: "s1",
      nodes: [{ id: "s1", status: "created" }],
      transitions: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.workflowVersion).toBe(CURRENT_WORKFLOW_VERSION);
  });

  it("reports structured errors for an invalid draft", () => {
    const result = normalizeWorkflow({ id: "w1", title: "Bad" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});
