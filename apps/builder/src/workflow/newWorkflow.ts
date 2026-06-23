import {
  CURRENT_WORKFLOW_VERSION,
  migrateWorkflow,
  type WorkflowDefinition,
} from "@org/workflow-schema";

/** Slugify a title into a url/filename-safe id, with a short random suffix for uniqueness. */
function slugId(title: string): string {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workflow";
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

/**
 * A fresh, `migrateWorkflow()`-valid workflow for the Explorer "new workflow" flow: a single
 * `draft` start state (so `validateGraph` passes — `start` references a real node), no transitions.
 * Mirrors `workspace/newForm.ts`.
 */
export function newWorkflow(title: string): WorkflowDefinition {
  return migrateWorkflow({
    workflowVersion: CURRENT_WORKFLOW_VERSION,
    id: slugId(title),
    title: title.trim() || "Untitled workflow",
    start: "draft",
    nodes: [{ id: "draft", status: "draft", position: { x: 80, y: 40 } }],
    transitions: [],
  });
}

/** A copy of an existing workflow for duplication: fresh id, " (copy)" suffix on the title. */
export function duplicateWorkflow(source: WorkflowDefinition): WorkflowDefinition {
  const title = `${source.title} (copy)`;
  return { ...source, id: slugId(title), title };
}
