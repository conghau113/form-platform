import { type GenerateFormOptions, type GenerateFormResult, generateForm } from "../pipeline.js";
import type { AiCompletionRequest, AiProvider } from "../provider.js";
import { createOpenAiCompatibleProvider } from "../providers/openai-compatible.js";
import { GOLDEN_FORMS } from "./golden.js";
import {
  type CaseScore,
  type EvalSummary,
  type GoldenCase,
  scoreCase,
  summarizeEval,
} from "./score.js";

/**
 * P1 slice 3 — the eval runner.
 *
 * Runs the real `generateForm` pipeline over a set of golden cases with ANY
 * `AiProvider` (a deterministic fixture in CI, or a BYOK live model) and scores
 * the output. The pipeline is never special-cased for eval: the same
 * extract→normalize→repair path runs, so the metrics reflect production.
 */

export interface RunFormEvalOptions {
  cases?: GoldenCase[];
  generate?: GenerateFormOptions;
  /**
   * Retries when `generateForm` *throws* (a provider/network error, not a model
   * parse failure — that returns `ok:false`). A throw is an infra blip; retrying
   * it keeps the metric a measure of MODEL quality, not proxy flakiness, and
   * stops one dropped connection from aborting the whole sequential run. Default 2.
   */
  retries?: number;
}

export interface EvalRun {
  scores: CaseScore[];
  summary: EvalSummary;
}

/** Run one case, retrying transient provider *throws*; a model failure (`ok:false`)
 *  is returned as-is, and an exhausted throw becomes a scored parse failure so the
 *  run always completes with a number instead of aborting. */
async function generateCase(
  provider: AiProvider,
  input: GoldenCase["input"],
  generate: GenerateFormOptions | undefined,
  retries: number,
): Promise<GenerateFormResult> {
  let lastError = "provider error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateForm(provider, input, generate);
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { ok: false, errors: [`provider error: ${lastError}`], attempts: 0 };
}

/** Run every golden case through the pipeline and aggregate the scores. */
export async function runFormEval(
  provider: AiProvider,
  options: RunFormEvalOptions = {},
): Promise<EvalRun> {
  const cases = options.cases ?? GOLDEN_FORMS;
  const retries = options.retries ?? 2;
  const scores: CaseScore[] = [];
  for (const c of cases) {
    const result = await generateCase(provider, c.input, options.generate, retries);
    scores.push(scoreCase(c.id, result, c.expect));
  }
  return { scores, summary: summarizeEval(scores) };
}

/** Extract the user prompt text from a completion request (for fixture lookup). */
function promptOf(req: AiCompletionRequest): string {
  const user = req.messages.find((m) => m.role === "user");
  const text = user?.content.find((c) => c.type === "text");
  return text && text.type === "text" ? text.text : "";
}

/**
 * A deterministic provider that replays each case's `referenceDraft`, keyed by
 * exact `input.prompt`. An unknown prompt returns `"{}"` (a parse failure), so a
 * mismatched golden edit surfaces as a failing case rather than silent success.
 * It lets the harness run end-to-end in CI (real pipeline, zero tokens), proving
 * the machinery and that every golden expectation is achievable.
 */
export function fixtureProvider(cases: GoldenCase[] = GOLDEN_FORMS): AiProvider {
  const byPrompt = new Map(cases.map((c) => [c.input.prompt, c.referenceDraft]));
  return {
    async complete(req) {
      const draft = byPrompt.get(promptOf(req));
      return { text: draft === undefined ? "{}" : JSON.stringify(draft) };
    },
  };
}

/** Env bag — kept structural (not `NodeJS.ProcessEnv`) so this package stays
 *  browser-clean when bundled into the builder. */
export type EvalEnv = Record<string, string | undefined>;

/** The current process env, or `{}` in a browser/no-process context. */
function defaultEnv(): EvalEnv {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/**
 * Build a live provider from environment variables for an opt-in BYOK eval run.
 * Returns `undefined` when not configured so callers can skip gracefully.
 *
 *   FORM_AI_EVAL_BASE_URL  e.g. https://api.openai.com/v1 or the 9router URL
 *   FORM_AI_EVAL_API_KEY   the BYOK key
 *   FORM_AI_EVAL_MODEL     model id
 */
export function providerFromEnv(env: EvalEnv = defaultEnv()): AiProvider | undefined {
  const baseUrl = env.FORM_AI_EVAL_BASE_URL;
  const apiKey = env.FORM_AI_EVAL_API_KEY;
  const model = env.FORM_AI_EVAL_MODEL;
  if (!baseUrl || !apiKey || !model) return undefined;
  return createOpenAiCompatibleProvider({ baseUrl, apiKey, model });
}

/** Render a human-readable report for a finished eval run (live CLI output). */
export function formatEvalReport(run: EvalRun): string {
  const { summary, scores } = run;
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const lines = scores.map((s) => {
    const mark = s.pass ? "PASS" : s.parsed ? "WEAK" : "FAIL";
    const detail = s.parsed
      ? `types ${pct(s.typeCoverage)} fields ${pct(s.fieldCoverage)} count ${s.fieldCountOk ? "ok" : "low"} (${s.attempts} call${s.attempts === 1 ? "" : "s"})`
      : (s.errors ?? []).join("; ");
    return `  [${mark}] ${s.id} — ${detail}`;
  });
  return [
    `Eval: ${summary.passed}/${summary.total} passed, parse-rate ${pct(summary.parseRate)}, pass-rate ${pct(summary.passRate)}`,
    `  avg type-coverage ${pct(summary.avgTypeCoverage)}, field-coverage ${pct(summary.avgFieldCoverage)}, attempts ${summary.avgAttempts.toFixed(2)}`,
    ...lines,
  ].join("\n");
}
