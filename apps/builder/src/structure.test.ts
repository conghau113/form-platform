import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * R7 guardrail — keeps the refactor's debt from creeping back. Rule #1 of the `feature-module`
 * skill: no top-level feature components in `src/`; every feature is a FOLDER with an `index.ts`
 * barrel. Only the app shell (`App.tsx`) and the entry (`main.tsx`) are grandfathered at the root.
 * A new `src/Whatever.tsx` should live in `src/whatever/` instead — this test fails loudly if one
 * is added, naming the offender.
 */
const srcDir = dirname(fileURLToPath(import.meta.url));
const ALLOWED_ROOT_TSX = new Set(["App.tsx", "main.tsx"]);

describe("builder source structure (R7 guardrail)", () => {
  it("has no stray top-level *.tsx components in src/ — put new features in a folder", () => {
    const stray = readdirSync(srcDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx"))
      .map((e) => e.name)
      .filter((name) => !ALLOWED_ROOT_TSX.has(name));
    expect(stray).toEqual([]);
  });
});
