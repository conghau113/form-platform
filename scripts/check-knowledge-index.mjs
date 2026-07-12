#!/usr/bin/env node
// Knowledge-index freshness gate (framework E6 T6.2.1, advisory-first).
//
// Layer L3 — Execution Adapter. Originates NO rule (constitution §2): it enforces the
// schema knowledge/index.yaml declares about ITSELF (its FIELD SCHEMA header) plus basic
// validity, and surfaces the §13 health signal "oldest freshness contract". The normative
// homes are constitution §10 (freshness contract fields) and §5 (this index is
// descriptive-only). This script re-decides nothing.
//
// Advisory-first (§8): this script exits non-zero on a real structural violation so a
// future task can flip the CI job to blocking by ONE line (dropping continue-on-error).
// Its non-blocking status lives in the CI wiring, not here — the detector must genuinely
// signal, else the "seed one violation, it must be caught" validation (roadmap E6) is moot.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

// Resolve the `yaml` package (a transitive dep — not hoisted to top-level node_modules).
// Prefer a direct resolution; fall back to scanning the pnpm store (portable, no shell).
function loadYaml() {
  try {
    return require("yaml");
  } catch {
    const store = "node_modules/.pnpm";
    const entry = readdirSync(store).find((d) => /^yaml@/.test(d));
    if (!entry) throw new Error("cannot resolve the `yaml` package (run pnpm install)");
    return require(resolve(store, entry, "node_modules/yaml"));
  }
}

const INDEX_PATH = process.argv[2] ?? "knowledge/index.yaml";
const REQUIRED_FIELDS = [
  "id",
  "path",
  "nature",
  "class",
  "owner",
  "verified_on",
  "cadence",
  "scope",
  "method",
];
const ALLOWED_CLASSES = ["E1", "E2"]; // §7 — the index is descriptive; only executed/source-read.

const violations = [];
const fail = (msg) => violations.push(msg);

const YAML = loadYaml();
if (!existsSync(INDEX_PATH)) {
  console.error(`FATAL: ${INDEX_PATH} not found`);
  process.exit(1);
}

let doc;
try {
  doc = YAML.parse(readFileSync(INDEX_PATH, "utf8"));
} catch (e) {
  console.error(`FATAL: ${INDEX_PATH} does not parse as YAML — ${e.message}`);
  process.exit(1);
}

// ── Top-level shape ──────────────────────────────────────────────────────────
for (const key of ["framework_version", "schema_version", "artifacts"]) {
  if (doc[key] === undefined) fail(`top-level: missing '${key}'`);
}
if (!Array.isArray(doc.artifacts) || doc.artifacts.length === 0) {
  fail(`top-level: 'artifacts' must be a non-empty list`);
}

// ── Per-artifact contract (the index's own declared FIELD SCHEMA) ────────────
const today = new Date();
today.setHours(0, 0, 0, 0);
const seenIds = new Set();
let oldest = null; // { id, date, days } — the §13 health signal

for (const a of doc.artifacts ?? []) {
  const label = a?.id ?? a?.path ?? "<unnamed>";

  for (const f of REQUIRED_FIELDS) {
    if (a?.[f] === undefined || a[f] === null || a[f] === "")
      fail(`${label}: missing field '${f}'`);
  }
  if (a?.id) {
    if (seenIds.has(a.id)) fail(`${label}: duplicate id '${a.id}'`);
    seenIds.add(a.id);
  }
  if (a?.nature !== undefined && a.nature !== "descriptive") {
    fail(`${label}: nature is '${a.nature}' — this index is descriptive-only (§5)`);
  }
  if (a?.class !== undefined && !ALLOWED_CLASSES.includes(a.class)) {
    fail(`${label}: class '${a.class}' not in ${ALLOWED_CLASSES.join("/")} (§7)`);
  }
  if (a?.path !== undefined && !existsSync(a.path)) {
    fail(`${label}: path does not exist on disk — '${a.path}'`);
  }
  if (a?.scope !== undefined && (!Array.isArray(a.scope) || a.scope.length === 0)) {
    fail(`${label}: 'scope' must be a non-empty list`);
  }
  if (a?.verified_on !== undefined) {
    const raw = String(a.verified_on);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN); // local midnight — TZ-safe
    if (!m || Number.isNaN(d.getTime())) {
      fail(`${label}: verified_on '${raw}' is not a YYYY-MM-DD date`);
    } else if (d > today) {
      fail(`${label}: verified_on '${raw}' is in the future`);
    } else {
      const days = Math.floor((today - d) / 86_400_000);
      if (!oldest || days > oldest.days) oldest = { id: label, date: raw, days };
    }
  }
}

// ── unregistered_by_design: keep the audit trail honest ──────────────────────
for (const u of doc.unregistered_by_design ?? []) {
  if (!u?.path) fail(`unregistered_by_design: an entry is missing 'path'`);
  if (!u?.reason) fail(`unregistered_by_design[${u?.path ?? "?"}]: missing 'reason'`);
}

// ── Report ───────────────────────────────────────────────────────────────────
const n = doc.artifacts?.length ?? 0;
console.log(`knowledge/index.yaml — ${n} descriptive artifact(s) checked.`);
if (oldest) {
  // §13 health signal — informational, never a failure (cadence is prose, not a machine interval).
  console.log(
    `health signal — oldest freshness contract: ${oldest.id} @ ${oldest.date} (${oldest.days} days old).`,
  );
}

if (violations.length > 0) {
  console.error(`\nFAIL — ${violations.length} structural violation(s):`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log("PASS — index structure + freshness metadata are well-formed.");
