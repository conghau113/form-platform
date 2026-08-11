import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Regenerate `modules/external/evn-guards.ts` by MEASURING EVN's own source (P4b).
 *
 * The transition table (P4a) says what a `(role, status, action)` triple is allowed to become. It
 * does NOT say what else EVN checks before letting the action through, and those checks are where
 * endpoint C's honesty lives: C answers "no guard IN SCOPE is violated", so it has to be able to
 * name the ones out of scope.
 *
 * ⚠️ There are TWO guard surfaces and P4b's first draft only found one:
 *  1. The WRITE path, `updateStatus` (`modules/ticket/service/ticket.service.ts:4731+`) — throws
 *     `BadRequestException` and refuses.
 *  2. The PRE-CHECK path, `getActionForUserByTicketId`
 *     (`modules/ticket/service/ticket-action.service.ts:781-1069`) — 31 `addAction = false` sites
 *     that decide which actions the user is even offered.
 * C is a pre-check (QĐ-1), so (2) is the surface it is actually standing in for. Reporting only (1)
 * would let a caller believe C had considered a question it never asked.
 *
 * ⚠️ Blocks are found by matching braces from a condition that mentions `actionCode`, and each
 * `changeStatus = false` / `addAction = false` line is attributed to the INNERMOST block containing
 * it. Attribution by "which action lists are nearby" is what produced the first draft's wrong
 * citation: `ticket.service.ts:4881` sits in the `PTT_A_GSTT_CONFIRM` branch, not the
 * `PCT_A_NHANVIEN_CONFIRM` one three blocks above it. Two conditions in that chain are written
 * `X == actionCode` rather than `_.includes([…], actionCode)` (`:4834`, `:4929`), so a scanner that
 * only understands the second form silently attributes those lines to the wrong neighbour — and
 * because the neighbours already qualify, the resulting action set still looks right. Two gates
 * follow from that: {@link measure} throws when a site attributes to NO block, and
 * {@link assertYield} pins the resulting six actions by MEMBERSHIP, since a wrong attribution
 * yields a set of the right size with one member swapped.
 *
 * ⚠️ Guard names come from the checker EVN calls, not from prose. Where a name cannot be read off a
 * call — `checkContentFinished` throws `messErr`, a variable (`ticket.service.ts:4752`) — the guard
 * is derived from its action list instead and the i18n key inside the checker is pinned, so a
 * rename over there fails here rather than silently emptying the guard.
 *
 * The source lives OUTSIDE this repo, so this cannot run in CI. Every count is therefore pinned in
 * an `EXPECTED_*` constant and a mismatch throws WITHOUT writing the file. The invariants that the
 * runtime depends on are additionally asserted in `check-transition.test.ts`, which runs on the
 * committed output — a gate that only lives here would only fire when someone chose to regenerate.
 *
 * Parsing helpers are duplicated from `measure-evn-transitions.ts` rather than shared: that script's
 * output must stay byte-identical on regeneration, and coupling the two generators would make every
 * future edit here a risk to P4a's table for no benefit at this size.
 *
 * Usage:
 *   tsx src/scripts/measure-evn-guards.ts
 *     [--core-service <dir>]  default $EVN_CORE_SERVICE_SRC
 *     [--out <file>]          default src/modules/external/evn-guards.ts
 */

const ACTION_ENUM = "codeActionEnum";

/** PCT actions in `ACTION_FINISH_CONTENT` (`modules/ticket/ticket.constant.ts:911`). */
const EXPECTED_CONTENT_FINISHED = 5;
/** PCT actions in `ACTION_CHECK_EMPLOYEE_CHECKOUT` — `PCT_A_END` only; the other entry is LCT. */
const EXPECTED_CHECKOUT_ALL = 1;
/**
 * PCT actions whose block throws `ticket.emplIsCheckoutWork`.
 *
 * Two, and the second is easy to miss: `ticket.service.ts:4956` sits three levels down inside a
 * `Promise.all(_.map(...))` in the `PCT_A_CHTT_NHANVIEN_CHECKIN` branch, not at the top of it.
 */
const EXPECTED_CHECKIN_ACROSS_TICKETS = 2;
/** `changeStatus = false` assignments in `updateStatus`, PCT and otherwise. */
const EXPECTED_NO_CHANGE_SITES = 11;
/** Of those, the ones landing on a PCT action. */
const EXPECTED_NO_CHANGE_PCT_ACTIONS = 6;
/**
 * And WHICH six, sorted.
 *
 * The count alone is a weak gate: swap one action for another and it still reads six. Since a wrong
 * block attribution produces exactly that — a plausible set with one member from the neighbouring
 * branch — membership is what has to be pinned.
 */
const EXPECTED_NO_CHANGE_PCT = [
  "PCT_A_CHTT_NHANVIEN_CHECKIN",
  "PCT_A_CHTT_NHANVIEN_CHECKOUT",
  "PCT_A_NHANVIEN_CHECKIN",
  "PCT_A_NHANVIEN_CHECKOUT",
  "PCT_A_NHANVIEN_CONFIRM",
  "PCT_A_NHANVIEN_NOT_READY",
];
/** `addAction = false` assignments in `getActionForUserByTicketId`. */
const EXPECTED_PRECHECK_SITES = 31;
/**
 * `throw` statements in `updateStatus` — ANY of them, not only `BadRequestException`.
 *
 * Pinned because a NEW throw is the likeliest real drift on their side, and it is the one that
 * hurts: an unmodelled refusal means we under-report `outOfScopeGuards` and tell the caller they
 * have nothing left to check when they do. Counting only `BadRequestException` would leave the one
 * gate whose job is catching new refusals blind to a refusal thrown as anything else — today all
 * six happen to be `BadRequestException`, which is exactly why it would go unnoticed.
 */
const EXPECTED_UPDATE_THROWS = 6;

/** The i18n keys that name a guard we claim to have found. Gone = the guard moved; fail loudly. */
const CHECKOUT_ALL_KEY = "ticket.emplIsCheckoutAll";
const CHECKIN_ACROSS_TICKETS_KEY = "ticket.emplIsCheckoutWork";
const CONTENT_FINISHED_KEY = "ticket.dataRequired";

export interface GuardMeasurement {
  /** Action code -> guard codes, sorted, PCT only. */
  guards: Record<string, string[]>;
  /** PCT actions `updateStatus` refuses to change the status for, whatever the table says. */
  noStatusChange: string[];
  /** Guard code -> one-line provenance, rendered into the generated file. */
  provenance: Record<string, string>;
}

// ---------------------------------------------------------------------------- parsing primitives

function stripLineComments(src: string): string {
  return src
    .split("\n")
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

type Resolve = (member: string) => string;

/**
 * `codeActionEnum.PCT_A_END` -> `"PCT_A_END"`.
 *
 * Unknown members throw. Falling back to the member name is the P3/P4a mistake — 51 of the 132
 * status members carry a value that differs from their name, and nothing guarantees the action enum
 * stays free of that.
 */
function buildResolver(members: Record<string, string>): Resolve {
  return (member) => {
    const value = members[member];
    if (value === undefined) throw new Error(`${ACTION_ENUM}.${member} has no value in source`);
    return value;
  };
}

/** Action codes listed in one `export const NAME = [codeActionEnum.X, …]`. */
function parseActionList(constantsSrc: string, name: string, resolve_: Resolve): string[] {
  const block = stripLineComments(sliceConst(constantsSrc, name));
  const codes = [...block.matchAll(new RegExp(`${ACTION_ENUM}\\.([A-Za-z0-9_$]+)`, "g"))].map(
    ([, member]) => resolve_(member),
  );
  if (codes.length === 0) throw new Error(`${name} parsed empty`);
  return codes;
}

/** Action codes named by an `action:` key — `ACTION_FINISH_CONTENT` is objects, not bare codes. */
function parseActionKeyedList(constantsSrc: string, name: string, resolve_: Resolve): string[] {
  const block = stripLineComments(sliceConst(constantsSrc, name));
  const codes = [
    ...block.matchAll(new RegExp(`action:\\s*${ACTION_ENUM}\\.([A-Za-z0-9_$]+)`, "g")),
  ].map(([, member]) => resolve_(member));
  if (codes.length === 0) throw new Error(`${name} parsed no \`action:\` entries`);
  return codes;
}

/** The body of one method, by brace matching from its signature. */
function sliceMethod(src: string, signature: string): { body: string; offset: number } {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error(`method \`${signature}\` not found — renamed?`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { body: src.slice(start, i + 1), offset: start };
    }
  }
  throw new Error(`method \`${signature}\` never closes`);
}

interface ConditionBlock {
  /** Action codes the condition selects on, already resolved to values. */
  actions: string[];
  /** Offsets within the enclosing method body. */
  start: number;
  end: number;
  text: string;
}

/**
 * Every `if (…actionCode…) { … }` in a method body, with the action codes it selects on.
 *
 * Understands all three shapes EVN mixes in one chain, which is the point:
 *   `_.includes([codeActionEnum.A, codeActionEnum.B], actionCode)`
 *   `_.includes(SOME_CONSTANT, actionCode)`
 *   `codeActionEnum.A == actionCode`
 */
function parseConditionBlocks(
  body: string,
  resolve_: Resolve,
  lists: Record<string, readonly string[]>,
): ConditionBlock[] {
  const blocks: ConditionBlock[] = [];
  for (const match of body.matchAll(/\bif\s*\(/g)) {
    const condStart = match.index + match[0].length - 1;
    let depth = 0;
    let condEnd = -1;
    for (let i = condStart; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") {
        depth--;
        if (depth === 0) {
          condEnd = i;
          break;
        }
      }
    }
    if (condEnd === -1) continue;
    const condition = body.slice(condStart, condEnd + 1);
    if (!condition.includes("actionCode")) continue;

    const actions = new Set<string>();
    for (const [, member] of condition.matchAll(
      new RegExp(`${ACTION_ENUM}\\.([A-Za-z0-9_$]+)`, "g"),
    )) {
      actions.add(resolve_(member));
    }
    for (const [name, codes] of Object.entries(lists)) {
      if (new RegExp(`\\b${name}\\b`).test(condition)) for (const code of codes) actions.add(code);
    }
    if (actions.size === 0) continue;

    const open = body.indexOf("{", condEnd);
    if (open === -1) continue;
    depth = 0;
    for (let i = open; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") {
        depth--;
        if (depth === 0) {
          blocks.push({
            actions: [...actions],
            start: open,
            end: i,
            text: body.slice(open, i + 1),
          });
          break;
        }
      }
    }
  }
  return blocks;
}

/** The innermost parsed block containing `offset`, or undefined when none does. */
function innermostBlock(
  blocks: readonly ConditionBlock[],
  offset: number,
): ConditionBlock | undefined {
  let best: ConditionBlock | undefined;
  for (const block of blocks) {
    if (offset > block.start && offset < block.end) {
      if (!best || block.start > best.start) best = block;
    }
  }
  return best;
}

/** Offsets of every occurrence of `needle` in `haystack`. */
function offsetsOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) out.push(i);
  return out;
}

const isPct = (code: string): boolean => code.startsWith("PCT_A_");

/** `checkEmployeeCanCheckinBySelf` -> `EMPLOYEE_CAN_CHECKIN_BY_SELF`. */
function guardNameFromChecker(checker: string): string {
  return checker
    .replace(/^check/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

// ------------------------------------------------------------------------------------ measuring

export function measure(coreServiceSrc: string): GuardMeasurement {
  const resolve_ = buildResolver(
    extractEnum(join(coreServiceSrc, "shared/common/enum/ticket.enum.ts"), ACTION_ENUM),
  );
  const ticketConstants = readFileSync(
    join(coreServiceSrc, "modules/ticket/ticket.constant.ts"),
    "utf8",
  );
  const ticketService = readFileSync(
    join(coreServiceSrc, "modules/ticket/service/ticket.service.ts"),
    "utf8",
  );
  const ticketActionService = readFileSync(
    join(coreServiceSrc, "modules/ticket/service/ticket-action.service.ts"),
    "utf8",
  );

  // Two of the three sit at the throw itself, so a file-wide check is enough for them.
  for (const key of [CHECKOUT_ALL_KEY, CHECKIN_ACROSS_TICKETS_KEY]) {
    if (!ticketService.includes(key)) {
      throw new Error(`i18n key ${key} is gone from ticket.service.ts — the guard it names moved`);
    }
  }
  // `ticket.dataRequired` needs the narrower check: `checkContentFinished` throws a VARIABLE
  // (`ticket.service.ts:4752`), so the key is the only thing naming that guard — and it also occurs
  // elsewhere in the file (`:17462`), where a file-wide check would keep passing after the guard
  // itself had been rewritten.
  const contentFinishedFn = sliceMethod(ticketService, "async checkContentFinished(");
  if (!contentFinishedFn.body.includes(CONTENT_FINISHED_KEY)) {
    throw new Error(
      `${CONTENT_FINISHED_KEY} is gone from checkContentFinished — CONTENT_FINISHED no longer ` +
        "describes what that guard rejects on",
    );
  }

  const lists: Record<string, string[]> = {
    ACTION_CHECK_EMPLOYEE_CHECKOUT: parseActionList(
      ticketConstants,
      "ACTION_CHECK_EMPLOYEE_CHECKOUT",
      resolve_,
    ),
    ACTION_TOGETHER_TO_DONE: parseActionList(ticketConstants, "ACTION_TOGETHER_TO_DONE", resolve_),
    CHTT_ACTION: parseActionList(ticketConstants, "CHTT_ACTION", resolve_),
    GSATD_ACTION: parseActionList(ticketConstants, "GSATD_ACTION", resolve_),
    NTT_ACTION: parseActionList(ticketConstants, "NTT_ACTION", resolve_),
    START_WORK_ACTION: parseActionList(ticketConstants, "START_WORK_ACTION", resolve_),
    NVCT_DO: parseActionList(ticketConstants, "NVCT_DO", resolve_),
  };
  const contentFinished = parseActionKeyedList(ticketConstants, "ACTION_FINISH_CONTENT", resolve_);

  const guards: Record<string, Set<string>> = {};
  const provenance: Record<string, string> = {};
  const add = (action: string, guard: string, where: string): void => {
    if (!isPct(action)) return;
    const set = guards[action] ?? new Set<string>();
    set.add(guard);
    guards[action] = set;
    provenance[guard] ??= where;
  };

  // ---- surface 1: the write path, `updateStatus`.
  const update = sliceMethod(
    ticketService,
    "async updateStatus(user: UserModel, param: UpdateStatusDto)",
  );
  const updateBlocks = parseConditionBlocks(update.body, resolve_, lists);

  const updateThrows = (update.body.match(/\bthrow\b/g) ?? []).length;
  if (updateThrows !== EXPECTED_UPDATE_THROWS) {
    throw new Error(
      `updateStatus now has ${updateThrows} throws, not ${EXPECTED_UPDATE_THROWS} — a refusal was ` +
        "added or removed on their side; read it before regenerating, an unmodelled one makes us " +
        "UNDER-report outOfScopeGuards",
    );
  }

  for (const action of contentFinished) {
    add(action, "CONTENT_FINISHED", `ACTION_FINISH_CONTENT + ${CONTENT_FINISHED_KEY}`);
  }
  for (const action of lists.ACTION_CHECK_EMPLOYEE_CHECKOUT ?? []) {
    add(action, "EMPLOYEE_CHECKOUT_ALL", `ACTION_CHECK_EMPLOYEE_CHECKOUT + ${CHECKOUT_ALL_KEY}`);
  }
  for (const offset of offsetsOf(update.body, CHECKIN_ACROSS_TICKETS_KEY)) {
    const block = innermostBlock(updateBlocks, offset);
    if (!block)
      throw new Error(`${CHECKIN_ACROSS_TICKETS_KEY} throw at ${offset} sits in no action block`);
    for (const action of block.actions) {
      add(
        action,
        "EMPLOYEE_CHECKIN_ACROSS_TICKETS",
        `updateStatus throw of ${CHECKIN_ACROSS_TICKETS_KEY}`,
      );
    }
  }

  // ---- `changeStatus = false`: attribution is the gate (see the header).
  const noChangeSites = offsetsOf(update.body, "changeStatus = false");
  const noStatusChange = new Set<string>();
  for (const offset of noChangeSites) {
    const block = innermostBlock(updateBlocks, offset);
    if (!block) {
      throw new Error(
        `a \`changeStatus = false\` at offset ${offset} of updateStatus belongs to no ` +
          "`actionCode` condition — the chain was rewritten, re-read it before trusting this table",
      );
    }
    for (const action of block.actions) if (isPct(action)) noStatusChange.add(action);
  }
  if (noChangeSites.length !== EXPECTED_NO_CHANGE_SITES) {
    throw new Error(
      `expected ${EXPECTED_NO_CHANGE_SITES} \`changeStatus = false\` sites, found ${noChangeSites.length}`,
    );
  }

  // ---- surface 2: the pre-check path, which is the one C stands in for.
  const precheck = sliceMethod(
    ticketActionService,
    "async getActionForUserByTicketId(userCode: string, ticketId: number)",
  );
  const precheckBlocks = parseConditionBlocks(precheck.body, resolve_, lists);
  const precheckSites = offsetsOf(precheck.body, "addAction = false");
  if (precheckSites.length !== EXPECTED_PRECHECK_SITES) {
    throw new Error(
      `expected ${EXPECTED_PRECHECK_SITES} \`addAction = false\` sites, found ${precheckSites.length}`,
    );
  }
  for (const offset of precheckSites) {
    const block = innermostBlock(precheckBlocks, offset);
    // Every site attributes to a block today. Kept because "no enclosing action condition" is a
    // real shape — a site could hang off `actionStatusNexts` instead — and skipping it silently is
    // better than naming a guard for the wrong action.
    if (!block) continue;
    // ⚠️ First checker in the block. Where a block calls two (`ticket-action.service.ts:951` calls
    // `checkCRMExisted` then `checkExistedWorkingLCT`) only the first names the guard. Harmless
    // today — no such block carries a PCT action — and gated below so it cannot become harmful in
    // silence.
    const checkers = [
      ...block.text.matchAll(/await this\.(?:[A-Za-z]+\.)?(check[A-Za-z0-9_$]+)\(/g),
    ].map(([, name]) => name);
    // No `check…` call: these are the `getNVCTWorking` comparisons (`:979, :986, :996`), which
    // decide on a returned value rather than on a named predicate. Non-PCT today.
    if (checkers.length === 0) continue;
    if (checkers.length > 1 && block.actions.some(isPct)) {
      throw new Error(
        `a PCT pre-check block calls ${checkers.length} checkers (${checkers.join(", ")}) — ` +
          "naming the guard after the first would describe only half of what EVN checks",
      );
    }
    const guard = guardNameFromChecker(checkers[0]);
    for (const action of block.actions) {
      add(action, guard, `getActionForUserByTicketId -> ${checkers[0]}`);
    }
  }

  return {
    guards: Object.fromEntries(
      Object.entries(guards)
        .map(([action, set]) => [action, [...set].sort()] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
    noStatusChange: [...noStatusChange].sort(),
    provenance,
  };
}

export function assertYield(m: GuardMeasurement): void {
  const countFor = (guard: string): number =>
    Object.values(m.guards).filter((codes) => codes.includes(guard)).length;

  const checks: Array<[string, number, number]> = [
    ["CONTENT_FINISHED", countFor("CONTENT_FINISHED"), EXPECTED_CONTENT_FINISHED],
    ["EMPLOYEE_CHECKOUT_ALL", countFor("EMPLOYEE_CHECKOUT_ALL"), EXPECTED_CHECKOUT_ALL],
    [
      "EMPLOYEE_CHECKIN_ACROSS_TICKETS",
      countFor("EMPLOYEE_CHECKIN_ACROSS_TICKETS"),
      EXPECTED_CHECKIN_ACROSS_TICKETS,
    ],
    ["no-status-change actions", m.noStatusChange.length, EXPECTED_NO_CHANGE_PCT_ACTIONS],
  ];
  for (const [what, got, want] of checks) {
    if (got !== want) throw new Error(`${what}: expected ${want} PCT actions, measured ${got}`);
  }
  // ⚠️ MEMBERSHIP, not just the count. A count of six stays six if one action is swapped for
  // another — which is exactly the failure a wrong block attribution produces, and the reason the
  // header insists attribution is what matters here.
  if (m.noStatusChange.join(",") !== EXPECTED_NO_CHANGE_PCT.join(",")) {
    throw new Error(
      `no-status-change actions changed: expected [${EXPECTED_NO_CHANGE_PCT.join(", ")}], ` +
        `measured [${m.noStatusChange.join(", ")}]`,
    );
  }
  if (Object.keys(m.guards).length === 0) throw new Error("no PCT guards measured at all");
}

// ------------------------------------------------------------------------------------ rendering

export function renderGuardsModule(m: GuardMeasurement, measuredOn: string): string {
  const guardNames = [...new Set(Object.values(m.guards).flat())].sort();
  const constName = (guard: string): string => `EVN_GUARD_${guard}`;

  return `// GENERATED by src/scripts/measure-evn-guards.ts — do not edit by hand.
// Measured on ${measuredOn} from E:\\web\\evn\\core-service/src:
//   modules/ticket/ticket.constant.ts                    (the ACTION_* lists)
//   modules/ticket/service/ticket.service.ts             (updateStatus — the write path)
//   modules/ticket/service/ticket-action.service.ts      (getActionForUserByTicketId — the pre-check)
// ${guardNames.length} guards over ${Object.keys(m.guards).length} PCT actions.

/**
 * What endpoint C does NOT decide, per action.
 *
 * ⚠️ Read this as "conditions C did not evaluate", not "conditions that reject". They are different
 * sets: \`updateStatus\` also has branches that merely suppress the status change without refusing
 * anything (see {@link EVN_NO_STATUS_CHANGE_ACTIONS}), and the pre-check path removes actions from a
 * menu rather than throwing. A caller acts on the same information either way — "you still have to
 * check this yourself" — so the response carries one list.
 *
 * ⚠️ It is long, and that is the measurement rather than a presentation problem. EVN's pre-check
 * (\`getActionForUserByTicketId\`) asks questions no per-ticket request can answer — several reach
 * across OTHER tickets. Making C conclude more means evaluating those guards, not hiding them.
 *
 * ⚠️ Both surfaces are mirrored from EVN's control flow, so an edit on their side drifts us in
 * silence. The drift is deliberately biased safe: a guard we wrongly keep listing costs the caller a
 * redundant check, while one we wrongly drop costs them a missed refusal. (The generator pins the
 * number of \`throw\`s in \`updateStatus\` for that reason — a new refusal is the drift that would
 * cost a missed one.)
 *
 * ⚠️ A guard code is the name of EVN's own checker, and it does NOT encode which way that checker
 * blocks: \`CHTT_IS_WORKING\` blocks when the answer is yes, \`EMPLOYEE_CAN_CHECKIN_BY_SELF\` blocks
 * when it is no. Read a code as "EVN evaluates this", never as "this must be true". The per-code
 * provenance below says which function it came from.
 */
export const EVN_PCT_GUARDS: Readonly<Record<string, readonly string[]>> = {
${Object.entries(m.guards)
  .map(([action, codes]) => `  ${action}: [${codes.map((c) => `"${c}"`).join(", ")}],`)
  .join("\n")}
};

/**
 * PCT actions \`updateStatus\` refuses to change the status for, WHATEVER the transition table says.
 *
 * A second mechanism, independent of the table: \`changeStatus = false\` is set in the action's own
 * branch and gates the only write (\`ticket.service.ts:5191\`). Today the two agree — every row these
 * actions have either omits \`status_code_next\` or restates the status already held — but they agree
 * by coincidence, not by construction, and only one of them is under EVN's data.
 *
 * So this is applied at runtime rather than merely asserted: if their table grows a real next status
 * for one of these, endpoint C must not start promising a transition EVN will not perform.
 * \`check-transition.test.ts\` watches the table for exactly that drift.
 */
export const EVN_NO_STATUS_CHANGE_ACTIONS: readonly string[] = [
${m.noStatusChange.map((action) => `  "${action}",`).join("\n")}
];

/** Guard codes, named so nothing downstream has to spell one as a bare string. */
${guardNames
  .map(
    (guard) => `/** Measured from: ${m.provenance[guard]}. */
export const ${constName(guard)} = "${guard}";`,
  )
  .join("\n")}
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
  const out = arg("--out") ?? resolve(import.meta.dirname, "../modules/external/evn-guards.ts");

  const measurement = measure(resolve(coreServiceSrc));
  assertYield(measurement);
  writeFileSync(out, renderGuardsModule(measurement, new Date().toISOString().slice(0, 10)));

  // Format in the same breath as writing, so "run this script" produces exactly the bytes that are
  // committed. Without it the guard arrays land unwrapped, biome rewraps the long ones on the next
  // `biome check --write`, and the file stops round-tripping — which quietly costs the one property
  // a generated file is worth having: that regenerating it proves nothing was hand-edited.
  execFileSync("pnpm", ["exec", "biome", "check", "--write", out], {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  console.log(
    `Measured ${Object.keys(measurement.guards).length} guarded PCT actions, ` +
      `${measurement.noStatusChange.length} no-status-change actions -> ${out}`,
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
