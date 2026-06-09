import {
  CURRENT_WORKFLOW_VERSION,
  type WorkflowDefinition,
  workflowDefinitionSchema,
} from "./schema.js";

type Migration = (doc: any) => any;

/**
 * Workflow migration chain. Mirrors form-schema's migrate(): each entry upgrades
 * a definition from version N to N+1, so any older saved workflow JSON can be
 * brought to the current shape before it runs. Empty today (v1 is the first
 * format) — add steps here when the definition shape evolves, and NEVER break
 * older saved JSON.
 */
const migrations: Record<number, Migration> = {};

/** Migrate raw definition JSON of any supported version up to current, then validate. */
export function migrateWorkflow(input: unknown): WorkflowDefinition {
  let doc: any = structuredClone(input);
  if (typeof doc?.workflowVersion !== "number") {
    throw new Error("Invalid workflow document: missing numeric `workflowVersion`.");
  }
  if (doc.workflowVersion > CURRENT_WORKFLOW_VERSION) {
    throw new Error(
      `Workflow v${doc.workflowVersion} is newer than this build supports ` +
        `(v${CURRENT_WORKFLOW_VERSION}). Upgrade @org/workflow-schema to read it.`,
    );
  }
  while (doc.workflowVersion < CURRENT_WORKFLOW_VERSION) {
    const step = migrations[doc.workflowVersion];
    if (!step) throw new Error(`No workflow migration registered from v${doc.workflowVersion}.`);
    doc = step(doc);
  }
  return workflowDefinitionSchema.parse(doc);
}
