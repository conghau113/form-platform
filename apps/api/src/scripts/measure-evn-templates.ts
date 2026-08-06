import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Regenerate `modules/external/evn-vocabulary.ts` by MEASURING EVN's own sources (P2a).
 *
 * Why a script and not a hand-written table: three vocabularies claim to describe EVN's form
 * components and all three disagree — the integration document lists 36 `typeCode`s,
 * `COMPONENT_TYPES.md` claims to be exhaustive at 44, and the shipped templates use 97. A table
 * typed from any of them is a table typed from a draft. So the numbers here are counted, committed
 * as data, and asserted by `type-map.test.ts`; when EVN changes, this runs again.
 *
 * The decisive measurement is NOT the template census. It is `ETypeForm`: the 97 codes in the
 * templates are the union of four different renderers (create / detail / PDF / workflow), and we can
 * only ever emit for the create one. A code that the create renderer has no `case` for falls through
 * to `default: return <></>` — a blank field, silently. `EVN_CREATE_RENDERER_CODES` is that guard
 * rail, and the usage census exists to say which of those codes has ever actually run in production.
 *
 * Both sources live OUTSIDE this repo, so this cannot run in CI. That is exactly why it verifies its
 * own yield (see `EXPECTED_*`) and fails loudly: a rename upstream must not silently shrink the
 * vocabulary into something permissive.
 *
 * Usage:
 *   tsx src/scripts/measure-evn-templates.ts
 *     [--templates <dir>]   default $EVN_TEMPLATE_DIR
 *     [--web-admin <dir>]   default $EVN_WEB_ADMIN_SRC
 *     [--out <file>]        default src/modules/external/evn-vocabulary.ts
 */

/** Members declared in `ETypeForm`. One (`GROUP_BUTTON`) has no `case`, hence 39 vs 38. */
const EXPECTED_ENUM_MEMBERS = 39;
/** Members the create renderer actually paints, i.e. reachable `case ETypeForm.*` branches. */
const EXPECTED_RENDERED_CODES = 38;
/** Template files shipped in `public/files/templateJSON`. */
const EXPECTED_TEMPLATE_FILES = 32;
/**
 * Codes the ROOT of a create form can carry — see {@link extractRootRenderableCodes}.
 *
 * The number is small and load-bearing, so it is pinned: if a refactor upstream moves one of these
 * branches, the export would start emitting roots that render as nothing at all.
 */
const EXPECTED_ROOT_RENDERABLE_CODES = 11;

/** Which renderer a template file is meant for, decided by the `formCode` INSIDE the file. */
export type FormKind = "create" | "detail" | "pdf" | "workflow";

export interface TypeCodeUsage {
  create: number;
  detail: number;
  pdf: number;
  workflow: number;
}

export interface EvnMeasurement {
  /** `typeCode` values the create-form renderer has a `case` for. */
  renderedCodes: string[];
  /** `typeCode` values that survive being placed at the root of `formItems[]`. */
  rootRenderableCodes: string[];
  /** Every `typeCode` seen in the templates → how often, per renderer. */
  usage: Record<string, TypeCodeUsage>;
  /** Codes seen directly under a create form's `formItems[]`. */
  createRootCodes: string[];
  /** Codes seen carrying a non-empty `children[]` in a create form. */
  createContainerCodes: string[];
  templateFiles: number;
  enumMembers: number;
}

/**
 * Classify by the `formCode` recorded in the file, not by its name — the two disagree (the file
 * `CT_PCT_Mobile.json` carries `formCode: "CT_PCT_M"`), and only the content is what EVN keys on.
 */
export function formKindOf(formCode: string): FormKind {
  if (formCode.startsWith("WORKFLOW")) return "workflow";
  if (!formCode.startsWith("CT_")) return "create";
  return formCode.endsWith("PDF") ? "pdf" : "detail";
}

/**
 * Pull the `typeCode` values the create renderer can paint.
 *
 * Two passes, both required: the enum gives name → code, and the `case` scan gives which of those
 * names is reachable. Reading only the enum would include `GROUP_BUTTON`, which no branch renders.
 */
export function extractRenderedCodes(webAdminSrc: string): { codes: string[]; members: number } {
  const members = readEnumMembers(webAdminSrc);

  const cased = new Set<string>();
  for (const file of walkSourceFiles(webAdminSrc)) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/case\s+ETypeForm\.([A-Za-z_0-9]+)/g)) cased.add(m[1]);
  }

  return { codes: resolveCodes(cased, members), members: members.size };
}

/**
 * Pull the `typeCode` values that still render when placed at the ROOT of `formItems[]`.
 *
 * A different question from {@link extractRenderedCodes}, and the difference is the whole point.
 * The root is entered at `WorkOrderContent.tsx` through `WorkOrderRenderFormItem`, whose `default:`
 * branch renders a node's `childItems` and **not the node itself** — so a root-level leaf produces
 * no markup at all, silently. Only the codes that switch has a `case` for survive up there, which is
 * why every shipped create template puts nothing but containers at the root.
 *
 * Scoped to that one file on purpose: the same `case ETypeForm.X` text in any other component
 * answers a different question and would quietly widen the set.
 */
export function extractRootRenderableCodes(webAdminSrc: string): string[] {
  const members = readEnumMembers(webAdminSrc);
  const rootFile = join(
    webAdminSrc,
    "features/workOrder/workOrderManager/components/WorkOrderRenderFormItem.tsx",
  );
  const cased = new Set<string>();
  for (const m of readFileSync(rootFile, "utf8").matchAll(/case\s+ETypeForm\.([A-Za-z_0-9]+)/g)) {
    cased.add(m[1]);
  }
  return resolveCodes(cased, members);
}

function readEnumMembers(webAdminSrc: string): Map<string, string> {
  const enumFile = join(webAdminSrc, "features/workOrder/workOrderManager/enums/typeFormEnum.ts");
  const members = new Map<string, string>();
  for (const line of readFileSync(enumFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*'([A-Z_0-9]+)'/);
    if (m) members.set(m[1], m[2]);
  }
  return members;
}

function resolveCodes(memberNames: Iterable<string>, members: Map<string, string>): string[] {
  const codes: string[] = [];
  for (const name of memberNames) {
    const code = members.get(name);
    // A `case` on a name the enum does not declare would not compile upstream; if the regex ever
    // reads one, the parse is wrong and the vocabulary would silently gain a bogus code.
    if (!code) throw new Error(`case ETypeForm.${name} has no member in typeFormEnum.ts`);
    codes.push(code);
  }
  return [...new Set(codes)].sort();
}

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSourceFiles(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Count every `typeCode` in the shipped templates, split by which renderer consumes the file. */
export function measureTemplates(templateDir: string): {
  usage: Record<string, TypeCodeUsage>;
  createRootCodes: string[];
  createContainerCodes: string[];
  files: number;
} {
  const files = readdirSync(templateDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const usage = new Map<string, TypeCodeUsage>();
  const rootCodes = new Set<string>();
  const containerCodes = new Set<string>();

  const bump = (code: string, kind: FormKind) => {
    const row = usage.get(code) ?? { create: 0, detail: 0, pdf: 0, workflow: 0 };
    row[kind] += 1;
    usage.set(code, row);
  };

  for (const file of files) {
    const parsed: unknown = JSON.parse(readFileSync(join(templateDir, file), "utf8"));
    const root = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown>;
    const kind = formKindOf(String(root.formCode ?? ""));
    walkNodes(root.formItems, (node, depth) => {
      const code = node.typeCode;
      bump(code, kind);
      if (kind !== "create") return;
      if (depth === 0) rootCodes.add(code);
      if (node.hasChildren) containerCodes.add(code);
    });
  }

  return {
    usage: Object.fromEntries([...usage.entries()].sort(([a], [b]) => a.localeCompare(b))),
    createRootCodes: [...rootCodes].sort(),
    createContainerCodes: [...containerCodes].sort(),
    files: files.length,
  };
}

function walkNodes(
  value: unknown,
  visit: (node: { typeCode: string; hasChildren: boolean }, depth: number) => void,
  depth = 0,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkNodes(item, visit, depth);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (typeof node.typeCode === "string") {
    const children = node.children;
    visit(
      { typeCode: node.typeCode, hasChildren: Array.isArray(children) && children.length > 0 },
      depth,
    );
    walkNodes(children, visit, depth + 1);
  }
}

export function measure(templateDir: string, webAdminSrc: string): EvnMeasurement {
  const { codes, members } = extractRenderedCodes(webAdminSrc);
  const templates = measureTemplates(templateDir);
  return {
    renderedCodes: codes,
    rootRenderableCodes: extractRootRenderableCodes(webAdminSrc),
    usage: templates.usage,
    createRootCodes: templates.createRootCodes,
    createContainerCodes: templates.createContainerCodes,
    templateFiles: templates.files,
    enumMembers: members,
  };
}

/**
 * Fail rather than emit a vocabulary that quietly drifted.
 *
 * A shrunk `renderedCodes` is the dangerous direction: it turns into "this type has no target" and
 * then 422s on forms that were fine. A grown one is how `GROUP` gets back in. Either way a human
 * re-measures and moves the constant deliberately.
 */
function assertYield(m: EvnMeasurement): void {
  const problems: string[] = [];
  if (m.enumMembers !== EXPECTED_ENUM_MEMBERS) {
    problems.push(`ETypeForm has ${m.enumMembers} members, expected ${EXPECTED_ENUM_MEMBERS}`);
  }
  if (m.renderedCodes.length !== EXPECTED_RENDERED_CODES) {
    problems.push(
      `found ${m.renderedCodes.length} rendered codes, expected ${EXPECTED_RENDERED_CODES}`,
    );
  }
  if (m.templateFiles !== EXPECTED_TEMPLATE_FILES) {
    problems.push(`read ${m.templateFiles} templates, expected ${EXPECTED_TEMPLATE_FILES}`);
  }
  if (m.rootRenderableCodes.length !== EXPECTED_ROOT_RENDERABLE_CODES) {
    problems.push(
      `found ${m.rootRenderableCodes.length} root-renderable codes, ` +
        `expected ${EXPECTED_ROOT_RENDERABLE_CODES}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `EVN sources no longer match what P2a measured:\n  - ${problems.join("\n  - ")}\n` +
        "Re-read the sources and update the EXPECTED_* constants deliberately; do not relax them.",
    );
  }
}

/**
 * Emit Biome-clean TypeScript: double quotes, two-space indent, trailing commas, and object keys
 * left UNQUOTED where they are valid identifiers.
 *
 * That last detail is not cosmetic. `pnpm biome check --write` would otherwise rewrite the file the
 * moment anyone lints it, and the next run of this script would rewrite it back — a file that
 * flip-flops in `git status` is a file nobody trusts as measured data.
 */
export function renderVocabularyModule(m: EvnMeasurement, measuredOn: string): string {
  const key = (code: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(code) ? code : `"${code}"`);
  /** One line when it fits Biome's 100-column budget, expanded when it does not — as Biome would. */
  const decl = (name: string, codes: string[]) => {
    const head = `export const ${name}: readonly string[] = `;
    const flat = `[${codes.map((c) => `"${c}"`).join(", ")}]`;
    if (head.length + flat.length + 1 <= 100) return `${head}${flat};`;
    return `${head}[\n${codes.map((c) => `  "${c}",`).join("\n")}\n];`;
  };
  const usageRows = Object.entries(m.usage)
    .map(
      ([code, u]) =>
        `  ${key(code)}: { create: ${u.create}, detail: ${u.detail}, ` +
        `pdf: ${u.pdf}, workflow: ${u.workflow} },`,
    )
    .join("\n");

  return `// GENERATED by src/scripts/measure-evn-templates.ts — do not edit by hand.
// Measured on ${measuredOn} from:
//   E:\\web\\evn\\core-service\\public\\files\\templateJSON  (${m.templateFiles} templates)
//   E:\\web\\web-admin\\src                                  (ETypeForm, ${m.enumMembers} members)
// Re-run the script to refresh; \`type-map.test.ts\` anchors the numbers that matter.

/** How often a \`typeCode\` appears, per renderer. */
export interface EvnTypeCodeUsage {
  readonly create: number;
  readonly detail: number;
  readonly pdf: number;
  readonly workflow: number;
}

/**
 * The \`typeCode\` values the CREATE-form renderer has a \`case\` for.
 *
 * This is the only vocabulary we may emit. Anything outside it reaches
 * \`CheckTyprCodeRenderItem.tsx\`'s \`default: return <></>\` and renders as a blank field.
 */
${decl("EVN_CREATE_RENDERER_CODES", m.renderedCodes)}

/**
 * Production usage of every \`typeCode\` seen in the shipped templates.
 *
 * \`create: 0\` means the renderer has a branch for it but no shipped form exercises it — supported
 * on paper, unproven in practice. \`type-map.ts\` may still target such a code, but only from the
 * reviewed allowlist that \`type-map.test.ts\` pins.
 */
export const EVN_TEMPLATE_USAGE: Readonly<Record<string, EvnTypeCodeUsage>> = {
${usageRows}
};

/** Codes seen directly under a create form's \`formItems[]\`. Nothing else appears at the root. */
${decl("EVN_CREATE_ROOT_CODES", m.createRootCodes)}

/**
 * Codes that still render when placed at the ROOT of \`formItems[]\`.
 *
 * The root is entered through \`WorkOrderRenderFormItem\`, whose \`default:\` branch renders a node's
 * children and NOT the node itself. So a root-level leaf emits no markup — silently. This is the
 * measured reason {@link EVN_CREATE_ROOT_CODES} contains only containers: it is load-bearing, not a
 * house style. P2b wraps stray root leaves in a generated \`CARD\` rather than shipping blanks.
 */
${decl("EVN_ROOT_RENDERABLE_CODES", m.rootRenderableCodes)}

/**
 * Codes seen carrying children in a create form.
 *
 * ⚠️ Read this as a census of the SHIPPED templates, not as a limit of the renderer. Nesting one
 * container in another (\`CARD > CARD\`, \`COLLAPSE > CARD\`, a container inside
 * \`COMPONENT_HORIZONAL\`) does not occur here but does work: those branches recurse through
 * \`RenderFormItemInForm\`, which routes container codes straight back to \`WorkOrderRenderFormItem\`.
 * What genuinely breaks is a container inside \`FORM_LIST\` — there children become table columns
 * (\`SharedEditTable\`), \`COLLAPSE\`/\`COMPONENT_HORIZONAL\` are hijacked into the pinned action
 * column, and \`CARD\` falls through to \`default: return <></>\`. P2b rejects that placement.
 */
${decl("EVN_CREATE_CONTAINER_CODES", m.createContainerCodes)}
`;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  // Guard against `--templates --out x` swallowing the next flag as a value.
  return value && !value.startsWith("--") ? value : undefined;
}

async function main(): Promise<void> {
  const templateDir = arg("--templates") ?? process.env.EVN_TEMPLATE_DIR;
  const webAdminSrc = arg("--web-admin") ?? process.env.EVN_WEB_ADMIN_SRC;
  if (!templateDir || !webAdminSrc) {
    throw new Error(
      "Need both EVN sources: --templates <templateJSON dir> --web-admin <web-admin/src dir> " +
        "(or EVN_TEMPLATE_DIR / EVN_WEB_ADMIN_SRC).",
    );
  }
  const out = arg("--out") ?? resolve(import.meta.dirname, "../modules/external/evn-vocabulary.ts");

  const measurement = measure(resolve(templateDir), resolve(webAdminSrc));
  assertYield(measurement);
  writeFileSync(out, renderVocabularyModule(measurement, new Date().toISOString().slice(0, 10)));

  console.log(`Measured ${measurement.templateFiles} templates, ${measurement.enumMembers} enum`);
  console.log(`members, ${measurement.renderedCodes.length} rendered codes -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
