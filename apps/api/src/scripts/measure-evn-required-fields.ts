import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EVN_GUARD_CONTENT_FINISHED, EVN_PCT_GUARDS } from "../modules/external/evn-guards.js";

/**
 * Regenerate `modules/external/evn-required-fields.ts` by MEASURING EVN's own source (P4c).
 *
 * P4b could only NAME the content guard — `CONTENT_FINISHED` went into `outOfScopeGuards` and the
 * caller was told to check it themselves. This script extracts what that guard actually reads, so
 * endpoint C can evaluate it and answer `requiredFields`.
 *
 * The guard is `checkContentFinished` (`modules/ticket/service/ticket.service.ts:5418`) driven by
 * the data table `ACTION_FINISH_CONTENT` (`modules/ticket/ticket.constant.ts:911`). For PCT that is
 * 5 actions over 13 `item × mark` pairs, and every one of them takes ONE branch of the checker:
 * `type === 'OBJ'` with a non-empty `mark`, i.e. `_.forEach(value, vi => !vi[mark] && fail)`
 * (`ticket.service.ts:5478-5486`). That single branch is what the `none` primitive in
 * `check-transition.ts` reproduces.
 *
 * ⚠️ `type` and `mark` are emitted even though today they are always `"OBJ"` and non-empty, and the
 * runtime re-checks both. A gate that lives only in this file would only fire when someone chose to
 * regenerate — and regenerating needs EVN's source, which CI does not have. The failure it guards
 * against is silent and one-directional: a `type: 'LIST'` pair fails in EVN when the list is empty
 * (`ticket.service.ts:5472-5477`) while `none` over an empty array returns TRUE, so we would start
 * passing tickets EVN rejects, with nothing red anywhere.
 *
 * ⚠️ THREE enums are resolved member -> value, not two. `formItemCodeEnum` happens to spell every
 * relevant member identically to its value, but `TypeActionFinishContentEnum` does NOT
 * (`obj = 'OBJ'`, `ticket.constant.ts:905-908`) — and `type` is the field the most important gate
 * reads. This is the same trap that cost P3 and P4a a wrong extraction; assuming member === value
 * is never safe here, however many times it happens to hold.
 *
 * ⚠️ Do NOT pin the number of `checkContentFinished` call sites. There are two, and the second is
 * easy to miss: `ticket.service.ts:19625` inside `updateDataSync`, throwing a different i18n key.
 * There are also two inline re-implementations of the same table walk (`:8490+`, `:8723+`) that
 * compute a notification flag. None of that changes what the guard READS, which is all this script
 * extracts.
 *
 * The source lives OUTSIDE this repo, so this cannot run in CI. Every count is pinned in an
 * `EXPECTED_*` constant and a mismatch throws WITHOUT writing the file. Each gate additionally has a
 * twin in `check-transition.test.ts` running on the COMMITTED output.
 *
 * Parsing helpers are duplicated from `measure-evn-guards.ts` rather than shared, for the reason
 * that script gives: its output must stay byte-identical on regeneration, and coupling the
 * generators would make every edit here a risk to work that is already done.
 *
 * Usage:
 *   tsx src/scripts/measure-evn-required-fields.ts
 *     [--core-service <dir>]  default $EVN_CORE_SERVICE_SRC
 *     [--out <file>]          default src/modules/external/evn-required-fields.ts
 */

const ACTION_ENUM = "codeActionEnum";
const ITEM_ENUM = "formItemCodeEnum";
const TYPE_ENUM = "TypeActionFinishContentEnum";

/**
 * The revision of EVN's checkout the output was measured from, recorded in the generated header.
 *
 * Worth the two lines: their repository moved under us MID-SLICE (a `pull --tags` fast-forwarded
 * `ticket.service.ts` by 46-48 lines, unevenly), which silently invalidated every line citation in
 * this slice while the extracted DATA stayed identical. A date alone cannot be checked out; a SHA
 * can, so anyone reading a stale citation can see at a glance which tree it was true of.
 *
 * Best-effort: a checkout without git still generates, it just records `unknown`.
 */
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

/** PCT actions in `ACTION_FINISH_CONTENT`, pinned by MEMBERSHIP — see {@link assertYield}. */
const EXPECTED_PCT_ACTIONS = [
  "PCT_A_ALLOW",
  "PCT_A_ALLOW_HANDOVER",
  "PCT_A_CONFIRM_LOCK",
  "PCT_A_END",
  "PCT_A_HANDOVER",
];

/**
 * Pairs per action.
 *
 * `PCT_A_HANDOVER` is 5, not 6: a sixth pair (`WARNING_INSTRUCTIONS` + `MARKED_IMAGE`) is COMMENTED
 * OUT at `ticket.constant.ts:965-970` with a business note ("drop the photo requirement for PCT
 * item 2.5"). A parser that keeps comments reads 6 here and starts demanding a photo EVN stopped
 * demanding. The per-action counts exist to catch exactly that, which a total of 13 would not.
 */
const EXPECTED_PAIRS_PER_ACTION: Record<string, number> = {
  PCT_A_ALLOW: 4,
  PCT_A_ALLOW_HANDOVER: 2,
  PCT_A_CONFIRM_LOCK: 1,
  PCT_A_END: 1,
  PCT_A_HANDOVER: 5,
};

/**
 * Every item and mark code the PCT pairs resolve to, pinned by VALUE.
 *
 * Member and value coincide for all of these today. They are pinned anyway: the whole point of
 * resolving through the enum is that the two can diverge, and a pin that only restates the member
 * name would not notice when they do.
 */
const EXPECTED_CODES = [
  "BARRIER_SIGNAGE",
  "CHECKED_INTERGRATED_AND_EARTHING",
  "HANDOVER_POWER_RUN_OUT_DEVICE",
  "INTERGRATED_AND_EARTHING",
  "LOCATION_TO_EARTHING",
  "MARKED",
  "MARKED_IMAGE",
  "PARTICIPANTS_WORKSITE",
  "POWER_RUN_OUT_DEVICE",
  "WARNING_INSTRUCTIONS",
];

/** `TypeActionFinishContentEnum`, where member and value DIVERGE. */
const EXPECTED_TYPE_VALUES: Record<string, string> = { obj: "OBJ", list: "LIST" };

/**
 * The two-level branch (`value[].children[][mark]`, `ticket.service.ts:5462-5470`).
 *
 * PCT never reaches it — the code appears in `ACTION_FINISH_CONTENT` only inside two fully
 * commented-out PTT blocks (`ticket.constant.ts:1035`, `:1050`). If it ever shows up in a live PCT
 * pair, the flat `none` primitive silently checks the wrong level of the tree.
 */
const TWO_LEVEL_ITEM_CODE = "PROCEDURE_OPERATIONAL_TASKS";

/** The i18n key that names the guard. Gone = the guard was rewritten; fail loudly. */
const CONTENT_FINISHED_KEY = "ticket.dataRequired";

export interface RequiredContentPair {
  itemCode: string;
  mark: string;
  type: string;
}

export interface RequiredContentMeasurement {
  /** Action code -> pairs, in DECLARATION order (see the note in the rendered file). */
  pairs: Record<string, RequiredContentPair[]>;
}

// ---------------------------------------------------------------------------- parsing primitives

/**
 * Blank out whole-line `//` comments.
 *
 * ⚠️ Splitting on `/\r?\n/` is load-bearing, and matches the other two copies of this helper. EVN's
 * sources are CRLF; splitting on `"\n"` alone leaves a trailing `\r` on every line, and `.` does not
 * match `\r`, so `/^\s*\/\/.*$/` matches NOTHING and the stripper becomes a silent no-op. That is
 * how the first run of this script read SIX pairs for `PCT_A_HANDOVER`, pulling in the photo
 * requirement EVN commented out (`ticket.constant.ts:965-970`). The per-action gate caught it here;
 * `measure-evn-guards.ts` had no equivalent gate and shipped two wrong guards through P4b.
 */
function stripLineComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

/** The text of one `export const NAME = [ … ]`, up to whatever `export const` follows it. */
function sliceConst(src: string, name: string): string {
  const start = src.indexOf(`export const ${name} = [`);
  if (start === -1) throw new Error(`${name} not found — did it move or get renamed?`);
  const next = src.indexOf("export const ", start + `export const ${name}`.length);
  return src.slice(start, next === -1 ? src.length : next);
}

/** Member -> value for one TypeScript string enum. */
function extractEnum(file: string, name: string): Record<string, string> {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf(`export enum ${name} {`);
  if (start === -1) throw new Error(`enum ${name} not found in ${file}`);
  const end = src.indexOf("\n}", start);
  const body = stripLineComments(src.slice(start, end));
  const members: Record<string, string> = {};
  for (const [, member, value] of body.matchAll(/([A-Za-z0-9_$]+)\s*=\s*['"`]([^'"`]*)['"`]/g)) {
    members[member] = value;
  }
  if (Object.keys(members).length === 0) throw new Error(`enum ${name} parsed empty`);
  return members;
}

type Resolve = (enumName: string, member: string) => string;

/**
 * `formItemCodeEnum.MARKED` -> `"MARKED"`, `TypeActionFinishContentEnum.obj` -> `"OBJ"`.
 *
 * Unknown members throw rather than falling back to the member name. That fallback is the P3/P4a
 * mistake, and here it would be invisible: `obj` would sail through as the string `"obj"` and every
 * `type === "OBJ"` gate would fail in a way that reads like EVN changed their data.
 */
function buildResolver(enums: Record<string, Record<string, string>>): Resolve {
  return (enumName, member) => {
    const members = enums[enumName];
    if (!members) throw new Error(`no enum named ${enumName} was loaded`);
    const value = members[member];
    if (value === undefined) throw new Error(`${enumName}.${member} has no value in source`);
    return value;
  };
}

/** The `[ … ]` starting at `from`, by bracket matching. */
function sliceBracketed(src: string, from: number, open: "[" | "{"): string {
  const close = open === "[" ? "]" : "}";
  const start = src.indexOf(open, from);
  if (start === -1) throw new Error(`no ${open} after offset ${from}`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${open} from offset ${start}`);
}

/** Every top-level `{ … }` inside one array literal. */
function objectLiterals(arraySrc: string): string[] {
  const out: string[] = [];
  for (let i = arraySrc.indexOf("{"); i !== -1; i = arraySrc.indexOf("{", i + 1)) {
    const obj = sliceBracketed(arraySrc, i, "{");
    out.push(obj);
    i += obj.length - 1;
  }
  return out;
}

/** `code: formItemCodeEnum.MARKED` -> the resolved value, or `""` when the key is absent. */
function field(objSrc: string, key: string, enumName: string, resolve_: Resolve): string {
  const match = objSrc.match(new RegExp(`\\b${key}:\\s*${enumName}\\.([A-Za-z0-9_$]+)`));
  if (match?.[1]) return resolve_(enumName, match[1]);
  // Present but not written as a member of the enum we expect. Reading it as "absent" would let a
  // literal `type: 'LIST'` pass the OBJ gate, so it has to be louder than a miss.
  if (new RegExp(`\\b${key}\\s*:`).test(objSrc)) {
    throw new Error(`\`${key}\` is set to something other than a ${enumName} member in: ${objSrc}`);
  }
  return "";
}

const isPct = (code: string): boolean => code.startsWith("PCT_A_");

// ------------------------------------------------------------------------------------ measuring

export function measure(coreServiceSrc: string): RequiredContentMeasurement {
  const resolve_ = buildResolver({
    [ACTION_ENUM]: extractEnum(
      join(coreServiceSrc, "shared/common/enum/ticket.enum.ts"),
      ACTION_ENUM,
    ),
    [ITEM_ENUM]: extractEnum(join(coreServiceSrc, "modules/form/form.enum.ts"), ITEM_ENUM),
    [TYPE_ENUM]: extractEnum(join(coreServiceSrc, "modules/ticket/ticket.constant.ts"), TYPE_ENUM),
  });
  const ticketConstants = readFileSync(
    join(coreServiceSrc, "modules/ticket/ticket.constant.ts"),
    "utf8",
  );
  const ticketService = readFileSync(
    join(coreServiceSrc, "modules/ticket/service/ticket.service.ts"),
    "utf8",
  );

  // The guard still has to BE the thing we extracted a table for. `ticket.dataRequired` is the only
  // name it has (it throws a variable), and `TypeActionFinishContentEnum.obj` + `_.forEach(value` is
  // the specific branch our `none` primitive reproduces. Either one missing means read the function
  // again before trusting anything below it.
  const fn = sliceBracketed(
    ticketService,
    ticketService.indexOf("async checkContentFinished("),
    "{",
  );
  for (const marker of [CONTENT_FINISHED_KEY, `${TYPE_ENUM}.obj`, "_.forEach(value"]) {
    if (!fn.includes(marker)) {
      throw new Error(
        `checkContentFinished no longer contains \`${marker}\` — it was rewritten; re-read it ` +
          "before regenerating, the `none` primitive may no longer model it",
      );
    }
  }

  const block = stripLineComments(sliceConst(ticketConstants, "ACTION_FINISH_CONTENT"));
  const pairs: Record<string, RequiredContentPair[]> = {};

  const actionAt = [
    ...block.matchAll(new RegExp(`action:\\s*${ACTION_ENUM}\\.([A-Za-z0-9_$]+)`, "g")),
  ];
  if (actionAt.length === 0) throw new Error("ACTION_FINISH_CONTENT parsed no `action:` entries");

  for (const [index, match] of actionAt.entries()) {
    const action = resolve_(ACTION_ENUM, match[1] as string);
    if (!isPct(action)) continue;
    // Bounded by the NEXT `action:` so an `items:` array can never be read across entry borders.
    const end = actionAt[index + 1]?.index ?? block.length;
    const segment = block.slice(match.index, end);
    const itemsAt = segment.indexOf("items:");
    if (itemsAt === -1) throw new Error(`${action} in ACTION_FINISH_CONTENT has no \`items:\``);

    pairs[action] = objectLiterals(sliceBracketed(segment, itemsAt, "[")).map((obj) => ({
      itemCode: field(obj, "code", ITEM_ENUM, resolve_),
      mark: field(obj, "mark", ITEM_ENUM, resolve_),
      type: field(obj, "type", TYPE_ENUM, resolve_),
    }));
  }

  return { pairs };
}

export function assertYield(m: RequiredContentMeasurement): void {
  // ⚠️ MEMBERSHIP, not count. Five stays five when one action is swapped for a neighbour, which is
  // the shape a mis-parse takes — the lesson P4b's generator header spells out at length.
  const actions = Object.keys(m.pairs).sort();
  if (actions.join(",") !== EXPECTED_PCT_ACTIONS.join(",")) {
    throw new Error(
      `PCT actions changed: expected [${EXPECTED_PCT_ACTIONS.join(", ")}], ` +
        `measured [${actions.join(", ")}]`,
    );
  }

  for (const [action, want] of Object.entries(EXPECTED_PAIRS_PER_ACTION)) {
    const got = m.pairs[action]?.length ?? 0;
    if (got !== want) {
      throw new Error(
        `${action}: expected ${want} item/mark pairs, measured ${got} — if this is ` +
          "PCT_A_HANDOVER reading 6, the commented-out WARNING_INSTRUCTIONS pair leaked through",
      );
    }
  }

  const all = Object.values(m.pairs).flat();
  for (const pair of all) {
    if (pair.type !== EXPECTED_TYPE_VALUES.obj) {
      throw new Error(
        `${pair.itemCode} is type ${pair.type || "(absent)"}, not OBJ — the \`none\` primitive ` +
          "models only the OBJ branch, and a LIST pair fails in EVN exactly where `none` passes",
      );
    }
    if (pair.mark === "") {
      throw new Error(
        `${pair.itemCode} has no \`mark\` — that takes EVN's "value must be truthy" branch ` +
          "(ticket.service.ts:5487-5493), which the `none` primitive does not model",
      );
    }
    if (pair.itemCode === TWO_LEVEL_ITEM_CODE) {
      throw new Error(
        `${TWO_LEVEL_ITEM_CODE} is now a live PCT pair — it takes the two-level branch ` +
          "(ticket.service.ts:5462-5470) and the flat primitive would check the wrong level",
      );
    }
  }

  const codes = [...new Set(all.flatMap((p) => [p.itemCode, p.mark]))].sort();
  if (codes.join(",") !== EXPECTED_CODES.join(",")) {
    throw new Error(
      `item/mark codes changed: expected [${EXPECTED_CODES.join(", ")}], ` +
        `measured [${codes.join(", ")}]`,
    );
  }

  // Cross-check against the OTHER generated file. Both are measured from EVN's source but by
  // separate scripts, so this catches the case where only one of them was regenerated — which would
  // otherwise strip `CONTENT_FINISHED` from an action we no longer evaluate, or leave it on one we
  // do. Not a tautology: nothing here derives from `evn-guards.ts`.
  const guarded = Object.entries(EVN_PCT_GUARDS)
    .filter(([, guards]) => guards.includes(EVN_GUARD_CONTENT_FINISHED))
    .map(([action]) => action)
    .sort();
  if (guarded.join(",") !== actions.join(",")) {
    throw new Error(
      `evn-guards.ts marks [${guarded.join(", ")}] with CONTENT_FINISHED but ACTION_FINISH_CONTENT ` +
        `covers [${actions.join(", ")}] — regenerate both, they are measured from the same table`,
    );
  }
}

// ------------------------------------------------------------------------------------ rendering

export function renderRequiredFieldsModule(
  m: RequiredContentMeasurement,
  measuredOn: string,
  revision: string,
): string {
  const total = Object.values(m.pairs).flat().length;

  return `// GENERATED by src/scripts/measure-evn-required-fields.ts — do not edit by hand.
// Measured on ${measuredOn} from E:\\web\\evn\\core-service/src @ ${revision}:
// (Line citations throughout this slice are true of THAT revision. Their tree moved under us once
//  already mid-slice — a fast-forward shifted ticket.service.ts by 46-48 lines, unevenly — while
//  the extracted data stayed identical. Check out the SHA before trusting a line number.)
//   modules/ticket/ticket.constant.ts            (ACTION_FINISH_CONTENT — the table)
//   modules/ticket/service/ticket.service.ts     (checkContentFinished — how it is read)
//   modules/form/form.enum.ts                    (formItemCodeEnum)
// ${total} item/mark pairs over ${Object.keys(m.pairs).length} PCT actions.

/** One thing EVN's content guard insists on: a mark that must be truthy on every row of an item. */
export interface EvnRequiredContentPair {
  /** \`ticket_items.code\` — the key endpoint C looks for in \`ticketData\`. */
  itemCode: string;
  /** The property that must be truthy on EVERY row, e.g. \`MARKED\` or \`MARKED_IMAGE\`. */
  mark: string;
  /**
   * \`"OBJ"\` for every pair measured so far, and checked again at runtime rather than assumed.
   *
   * EVN's checker branches on it (\`ticket.service.ts:5472-5486\`) and the two branches disagree on
   * the case that matters: an empty value PASSES for \`OBJ\` and FAILS for \`LIST\`. Our \`none\`
   * primitive models \`OBJ\` only, so a \`LIST\` pair must stop us evaluating rather than be
   * evaluated with the wrong rule.
   */
  type: string;
}

/**
 * What \`checkContentFinished\` (\`ticket.service.ts:5418\`) requires, per action.
 *
 * This is the content half of the \`CONTENT_FINISHED\` guard that P4b could only name. Endpoint C
 * evaluates it against the \`ticketData\` on the request, and drops \`CONTENT_FINISHED\` from
 * \`outOfScopeGuards\` only when it managed to evaluate every pair.
 *
 * ⚠️ Order is DECLARATION order, not sorted. \`requiredFields\` is echoed in this order so the
 * caller sees the items in the same sequence their own form does; \`PCT_A_HANDOVER\` in particular
 * is not alphabetical. Sorting it would be a silent presentation change to a shipped contract.
 *
 * ⚠️ An action absent from this table has NO content requirement — that is a real answer, not a
 * gap, and C reports \`requiredFields: []\` for it.
 *
 * ⚠️ Actions here must be exactly the actions carrying \`CONTENT_FINISHED\` in \`evn-guards.ts\`.
 * The generator cross-checks the two, because they are measured from the same EVN table by
 * different scripts and regenerating only one would desynchronise them.
 */
export const EVN_PCT_REQUIRED_CONTENT: Readonly<
  Record<string, readonly EvnRequiredContentPair[]>
> = {
${Object.entries(m.pairs)
  .map(
    ([action, list]) =>
      `  ${action}: [\n${list
        .map((p) => `    { itemCode: "${p.itemCode}", mark: "${p.mark}", type: "${p.type}" },`)
        .join("\n")}\n  ],`,
  )
  .join("\n")}
};
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
    arg("--out") ?? resolve(import.meta.dirname, "../modules/external/evn-required-fields.ts");

  const src = resolve(coreServiceSrc);
  const measurement = measure(src);
  assertYield(measurement);
  writeFileSync(
    out,
    renderRequiredFieldsModule(
      measurement,
      new Date().toISOString().slice(0, 10),
      sourceRevision(src),
    ),
  );

  // Format in the same breath as writing, for the reason `measure-evn-guards.ts` gives: "run this
  // script" has to produce exactly the bytes that are committed, or regenerating stops proving that
  // nothing was hand-edited.
  execFileSync("pnpm", ["exec", "biome", "check", "--write", out], {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  console.log(
    `Measured ${Object.values(measurement.pairs).flat().length} item/mark pairs over ` +
      `${Object.keys(measurement.pairs).length} PCT actions -> ${out}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
