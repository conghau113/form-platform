import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { actionLabel, runActions } from "./run-actions";

const def = (transitions: WorkflowDefinition["transitions"]): WorkflowDefinition => ({
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "draft",
  nodes: [
    { id: "draft", status: "Draft" },
    { id: "review", status: "Review" },
    { id: "done", status: "Done" },
  ],
  transitions,
});

const t = (id: string, from: string, to: string, action: string) => ({ id, from, to, action });

describe("runActions", () => {
  it("returns the actions leaving the current state, in definition order", () => {
    const d = def([t("t1", "draft", "review", "submit"), t("t2", "review", "done", "approve")]);
    expect(runActions(d, "draft")).toEqual(["submit"]);
    expect(runActions(d, "review")).toEqual(["approve"]);
  });

  it("dedupes guard-branched transitions that share an action into one button", () => {
    const d = def([
      t("t1", "review", "done", "decide"),
      t("t2", "review", "draft", "decide"),
      t("t3", "review", "review", "comment"),
    ]);
    expect(runActions(d, "review")).toEqual(["decide", "comment"]);
  });

  it("returns no actions for a terminal state", () => {
    const d = def([t("t1", "draft", "done", "submit")]);
    expect(runActions(d, "done")).toEqual([]);
  });
});

describe("actionLabel", () => {
  const localized = (): WorkflowDefinition => {
    const d = def([t("t1", "draft", "review", "submit")]);
    d.transitions[0].i18n = { action: { vi: "Gửi", en: "Submit" } };
    return d;
  };

  it("resolves the localized label for the requested locale", () => {
    expect(actionLabel(localized(), "submit", "vi")).toBe("Gửi");
  });

  it("falls back to the fallback locale when the requested one is missing", () => {
    expect(actionLabel(localized(), "submit", "fr", "en")).toBe("Submit");
  });

  it("returns the raw action id when there is no translation", () => {
    expect(actionLabel(localized(), "submit", "de")).toBe("submit");
  });

  it("returns the raw action id when no locale is requested (no-op)", () => {
    expect(actionLabel(localized(), "submit")).toBe("submit");
  });

  it("returns the raw action id for an action with no i18n map", () => {
    const d = def([t("t1", "draft", "review", "submit")]);
    expect(actionLabel(d, "submit", "vi")).toBe("submit");
  });
});
