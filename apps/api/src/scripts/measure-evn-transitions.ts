import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Regenerate `modules/external/evn-transitions.ts` by MEASURING EVN's own source (P4a).
 *
 * The table endpoint C answers from is `ticket.action_role_status`. It is a DERIVED table: one
 * method, `initActionRoleStatus()` (`modules/ticket/service/ticket-action.service.ts:230`), calls
 * `clear()` and then rebuilds the whole thing from constants in the same repo. So the table can be
 * reconstructed without an export from EVN — which is what this script does.
 *
 * ⚠️ It has TWO sources and both are load-bearing:
 *  1. `ROLE_STATUS_ACTION_PCT` — a declared 34-row constant, the flow proper.
 *  2. The loop at `ticket-action.service.ts:245-471` — 273 MORE rows, generated from
 *     `STATUS_TICKETS_PCT` crossed with five action lists. That is 89% of the real table, and it is
 *     where `PCT_A_HALT` and `PCT_A_POSTPONE` live, both of which change status for real.
 * A table built from (1) alone answers "I don't know" to nine calls out of ten.
 *
 * ⚠️ Enum MEMBERS are not enum VALUES. `codeRoleEnum.rNa` is `"R_NA"`, not `"R_N/A"`, and 51 of the
 * 132 `codeStatusEnum` members carry a value that differs from their name. Everything emitted here
 * goes through {@link buildResolver}; nothing is a hand-typed code string.
 *
 * ⚠️ Which branches of that loop are "the PCT ones" is decided BY THE POSITION OF THE `save()` CALL,
 * never by a code prefix. Two tempting filters are both wrong: `roleCode.startsWith("PCT_R_")` drops
 * the 122 rows carrying the wildcard role, and `actionCode.startsWith("PCT_A_")` drops 98 rows
 * including all 16 of `LCT_A_HISTORY` — which is a PCT row, because `ROLE_STATUS_ACTION_WEB_PCT`
 * itself lists it (`shared/common/constant/ticket.constant.ts:2491`). What IS excluded is the pair
 * of LCT branches that sit inside the PCT status loop by what looks like copy-paste
 * (`:377-406`, `:452-470`, 80 rows) — see {@link buildLoopRows}.
 *
 * The source lives OUTSIDE this repo, so this cannot run in CI. That is exactly why every count is
 * pinned in an `EXPECTED_*` constant and a mismatch throws instead of quietly shrinking the table.
 *
 * Usage:
 *   tsx src/scripts/measure-evn-transitions.ts
 *     [--core-service <dir>]  default $EVN_CORE_SERVICE_SRC
 *     [--out <file>]          default src/modules/external/evn-transitions.ts
 */

/** Rows declared in `ROLE_STATUS_ACTION_PCT`. */
const EXPECTED_FLOW_ROWS = 34;
/** Rows the PCT branch of `initActionRoleStatus` generates. */
const EXPECTED_LOOP_ROWS = 273;
/** Entries in `STATUS_TICKETS_PCT`, the loop's outer dimension. */
const EXPECTED_PCT_STATUSES = 16;
/** PCT entries in `ACTION_CHECK_ROLE_PCT` (the array also carries one LCT entry). */
const EXPECTED_TIE_BREAKS = 3;
/**
 * `(role, status, action)` keys that appear twice with a different `statusCodeNext`.
 *
 * This gate is doing more work than it looks. EVN breaks the tie by `actionCode` alone
 * (`modules/ticket/service/ticket.service.ts:5199-5224`) while we break it by "this key has two rows", and
 * those two rules agree ONLY because each tie-break action occurs at exactly one status today. Add a
 * row for one of them at a second status upstream and the two rules diverge — this count moves first.
 */
const EXPECTED_AMBIGUOUS_KEYS = 3;

const ROLE_ENUM = "codeRoleEnum";
const STATUS_ENUM = "codeStatusEnum";
const ACTION_ENUM = "codeActionEnum";

export interface EvnTransitionRow {
  roleCode: string;
  statusCode: string;
  actionCode: string;
  /** Absent means the column default applies, i.e. `S_N/A`. Kept absent rather than filled in. */
  statusCodeNext?: string;
  source: "flow" | "loop";
}

export interface EvnTieBreak {
  actionCode: string;
  requiresTicketRole: string;
  yes: string;
  no: string;
}

export interface TransitionMeasurement {
  rows: EvnTransitionRow[];
  tieBreaks: EvnTieBreak[];
  roleWildcard: string;
  statusNa: string;
  statusSync: string;
  pctStatuses: string[];
}

/** Drop `//` lines before parsing: one row of `ROLE_STATUS_ACTION_PCT` is commented out. */
function stripLineComments(block: string): string {
  return block
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
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
 * Turn `codeRoleEnum.rNa` into `"R_NA"`.
 *
 * Reading a member name as if it were the code is the single mistake this whole file exists to avoid
 * — see the header — so an unknown member throws rather than falling back to the name.
 */
function buildResolver(enums: Record<string, Record<string, string>>): Resolve {
  return (enumName, member) => {
    const value = enums[enumName]?.[member];
    if (value === undefined) throw new Error(`${enumName}.${member} has no value in source`);
    return value;
  };
}

/** Source 1: the 34 declared rows. A row without `statusCodeNext` stays without one. */
export function parseFlowRows(constantsSrc: string, resolve_: Resolve): EvnTransitionRow[] {
  const block = stripLineComments(sliceConst(constantsSrc, "ROLE_STATUS_ACTION_PCT"));
  return [...(block.match(/\{[^{}]*\}/g) ?? [])].map((object) => {
    const fields: Record<string, string> = {};
    const pattern = new RegExp(
      `(\\w+):\\s*(${ROLE_ENUM}|${STATUS_ENUM}|${ACTION_ENUM})\\.(\\w+)`,
      "g",
    );
    for (const [, key, enumName, member] of object.matchAll(pattern)) {
      fields[key] = resolve_(enumName, member);
    }
    const { roleCode, statusCode, actionCode, statusCodeNext } = fields;
    if (!roleCode || !statusCode || !actionCode) {
      throw new Error(`ROLE_STATUS_ACTION_PCT row missing a key column: ${object}`);
    }
    return {
      roleCode,
      statusCode,
      actionCode,
      ...(statusCodeNext ? { statusCodeNext } : {}),
      source: "flow",
    };
  });
}

/** Action codes listed in one `export const NAME = [codeActionEnum.X, …]`. */
function parseActionList(constantsSrc: string, name: string, resolve_: Resolve): string[] {
  const block = stripLineComments(sliceConst(constantsSrc, name));
  const codes = [...block.matchAll(new RegExp(`${ACTION_ENUM}\\.([A-Za-z0-9_$]+)`, "g"))].map(
    ([, member]) => resolve_(ACTION_ENUM, member),
  );
  if (codes.length === 0) throw new Error(`${name} parsed empty`);
  return codes;
}

/** Status codes of `STATUS_TICKETS_PCT`, in declaration order — the loop's outer dimension. */
function parsePctStatuses(constantsSrc: string, resolve_: Resolve): string[] {
  const block = stripLineComments(sliceConst(constantsSrc, "STATUS_TICKETS_PCT"));
  return [...block.matchAll(new RegExp(`code:\\s*${STATUS_ENUM}\\.([A-Za-z0-9_$]+)`, "g"))].map(
    ([, member]) => resolve_(STATUS_ENUM, member),
  );
}

/** Source 3: how EVN resolves the three keys that carry two rows. */
export function parseTieBreaks(ticketConstantsSrc: string, resolve_: Resolve): EvnTieBreak[] {
  const block = stripLineComments(sliceConst(ticketConstantsSrc, "ACTION_CHECK_ROLE_PCT"));
  const entries: EvnTieBreak[] = [];
  for (const object of block.match(/\{[^{}]*\}/g) ?? []) {
    const fields: Record<string, string> = {};
    const pattern = new RegExp(
      `(\\w+):\\s*(${ROLE_ENUM}|${STATUS_ENUM}|${ACTION_ENUM})\\.(\\w+)`,
      "g",
    );
    for (const [, key, enumName, member] of object.matchAll(pattern)) {
      fields[key] = resolve_(enumName, member);
    }
    const { action, roleCode, YES, NO } = fields;
    if (!action || !roleCode || !YES || !NO) continue;
    // The array serves several ticket types; endpoint C only answers for PCT.
    if (!action.startsWith("PCT_A_")) continue;
    entries.push({ actionCode: action, requiresTicketRole: roleCode, yes: YES, no: NO });
  }
  return entries;
}

/**
 * Source 2: a mirror of the PCT branch of `initActionRoleStatus` (`ticket-action.service.ts:245-471`).
 *
 * This is EVN's control flow, re-expressed. That is a real liability — if they edit the loop we drift
 * silently — and it is accepted deliberately, because the alternative is answering "unknown" to 89%
 * of the table. `EXPECTED_LOOP_ROWS` is the tripwire, and every emitted row is labelled
 * `source: "loop"` so the endpoint can say how it knows.
 *
 * The action lists and the status list are parsed out of source. The exclusion lists below are part
 * of the control flow being mirrored, so they are written here as enum MEMBER names next to the line
 * they come from, and resolved to values like everything else — no code string is typed by hand.
 */
export function buildLoopRows(
  statuses: readonly string[],
  lists: {
    web: readonly string[];
    chttNotFlow: readonly string[];
    chttFlow: readonly string[];
    ncp: readonly string[];
    nhanVien: readonly string[];
  },
  resolve_: Resolve,
): EvnTransitionRow[] {
  const status = (member: string): string => resolve_(STATUS_ENUM, member);
  const action = (member: string): string => resolve_(ACTION_ENUM, member);
  const role = (member: string): string => resolve_(ROLE_ENUM, member);

  const rows: EvnTransitionRow[] = [];
  const add = (
    roleCode: string,
    statusCode: string,
    actionCode: string,
    statusCodeNext?: string,
  ): void => {
    rows.push({
      roleCode,
      statusCode,
      actionCode,
      ...(statusCodeNext ? { statusCodeNext } : {}),
      source: "loop",
    });
  };

  // `:249-258` — the sync action is skipped in the four terminal-ish states.
  const noSync = ["PCT_S_DRAFT", "PCT_S_CANCEL", "PCT_S_POSTPONE", "PCT_S_FINISHED"].map(status);
  // `:270-271` — in DRAFT the web actions are narrowed to the two history ones, not excluded.
  const draftOnly = ["PCT_S_DRAFT", "LCT_S_DRAFT"].map(status);
  const draftAllowed = ["PCT_A_HISTORY", "LCT_A_HISTORY"].map(action);
  // `:288-302` — device get/return, and `:318-334` adds MODERATION and WORKING on top of the same set.
  const noDevice = [
    "PCT_S_DRAFT",
    "PCT_S_CANCEL",
    "PCT_S_POSTPONE",
    "PCT_S_HALT",
    "PCT_S_FINISHED",
    "PCT_S_END",
    "PCT_S_END_WAITING",
    "PCT_S_WAITING_LOCKED",
    "PCT_S_LOCKED",
  ].map(status);
  const noChttNotFlow = [...noDevice, status("PCT_S_MODERATION"), status("PCT_S_WORKING")];
  // `:346-356` — halt/postpone stay available everywhere except the four terminal-ish states.
  // ⚠️ That block lists FIVE statuses in source; `PCT_S_MODERATION` at `:353` is commented out
  // ("được DỪNG sau khi điều phối"), so the live exclusion set is the same four as `noSync`. Anyone
  // diffing against the source will count five and think the mirror dropped one.
  const noChttFlow = noSync;
  // `:410-420` — the allower's actions, blocked before dispatch as well.
  const noNcp = [...noSync, status("PCT_S_MODERATION")];
  // `:432-443` — the worker's actions additionally require the ticket to be past CREATED.
  const noNhanVien = [...noNcp, status("PCT_S_CREATED")];

  for (const statusCode of statuses) {
    if (!noSync.includes(statusCode)) {
      add(role("PCT_R_CHTT"), statusCode, action("SYNCHRONIZE"), status("sSynchronize"));
    }

    for (const actionCode of lists.web) {
      if (draftOnly.includes(statusCode)) {
        if (draftAllowed.includes(actionCode)) add(role("rNa"), statusCode, actionCode);
      } else {
        add(role("rNa"), statusCode, actionCode);
      }
    }

    if (!noDevice.includes(statusCode)) {
      add(role("PCT_R_CHTT"), statusCode, action("GET_DEVICE"));
      add(role("PCT_R_CHTT"), statusCode, action("RETURN_DEVICE"));
    }

    for (const actionCode of lists.chttNotFlow) {
      if (!noChttNotFlow.includes(statusCode)) add(role("PCT_R_CHTT"), statusCode, actionCode);
    }

    for (const actionCode of lists.chttFlow) {
      if (noChttFlow.includes(statusCode)) continue;
      if (actionCode === action("PCT_A_HALT")) {
        // Halting the already-halted is the one self-transition the loop refuses to write.
        if (statusCode !== status("PCT_S_HALT")) {
          add(role("PCT_R_CHTT"), statusCode, actionCode, status("PCT_S_HALT"));
        }
      } else if (actionCode === action("PCT_A_POSTPONE")) {
        add(role("PCT_R_CHTT"), statusCode, actionCode, status("PCT_S_POSTPONE"));
      }
    }

    // `:377-406` and `:452-470` sit here, iterating PCT statuses against LCT exclusion lists, and so
    // write 80 `LCT_R_*` rows keyed by PCT statuses. Reported to EVN as a suspected copy-paste; not
    // mirrored, because endpoint C answers about PCT tickets.

    for (const actionCode of lists.ncp) {
      if (!noNcp.includes(statusCode)) add(role("PCT_R_CHO_PHEP"), statusCode, actionCode);
    }

    for (const actionCode of lists.nhanVien) {
      if (!noNhanVien.includes(statusCode)) add(role("PCT_R_NHAN_VIEN"), statusCode, actionCode);
    }
  }
  return rows;
}

const keyOf = (row: EvnTransitionRow): string =>
  `${row.roleCode}|${row.statusCode}|${row.actionCode}`;

/** Every count that would let a bad measurement pass as a small one. */
export function assertYield(m: TransitionMeasurement): void {
  const flow = m.rows.filter((row) => row.source === "flow");
  const loop = m.rows.filter((row) => row.source === "loop");
  if (flow.length !== EXPECTED_FLOW_ROWS) {
    throw new Error(`Flow rows: ${flow.length}, expected ${EXPECTED_FLOW_ROWS}.`);
  }
  if (loop.length !== EXPECTED_LOOP_ROWS) {
    throw new Error(
      `Loop rows: ${loop.length}, expected ${EXPECTED_LOOP_ROWS}. A branch of ` +
        "`initActionRoleStatus` moved — mirror the change, do not lower this number.",
    );
  }
  if (m.pctStatuses.length !== EXPECTED_PCT_STATUSES) {
    throw new Error(
      `STATUS_TICKETS_PCT: ${m.pctStatuses.length}, expected ${EXPECTED_PCT_STATUSES}.`,
    );
  }
  if (m.tieBreaks.length !== EXPECTED_TIE_BREAKS) {
    throw new Error(`Tie-breaks: ${m.tieBreaks.length}, expected ${EXPECTED_TIE_BREAKS}.`);
  }
  if (m.roleWildcard !== "R_NA" || m.statusNa !== "S_N/A" || m.statusSync !== "S_SYNC") {
    throw new Error(
      `Sentinels moved: role=${m.roleWildcard} na=${m.statusNa} sync=${m.statusSync}. ` +
        "Every lookup keys off these.",
    );
  }

  // The 4-column primary key is what lets two rows share a 3-column key legitimately; a collision on
  // all four means the mirror emitted the same row twice.
  const pk = new Set(m.rows.map((row) => `${keyOf(row)}|${row.statusCodeNext ?? m.statusNa}`));
  if (pk.size !== m.rows.length) {
    throw new Error(`${m.rows.length - pk.size} duplicate rows on the 4-column key.`);
  }

  const byKey = new Map<string, EvnTransitionRow[]>();
  for (const row of m.rows) byKey.set(keyOf(row), [...(byKey.get(keyOf(row)) ?? []), row]);
  const ambiguous = [...byKey.values()].filter((rows) => rows.length > 1);
  if (ambiguous.length !== EXPECTED_AMBIGUOUS_KEYS) {
    // Moving an existing ambiguous key onto a second role trips this before the role check below,
    // which reports a count rather than the cause. Read both together.
    throw new Error(`Ambiguous keys: ${ambiguous.length}, expected ${EXPECTED_AMBIGUOUS_KEYS}.`);
  }

  // Each ambiguous key must have a tie-break and vice versa: an ambiguity we cannot resolve would be
  // answered by guessing, and a tie-break with nothing to resolve means we mis-parsed one of them.
  const tieBreakActions = new Set(m.tieBreaks.map((entry) => entry.actionCode));
  const ambiguousActions = new Set(ambiguous.map((rows) => rows[0]?.actionCode));
  for (const actionCode of ambiguousActions) {
    if (!tieBreakActions.has(actionCode ?? ""))
      throw new Error(`No tie-break for ambiguous ${actionCode}.`);
  }
  for (const actionCode of tieBreakActions) {
    if (!ambiguousActions.has(actionCode))
      throw new Error(`Tie-break ${actionCode} resolves nothing.`);
  }

  // The lookup groups by `(status, action)` and ignores the role when it was not told one, while the
  // gate above groups by all three. They agree only while no `(status, action)` spans two roles — and
  // nothing else here would notice if that changed: the ambiguous count would still read 3 and the
  // lookup would silently start answering `ambiguous` where it used to resolve.
  const rolesPerKey = new Map<string, Set<string>>();
  for (const row of m.rows) {
    const key = `${row.statusCode}|${row.actionCode}`;
    rolesPerKey.set(key, (rolesPerKey.get(key) ?? new Set()).add(row.roleCode));
  }
  for (const [key, roles] of rolesPerKey) {
    if (roles.size > 1) {
      throw new Error(
        `${key} now spans ${roles.size} roles. \`lookupTransition\` groups by (status, action), so ` +
          "it must learn to keep them apart before this table ships.",
      );
    }
  }

  // See EXPECTED_AMBIGUOUS_KEYS: our "two rows" rule and their "by action code" rule only agree while
  // each tie-break action lives at a single status.
  for (const actionCode of tieBreakActions) {
    const statuses = new Set(
      m.rows.filter((row) => row.actionCode === actionCode).map((row) => row.statusCode),
    );
    if (statuses.size !== 1) {
      throw new Error(
        `${actionCode} now appears at ${statuses.size} statuses. EVN breaks this tie by action code ` +
          "alone, so the lookup must be rewritten to match — see EXPECTED_AMBIGUOUS_KEYS.",
      );
    }
  }

  // Every tie-break outcome must be one of the two rows it chooses between.
  for (const entry of m.tieBreaks) {
    const nexts = new Set(
      m.rows.filter((row) => row.actionCode === entry.actionCode).map((row) => row.statusCodeNext),
    );
    if (!nexts.has(entry.yes) || !nexts.has(entry.no)) {
      throw new Error(`Tie-break ${entry.actionCode} points at a status no row carries.`);
    }
  }
}

export function measure(coreServiceSrc: string): TransitionMeasurement {
  const enums = {
    [ROLE_ENUM]: extractEnum(join(coreServiceSrc, "shared/common/enum/ticket.enum.ts"), ROLE_ENUM),
    [STATUS_ENUM]: extractEnum(
      join(coreServiceSrc, "shared/common/enum/ticket.enum.ts"),
      STATUS_ENUM,
    ),
    [ACTION_ENUM]: extractEnum(
      join(coreServiceSrc, "shared/common/enum/ticket.enum.ts"),
      ACTION_ENUM,
    ),
  };
  const resolve_ = buildResolver(enums);
  const constants = readFileSync(
    join(coreServiceSrc, "shared/common/constant/ticket.constant.ts"),
    "utf8",
  );
  const ticketConstants = readFileSync(
    join(coreServiceSrc, "modules/ticket/ticket.constant.ts"),
    "utf8",
  );

  const pctStatuses = parsePctStatuses(constants, resolve_);
  const loop = buildLoopRows(
    pctStatuses,
    {
      web: parseActionList(constants, "ROLE_STATUS_ACTION_WEB_PCT", resolve_),
      chttNotFlow: parseActionList(constants, "ROLE_STATUS_ACTION_PCT_CHTT_NOT_FLOW", resolve_),
      chttFlow: parseActionList(constants, "ROLE_STATUS_ACTION_PCT_CHTT_FLOW", resolve_),
      ncp: parseActionList(constants, "ROLE_STATUS_ACTION_PCT_NCP", resolve_),
      nhanVien: parseActionList(constants, "ROLE_STATUS_ACTION_PCT_NHAN_VIEN", resolve_),
    },
    resolve_,
  );

  return {
    rows: [...parseFlowRows(constants, resolve_), ...loop],
    tieBreaks: parseTieBreaks(ticketConstants, resolve_),
    roleWildcard: resolve_(ROLE_ENUM, "rNa"),
    statusNa: resolve_(STATUS_ENUM, "sNa"),
    statusSync: resolve_(STATUS_ENUM, "sSynchronize"),
    pctStatuses,
  };
}

/**
 * One row per object literal, always expanded across lines.
 *
 * Deliberately not one row per line: the longer rows exceed Biome's 100-column limit, and Biome then
 * splits exactly those and leaves the short ones alone. Emitting the split form ourselves would mean
 * re-implementing its wrapping rule to keep the file byte-stable, whereas an object that arrives
 * already expanded is left expanded regardless of length.
 */
function renderRow(row: EvnTransitionRow): string {
  const next = row.statusCodeNext ? `\n    statusCodeNext: "${row.statusCodeNext}",` : "";
  return `  {
    roleCode: "${row.roleCode}",
    statusCode: "${row.statusCode}",
    actionCode: "${row.actionCode}",${next}
    source: "${row.source}",
  },`;
}

export function renderTransitionsModule(m: TransitionMeasurement, measuredOn: string): string {
  const flow = m.rows.filter((row) => row.source === "flow").length;
  const loop = m.rows.length - flow;
  return `// GENERATED by src/scripts/measure-evn-transitions.ts — do not edit by hand.
// Measured on ${measuredOn} from E:\\web\\evn\\core-service/src:
//   shared/common/constant/ticket.constant.ts   (ROLE_STATUS_ACTION_PCT, STATUS_TICKETS_PCT, the action lists)
//   modules/ticket/service/ticket-action.service.ts:245-471  (the loop that generates the rest)
//   modules/ticket/ticket.constant.ts           (ACTION_CHECK_ROLE_PCT)
//   shared/common/enum/ticket.enum.ts           (member -> value; they differ, see below)
// ${m.rows.length} rows: ${flow} declared + ${loop} generated. \`transition-table.test.ts\` anchors what matters.

/**
 * The wildcard role: a row carrying it applies to every executor.
 *
 * ⚠️ \`"R_NA"\`, NOT \`"R_N/A"\`. \`codeRoleEnum.rNa\` is one of the members whose value differs from
 * its name, and the status sentinel next to it — \`sNa\` — really is \`"S_N/A"\`, which is exactly how
 * the wrong one ends up copied here. 124 of the ${m.rows.length} rows below depend on this string.
 */
export const EVN_ROLE_WILDCARD = "${m.roleWildcard}";

/** The \`status_code_next\` column default, meaning the action leaves the status alone. */
export const EVN_STATUS_NA = "${m.statusNa}";

/**
 * Where \`SYNCHRONIZE\` sends a ticket.
 *
 * Exported because it is NOT one of the 16 \`STATUS_TICKETS_PCT\` statuses — it lives in the
 * cross-type \`STATUS_TICKETS\` table — so a caller presenting it as a PCT status is saying something
 * their own catalog cannot describe. Recognising it should not mean matching a bare string.
 */
export const EVN_STATUS_SYNC = "${m.statusSync}";

/** One row of \`ticket.action_role_status\`, restricted to PCT. */
export interface EvnTransitionRow {
  roleCode: string;
  statusCode: string;
  actionCode: string;
  /** Absent = the column default \`S_N/A\` applies. Left absent so the two cases stay distinguishable. */
  statusCodeNext?: string;
  /** Which source it came from — see the note on {@link EVN_PCT_TRANSITIONS}. */
  source: "flow" | "loop";
}

/**
 * EVN's PCT transition table, reconstructed from their source.
 *
 * ⚠️ BOTH sources are load-bearing; do not "simplify" this to the declared constant:
 *  1. \`ROLE_STATUS_ACTION_PCT\` — ${flow} declared rows, the flow proper.
 *  2. The loop at \`ticket-action.service.ts:245-471\` — ${loop} rows, 89% of the table, and the only
 *     place \`PCT_A_HALT\` -> \`PCT_S_HALT\` and \`PCT_A_POSTPONE\` -> \`PCT_S_POSTPONE\` exist.
 * With (1) alone the endpoint answers "I don't know" to nine calls in ten.
 *
 * ⚠️ \`source\` is not decoration. A \`"loop"\` row was inferred from their CODE rather than read from
 * a declared constant, so it drifts more easily if they edit the loop; the endpoint uses this to say
 * how it knows what it knows.
 *
 * ⚠️ This is a lower AND an upper bound on the live table:
 *  - lower: rows switched off with \`active = false\` after seeding are invisible to us;
 *  - upper: \`initActionRoleStatus\` wraps the whole seed in \`try { … } catch (error) { return error }\`
 *    (\`ticket-action.service.ts:231,758-760\`) under \`@Transactional()\`, so one failing \`save()\`
 *    commits a half-built table and swallows the error.
 *
 * ⚠️ Which loop branches count as PCT is decided by where the \`save()\` call sits, never by a code
 * prefix — \`LCT_A_HISTORY\` rows are PCT rows because \`ROLE_STATUS_ACTION_WEB_PCT\` lists that action.
 */
export const EVN_PCT_TRANSITIONS: readonly EvnTransitionRow[] = [
${m.rows.map(renderRow).join("\n")}
];

/** How EVN resolves a \`(role, status, action)\` key that carries two different next statuses. */
export interface EvnTieBreak {
  actionCode: string;
  /**
   * The role that must be assigned somewhere ON THE TICKET.
   *
   * ⚠️ A different question from {@link EvnTransitionRow.roleCode}, which is the role of the person
   * ACTING. \`checkRoleCodeExistInTicket\` (\`ticket-action.service.ts:1659\`) asks only whether any
   * row for this role exists on the ticket — and, unlike its neighbour \`getRoleValueTicket\`, it does
   * not filter on \`active\`.
   */
  requiresTicketRole: string;
  /** Next status when the ticket does carry that role. */
  yes: string;
  /** Next status when it does not. */
  no: string;
}

/**
 * ⚠️ EVN applies these by \`actionCode\` alone (\`modules/ticket/service/ticket.service.ts:5199-5224\`), while
 * we apply them when a key has two rows. Those agree only because each action below occurs at exactly
 * one status; the generator asserts that, and it is the assertion that keeps the two rules in step.
 */
export const EVN_PCT_TIE_BREAKS: readonly EvnTieBreak[] = [
${m.tieBreaks
  .map(
    (entry) =>
      `  {
    actionCode: "${entry.actionCode}",
    requiresTicketRole: "${entry.requiresTicketRole}",
    yes: "${entry.yes}",
    no: "${entry.no}",
  },`,
  )
  .join("\n")}
];
`;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  // Guard against `--core-service --out x` swallowing the next flag as a value.
  return value && !value.startsWith("--") ? value : undefined;
}

function main(): void {
  const coreServiceSrc = arg("--core-service") ?? process.env.EVN_CORE_SERVICE_SRC;
  if (!coreServiceSrc) {
    throw new Error("Need --core-service <core-service/src dir> (or EVN_CORE_SERVICE_SRC).");
  }
  const out =
    arg("--out") ?? resolve(import.meta.dirname, "../modules/external/evn-transitions.ts");

  const measurement = measure(resolve(coreServiceSrc));
  assertYield(measurement);
  writeFileSync(out, renderTransitionsModule(measurement, new Date().toISOString().slice(0, 10)));

  const loop = measurement.rows.filter((row) => row.source === "loop").length;
  console.log(
    `Measured ${measurement.rows.length - loop} declared + ${loop} generated rows, ` +
      `${measurement.tieBreaks.length} tie-breaks -> ${out}`,
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
