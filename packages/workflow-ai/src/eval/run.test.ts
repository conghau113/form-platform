import type { AiProvider } from "@org/ai-core";
import { describe, expect, it } from "vitest";
import { normalizeWorkflowDraft } from "../normalize.js";
import { GOLDEN_WORKFLOWS } from "./golden.js";
import {
  fixtureProvider,
  formatWorkflowEvalReport,
  providerFromEnv,
  runWorkflowEval,
} from "./run.js";

describe("workflow golden set self-consistency", () => {
  it("has unique case ids", () => {
    const ids = GOLDEN_WORKFLOWS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every reference draft is a contract- AND graph-valid workflow", () => {
    for (const c of GOLDEN_WORKFLOWS) {
      const n = normalizeWorkflowDraft(c.referenceDraft);
      expect(n.ok, `${c.id}: ${n.ok ? "" : n.errors.join("; ")}`).toBe(true);
    }
  });
});

describe("runWorkflowEval (fixture provider)", () => {
  it("achieves a 100% graph-valid-rate and full pass on the reference answers", async () => {
    const run = await runWorkflowEval(fixtureProvider());
    // The fixture replays each case's own reference answer, so the golden set is
    // self-achievable: parse-rate (= graph-valid-rate) must be 1 and every
    // expectation must be met.
    expect(run.summary.parseRate).toBe(1);
    expect(run.summary.passRate).toBe(1);
    expect(run.summary.parseRate).toBeGreaterThanOrEqual(0.95); // the acceptance bar
    const weak = run.scores.filter((s) => !s.pass);
    expect(weak, `unmet: ${weak.map((s) => s.id).join(", ")}`).toHaveLength(0);
  });

  it("runs the real pipeline (each case takes exactly one model call)", async () => {
    const run = await runWorkflowEval(fixtureProvider());
    expect(run.summary.avgAttempts).toBe(1);
    expect(run.scores).toHaveLength(GOLDEN_WORKFLOWS.length);
  });

  it("scores an unknown prompt as a graph-valid failure", async () => {
    const run = await runWorkflowEval(fixtureProvider([]), {
      cases: [GOLDEN_WORKFLOWS[0]],
      generate: { maxRepairs: 0 },
    });
    expect(run.summary.parseRate).toBe(0);
  });

  it("retries a transient provider throw instead of aborting the run", async () => {
    let calls = 0;
    const fixture = fixtureProvider([GOLDEN_WORKFLOWS[0]]);
    const flaky: AiProvider = {
      async complete(req) {
        calls++;
        if (calls === 1) throw new TypeError("fetch failed"); // one transient blip
        return fixture.complete(req);
      },
    };
    const run = await runWorkflowEval(flaky, { cases: [GOLDEN_WORKFLOWS[0]], retries: 2 });
    expect(run.summary.parseRate).toBe(1); // recovered on retry, not aborted
  });

  it("scores an exhausted provider throw as a failure (run still completes)", async () => {
    const dead: AiProvider = {
      async complete() {
        throw new TypeError("fetch failed");
      },
    };
    const run = await runWorkflowEval(dead, {
      cases: [GOLDEN_WORKFLOWS[0], GOLDEN_WORKFLOWS[1]],
      retries: 1,
    });
    expect(run.scores).toHaveLength(2); // every case scored — no whole-run abort
    expect(run.summary.parseRate).toBe(0);
    expect(run.scores[0].errors?.[0]).toContain("provider error");
  });
});

describe("formatWorkflowEvalReport", () => {
  it("renders headline metrics and a line per case", async () => {
    const run = await runWorkflowEval(fixtureProvider());
    const report = formatWorkflowEvalReport(run);
    expect(report).toContain("graph-valid-rate 100.0%");
    expect(report).toContain(GOLDEN_WORKFLOWS[0].id);
  });
});

describe("providerFromEnv", () => {
  it("returns undefined when BYOK env is absent", () => {
    expect(providerFromEnv({})).toBeUndefined();
  });

  it("builds a provider when all three vars are set", () => {
    const provider = providerFromEnv({
      WORKFLOW_AI_EVAL_BASE_URL: "https://example/v1",
      WORKFLOW_AI_EVAL_API_KEY: "k",
      WORKFLOW_AI_EVAL_MODEL: "m",
    });
    expect(provider).toBeDefined();
  });
});

/**
 * Opt-in LIVE eval — skipped unless a BYOK provider is configured via env, so CI
 * never spends tokens. Run it manually to certify the graph-valid-rate ≥ 95% bar
 * against a real model:
 *
 *   WORKFLOW_AI_EVAL_BASE_URL=… WORKFLOW_AI_EVAL_API_KEY=… WORKFLOW_AI_EVAL_MODEL=… \
 *     pnpm --filter @org/workflow-ai test -- run.test
 */
const liveProvider = providerFromEnv();
describe.skipIf(!liveProvider)("runWorkflowEval (live BYOK)", () => {
  // Sequential; a BYOK call can be slow (a dev proxy like 9router runs tens of
  // seconds/call), so the whole golden set can take minutes. The timeout clears
  // that with headroom for repair rounds; it only ever runs opt-in, never in CI.
  it("meets the graph-valid-rate bar (≥95%) on a real model", async () => {
    if (!liveProvider) return;
    const run = await runWorkflowEval(liveProvider);
    console.log(formatWorkflowEvalReport(run));
    expect(run.summary.parseRate).toBeGreaterThanOrEqual(0.95);
  }, 1_200_000);
});
