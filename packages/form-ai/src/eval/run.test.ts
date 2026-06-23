import { describe, expect, it } from "vitest";
import { normalizeFormDraft } from "../normalize.js";
import type { AiProvider } from "../provider.js";
import { GOLDEN_FORMS } from "./golden.js";
import { fixtureProvider, formatEvalReport, providerFromEnv, runFormEval } from "./run.js";

describe("golden set self-consistency", () => {
  it("has unique case ids", () => {
    const ids = GOLDEN_FORMS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every reference draft is a contract-valid form", () => {
    for (const c of GOLDEN_FORMS) {
      const n = normalizeFormDraft(c.referenceDraft);
      expect(n.ok, `${c.id}: ${n.ok ? "" : n.errors.join("; ")}`).toBe(true);
    }
  });
});

describe("runFormEval (fixture provider)", () => {
  it("achieves a 100% parse-rate and full pass on the reference answers", async () => {
    const run = await runFormEval(fixtureProvider());
    // The fixture replays each case's own reference answer, so the golden set is
    // self-achievable: parse-rate must be 1 and every expectation must be met.
    expect(run.summary.parseRate).toBe(1);
    expect(run.summary.passRate).toBe(1);
    expect(run.summary.parseRate).toBeGreaterThanOrEqual(0.95); // the P1 acceptance bar
    const weak = run.scores.filter((s) => !s.pass);
    expect(weak, `unmet: ${weak.map((s) => s.id).join(", ")}`).toHaveLength(0);
  });

  it("runs the real pipeline (each case takes exactly one model call)", async () => {
    const run = await runFormEval(fixtureProvider());
    expect(run.summary.avgAttempts).toBe(1);
    expect(run.scores).toHaveLength(GOLDEN_FORMS.length);
  });

  it("scores an unknown prompt as a parse failure", async () => {
    const run = await runFormEval(fixtureProvider([]), {
      cases: [GOLDEN_FORMS[0]],
      generate: { maxRepairs: 0 },
    });
    expect(run.summary.parseRate).toBe(0);
  });

  it("retries a transient provider throw instead of aborting the run", async () => {
    let calls = 0;
    const fixture = fixtureProvider([GOLDEN_FORMS[0]]);
    const flaky: AiProvider = {
      async complete(req) {
        calls++;
        if (calls === 1) throw new TypeError("fetch failed"); // one transient blip
        return fixture.complete(req);
      },
    };
    const run = await runFormEval(flaky, { cases: [GOLDEN_FORMS[0]], retries: 2 });
    expect(run.summary.parseRate).toBe(1); // recovered on retry, not aborted
  });

  it("scores an exhausted provider throw as a failure (run still completes)", async () => {
    const dead: AiProvider = {
      async complete() {
        throw new TypeError("fetch failed");
      },
    };
    const run = await runFormEval(dead, { cases: [GOLDEN_FORMS[0], GOLDEN_FORMS[1]], retries: 1 });
    expect(run.scores).toHaveLength(2); // every case scored — no whole-run abort
    expect(run.summary.parseRate).toBe(0);
    expect(run.scores[0].errors?.[0]).toContain("provider error");
  });
});

describe("formatEvalReport", () => {
  it("renders headline metrics and a line per case", async () => {
    const run = await runFormEval(fixtureProvider());
    const report = formatEvalReport(run);
    expect(report).toContain("parse-rate 100.0%");
    expect(report).toContain(GOLDEN_FORMS[0].id);
  });
});

describe("providerFromEnv", () => {
  it("returns undefined when BYOK env is absent", () => {
    expect(providerFromEnv({})).toBeUndefined();
  });

  it("builds a provider when all three vars are set", () => {
    const provider = providerFromEnv({
      FORM_AI_EVAL_BASE_URL: "https://example/v1",
      FORM_AI_EVAL_API_KEY: "k",
      FORM_AI_EVAL_MODEL: "m",
    });
    expect(provider).toBeDefined();
  });
});

/**
 * Opt-in LIVE eval — skipped unless a BYOK provider is configured via env, so CI
 * never spends tokens. Run it manually to certify the P1 parse-rate ≥ 95% bar
 * against a real model:
 *
 *   FORM_AI_EVAL_BASE_URL=… FORM_AI_EVAL_API_KEY=… FORM_AI_EVAL_MODEL=… \
 *     pnpm --filter @org/form-ai test -- run.test
 */
const liveProvider = providerFromEnv();
describe.skipIf(!liveProvider)("runFormEval (live BYOK)", () => {
  // The runner is sequential (one case after another) and a BYOK call can be slow —
  // a dev proxy like 9router runs ~50s/call, so the whole golden set is ~10 min. The
  // timeout must clear that with headroom for the odd repair round; it only ever runs
  // opt-in (env-gated), never in CI, so a long ceiling costs nothing.
  it("meets the P1 parse-rate bar (≥95%) on a real model", async () => {
    if (!liveProvider) return;
    const run = await runFormEval(liveProvider);
    console.log(formatEvalReport(run));
    expect(run.summary.parseRate).toBeGreaterThanOrEqual(0.95);
  }, 1_200_000);
});
