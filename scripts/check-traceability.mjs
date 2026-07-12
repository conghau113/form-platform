#!/usr/bin/env node
// Traceability / link gate (framework E6 T6.2.2, advisory-first).
//
// Layer L3 — Execution Adapter. Originates NO rule (constitution §2): it ENFORCES an
// existing constitutional guarantee — §12 guarantee 3 "every L3 binding names its L1/L2
// source; regeneration keeps the trace" — and surfaces the §13 health signal "traceability
// coverage of L3 bindings". It re-decides nothing.
//
// Two dimensions:
//   1. PRESENCE  — every L3 binding carries its source pointer (agents/skills: `Source:`;
//      `.cursor/rules`: `Authority:`). A binding with no named source = a broken trace.
//   2. LINK INTEGRITY — every RELATIVE markdown link `](path)` inside the governed-artifact
//      surface (the L3 bindings + governance/ + knowledge/) resolves to a file on disk.
//      Only markdown links are resolved — backtick prose pointers (e.g. `AGENTS.md`,
//      `governance/`) are intentionally NOT resolved (ambiguous globs → false positives);
//      their presence is covered by dimension 1.
//
// Advisory-first (§8): exits non-zero on a real violation so a future task can flip the CI
// job to blocking by ONE line (dropping continue-on-error). Non-blocking status lives in the
// CI wiring, not here — the detector must genuinely signal for the seed-validation to mean
// anything.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

const violations = [];
const fail = (msg) => violations.push(msg);

// ── The L3 binding population + their required source-pointer marker ──────────
function listFiles(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, filter, out);
    else if (filter(p)) out.push(p.split(sep).join(posix.sep));
  }
  return out;
}

const agents = listFiles(".claude/agents", (p) => p.endsWith(".md"));
const skills = listFiles(".claude/skills", (p) => p.endsWith("SKILL.md"));
const cursorRules = listFiles(".cursor/rules", (p) => p.endsWith(".mdc"));

const bindings = [
  ...[...agents, ...skills].map((path) => ({ path, marker: /(^|\n)>?\s*\**Source:/ })),
  ...cursorRules.map((path) => ({ path, marker: /Authority/i })),
];

// ── Dimension 1: source-pointer PRESENCE (§12 guarantee 3) ───────────────────
let covered = 0;
for (const b of bindings) {
  const text = readFileSync(b.path, "utf8");
  if (b.marker.test(text)) covered += 1;
  else fail(`${b.path}: L3 binding names no source pointer (expected ${b.marker})`);
}

// ── Dimension 2: relative-markdown-link INTEGRITY ────────────────────────────
// Sweep the governed-artifact surface: the L3 bindings + all markdown under governance/
// and knowledge/. A broken relative link is drift (constitution §10).
const linkFiles = [
  ...bindings.map((b) => b.path),
  ...listFiles("governance", (p) => p.endsWith(".md")),
  ...listFiles("knowledge", (p) => p.endsWith(".md")),
];

const LINK = /\]\(([^)]+)\)/g; // markdown link target
let linksChecked = 0;
for (const file of [...new Set(linkFiles)]) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(LINK)) {
    let target = m[1].trim();
    // Skip external, mailto, in-page anchors, and empty targets.
    if (/^(https?:|mailto:|#|<)/.test(target) || target === "") continue;
    target = target.split("#")[0].split("?")[0].trim(); // drop anchor / query
    if (target === "") continue; // was a pure #anchor
    linksChecked += 1;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      fail(
        `${file}: broken relative link -> ${m[1].trim()}  (resolves to ${relative(".", resolved).split(sep).join(posix.sep)})`,
      );
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(
  `traceability — ${bindings.length} L3 binding(s), ${linksChecked} relative link(s) checked across ${new Set(linkFiles).size} governed file(s).`,
);
// §13 health signal — informational.
console.log(
  `health signal — L3 traceability coverage: ${covered}/${bindings.length} bindings name a source.`,
);

if (violations.length > 0) {
  console.error(`\nFAIL — ${violations.length} traceability violation(s):`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log("PASS — every L3 binding names a source; every governed relative link resolves.");
