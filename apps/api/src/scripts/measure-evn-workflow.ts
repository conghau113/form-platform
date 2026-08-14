import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Regenerate `modules/external/evn-workflow-nodes.ts` by MEASURING EVN's own workflow template (P4d-2).
 *
 * Unlike every other generator in this directory, the source here is not TypeScript that has to be
 * parsed out of a service — it is a JSON template EVN ships and reads at runtime,
 * `public/files/templateJSON/WORKFLOW_PCT.json`. That makes extraction trivial and the GATES the
 * interesting part.
 *
 * ⚠️ The tempting source for "which action closes this node" is the node's own code: strip
 * `PCT_WORKFLOW_NODE__` and you reproduce `completedBy` for 12 of the 15 nodes. That is a NAMING
 * CONVENTION, not data — measured, it is wrong for THREE: `STARTED` and `FINISHED` are not actions
 * at all, and `PCT_A_CREATED` completes on a three-action list rather than on its namesake. The
 * measured authority is
 * `description.condition.complete`, which is what EVN actually evaluates
 * (`workflow.service.ts:2428-2473`) and which is present on all 15.
 *
 * ⚠️ `description.data.actionCode` is NOT that authority either: it is present on only 8 of 15.
 *
 * ⚠️ The `complete` condition comes in three forms with three different VALUE TYPES —
 * `ACTION_CODE: string`, `ANY_ACTION_CODES: string[]`, `NODE_COMPLETED: string`. Gating the key
 * alone would let a future `ACTION_CODE: ["A", "B"]` flatten into nonsense silently, so
 * {@link readCompletion} checks the type per code and throws on anything else.
 *
 * The source lives OUTSIDE this repo, so this cannot run in CI. Every count is therefore pinned
 * again in `workflow-progress.test.ts` against the COMMITTED artefact — assertions in here only run
 * when someone deliberately regenerates, which needs EVN's tree.
 *
 * Usage: `pnpm tsx src/scripts/measure-evn-workflow.ts --core-service <path-to>/core-service/src`
 */

/** The template we measure, relative to `core-service/`. */
const TEMPLATE_PATH = "public/files/templateJSON/WORKFLOW_PCT.json";

/** Exactly the nodes PCT's workflow has today. Pinned by MEMBERSHIP, not just by count: a wrong
 *  extraction yields a set of the right size with one member swapped. */
const EXPECTED_NODE_COUNT = 15;

/** How many nodes carry each form of `complete`. Counted PER FORM on purpose — a total of 15 stays
 *  green when one form quietly swallows another, which is the failure a total cannot see. */
const EXPECTED_COMPLETE_FORMS: Readonly<Record<string, number>> = {
  ACTION_CODE: 12,
  ANY_ACTION_CODES: 2,
  NODE_COMPLETED: 1,
};

interface RawNode {
  code?: unknown;
  typeCode?: unknown;
  priority?: unknown;
  description?: {
    condition?: { complete?: Record<string, unknown> };
  };
}

interface MeasuredNode {
  nodeCode: string;
  order: number;
  completedBy: string[];
  completedByNode?: string;
}

function sourceRevision(coreServiceSrc: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: resolve(coreServiceSrc, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Turn one `complete` condition into what closes the node.
 *
 * @throws on an unknown condition code, or on a known code carrying an unexpected value type.
 * Throwing rather than skipping is the point: a node we cannot read must stop the generator, not
 * quietly ship as a node nothing completes.
 */
function readCompletion(
  nodeCode: string,
  complete: Record<string, unknown>,
): {
  form: string;
  completedBy: string[];
  completedByNode?: string;
} {
  const keys = Object.keys(complete);
  if (keys.length !== 1) {
    throw new Error(
      `${nodeCode}: expected exactly one \`complete\` condition, measured ${keys.length} ` +
        `(${keys.join(", ")}). Two conditions mean an AND this extractor does not model.`,
    );
  }
  const [form] = keys as [string];
  const value = complete[form];

  switch (form) {
    case "ACTION_CODE": {
      if (typeof value !== "string") {
        throw new Error(`${nodeCode}: ACTION_CODE must be a string, measured ${typeof value}.`);
      }
      return { form, completedBy: [value] };
    }
    case "ANY_ACTION_CODES": {
      if (!Array.isArray(value) || value.some((member) => typeof member !== "string")) {
        throw new Error(`${nodeCode}: ANY_ACTION_CODES must be a string[].`);
      }
      return { form, completedBy: [...(value as string[])] };
    }
    case "NODE_COMPLETED": {
      if (typeof value !== "string") {
        throw new Error(`${nodeCode}: NODE_COMPLETED must be a string, measured ${typeof value}.`);
      }
      // Deliberately NOT folded into `completedBy`: this node closes on another NODE, not on an
      // action, and `[]` on its own cannot be told apart from "we failed to extract anything".
      return { form, completedBy: [], completedByNode: value };
    }
    default:
      throw new Error(
        `${nodeCode}: unknown \`complete\` condition \`${form}\`. EWorkflowConditionCode has 21 ` +
          "members and this extractor models three; teach it the new one rather than dropping it.",
      );
  }
}

export function measure(coreServiceSrc: string): MeasuredNode[] {
  const templateFile = resolve(coreServiceSrc, "..", TEMPLATE_PATH);
  const template = JSON.parse(readFileSync(templateFile, "utf8")) as { formItems?: RawNode[] };
  const items = template.formItems;
  if (!Array.isArray(items)) {
    throw new Error(`${TEMPLATE_PATH}: no \`formItems\` array — the template shape changed.`);
  }

  const nodes: MeasuredNode[] = [];
  const forms: Record<string, number> = {};

  for (const item of items) {
    // Every item in THIS template is a workflow node today. Checking rather than assuming, because
    // a template that starts mixing node types would otherwise ship non-nodes as nodes.
    if (item.typeCode !== "WORKFLOW_NODE") {
      throw new Error(
        `${String(item.code)}: typeCode is \`${String(item.typeCode)}\`, not WORKFLOW_NODE.`,
      );
    }
    if (typeof item.code !== "string" || typeof item.priority !== "number") {
      throw new Error(`A formItem is missing \`code\` or \`priority\`.`);
    }
    const complete = item.description?.condition?.complete;
    if (!complete || typeof complete !== "object") {
      throw new Error(`${item.code}: no \`condition.complete\` — nothing says what closes it.`);
    }

    const { form, completedBy, completedByNode } = readCompletion(item.code, complete);
    forms[form] = (forms[form] ?? 0) + 1;
    nodes.push({
      nodeCode: item.code,
      order: item.priority,
      completedBy,
      ...(completedByNode === undefined ? {} : { completedByNode }),
    });
  }

  assertYield(nodes, forms);
  return nodes.sort((left, right) => left.order - right.order);
}

/** Gates that would have caught a wrong extraction. See the per-form note on
 *  {@link EXPECTED_COMPLETE_FORMS}. */
export function assertYield(nodes: MeasuredNode[], forms: Record<string, number>): void {
  if (nodes.length !== EXPECTED_NODE_COUNT) {
    throw new Error(`Measured ${nodes.length} workflow nodes, expected ${EXPECTED_NODE_COUNT}.`);
  }

  const orders = nodes.map((node) => node.order).sort((left, right) => left - right);
  const expected = Array.from({ length: EXPECTED_NODE_COUNT }, (_, index) => index + 1);
  if (orders.join(",") !== expected.join(",")) {
    throw new Error(
      `\`priority\` is not a permutation of 1..${EXPECTED_NODE_COUNT}: [${orders.join(", ")}]. ` +
        "Duplicates would make the projection's order non-deterministic.",
    );
  }

  if (new Set(nodes.map((node) => node.nodeCode)).size !== nodes.length) {
    throw new Error("Duplicate node codes — the stored map is keyed by them.");
  }

  for (const [form, count] of Object.entries(EXPECTED_COMPLETE_FORMS)) {
    if (forms[form] !== count) {
      throw new Error(
        `\`complete\` form ${form}: measured ${forms[form] ?? 0}, expected ${count}. ` +
          "Counted per form because a total stays green when one form swallows another.",
      );
    }
  }
}

function renderModule(nodes: MeasuredNode[], measuredOn: string, revision: string): string {
  const rows = nodes
    .map((node) => {
      const completedBy = `[${node.completedBy.map((code) => `"${code}"`).join(", ")}]`;
      const byNode =
        node.completedByNode === undefined ? "" : `, completedByNode: "${node.completedByNode}"`;
      return `  { nodeCode: "${node.nodeCode}", order: ${node.order}, completedBy: ${completedBy}${byNode} },`;
    })
    .join("\n");

  return `// GENERATED by src/scripts/measure-evn-workflow.ts — do not edit by hand.
// Measured on ${measuredOn} from EVN core-service @ ${revision}:
//   ${TEMPLATE_PATH}                    (the 15 PCT workflow nodes)
//   src/modules/ticket/service/workflow.service.ts (how EVN evaluates and stores them)
//   src/modules/ticket/workflow.enum.ts            (EWorkflowNodeEdgeStatus, EWorkflowConditionCode)
// ${nodes.length} nodes; \`complete\` forms: ${Object.entries(EXPECTED_COMPLETE_FORMS)
    .map(([form, count]) => `${form}×${count}`)
    .join(", ")}.

/** One node of EVN's PCT workflow, as their template defines it. */
export interface EvnWorkflowNodeDef {
  /** \`formItems[].code\`, and also the key EVN stores this node's state under. */
  readonly nodeCode: string;
  /** \`priority\` — a permutation of 1..${EXPECTED_NODE_COUNT}, and the order the flow reads in. */
  readonly order: number;
  /**
   * The action code(s) whose arrival completes this node, read from \`condition.complete\`.
   *
   * \`[]\` ONLY when {@link completedByNode} is set. An empty list with no \`completedByNode\` would
   * be unreadable: "no action closes this" and "we failed to extract it" look identical.
   */
  readonly completedBy: readonly string[];
  /**
   * Set INSTEAD of {@link completedBy} when the node closes on another NODE rather than an action
   * (\`NODE_COMPLETED\`). One node does this today: \`FINISHED\`.
   */
  readonly completedByNode?: string;
}

/**
 * EVN's PCT workflow nodes, in flow order.
 *
 * ⚠️ This table is READ to build the \`progress\` projection, so it is part of
 * \`PCT_DEFINITION\` and moves \`EVN_PCT_DEFINITION_VERSION\` when it changes. It takes no part in
 * \`allowed\` or \`nextStatus\` — those come from the transition table alone.
 *
 * ⚠️ Completion is measured from \`condition.complete\`, NOT from the node's name. Stripping the
 * \`PCT_WORKFLOW_NODE__\` prefix reproduces 12 of these 15 and is wrong for three — \`STARTED\`,
 * \`PCT_A_CREATED\` and \`FINISHED\` — which is exactly the kind of near-miss that ships.
 */
export const EVN_PCT_WORKFLOW_NODES: readonly EvnWorkflowNodeDef[] = [
${rows}
];
`;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function main(): void {
  const coreServiceSrc = arg("--core-service") ?? process.env.EVN_CORE_SERVICE_SRC;
  if (!coreServiceSrc) {
    throw new Error("Need --core-service <core-service/src dir> (or EVN_CORE_SERVICE_SRC).");
  }
  const out =
    arg("--out") ?? resolve(import.meta.dirname, "../modules/external/evn-workflow-nodes.ts");

  const src = resolve(coreServiceSrc);
  const nodes = measure(src);
  writeFileSync(
    out,
    renderModule(nodes, new Date().toISOString().slice(0, 10), sourceRevision(src)),
  );

  // Format in the same breath as writing, for the reason `measure-evn-guards.ts` gives: "run this
  // script" has to produce exactly the bytes that are committed, or regenerating stops proving that
  // nothing was hand-edited.
  execFileSync("pnpm", ["exec", "biome", "check", "--write", out], {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  console.log(`Measured ${nodes.length} PCT workflow nodes -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
