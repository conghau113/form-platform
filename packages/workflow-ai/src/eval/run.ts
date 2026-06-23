import {
  type AiCompletionRequest,
  type AiProvider,
  createOpenAiCompatibleProvider,
} from "@org/ai-core";
import {
  type GenerateWorkflowOptions,
  type GenerateWorkflowResult,
  generateWorkflow,
} from "../pipeline.js";
import { GOLDEN_WORKFLOWS } from "./golden.js";
import {
  type GoldenWorkflowCase,
  scoreWorkflowCase,
  summarizeWorkflowEval,
  type WorkflowCaseScore,
  type WorkflowEvalSummary,
} from "./score.js";

/**
 * P3 / C5 — the workflow eval runner.
 *
 * Runs the real `generateWorkflow` pipeline over a set of golden cases with ANY
 * `AiProvider` (a deterministic fixture in CI, or a BYOK live model) and scores
 * the output. The pipeline is never special-cased for eval: the same
 * extract → normalize (Zod + `validateGraph`) → repair path runs, so the metrics
 * reflect production — and `parseRate` is the graph-valid-rate.
 */

export interface RunWorkflowEvalOptions {
  cases?: GoldenWorkflowCase[];
  generate?: GenerateWorkflowOptions;
  /**
   * Retries when `generateWorkflow` *throws* (a provider/network error, not a
   * model parse/graph failure — that returns `ok:false`). A throw is an infra
   * blip; retrying it keeps the metric a measure of MODEL quality, not proxy
   * flakiness, and stops one dropped connection from aborting the run. Default 2.
   */
  retries?: number;
}

export interface WorkflowEvalRun {
  scores: WorkflowCaseScore[];
  summary: WorkflowEvalSummary;
}

/** Run one case, retrying transient provider *throws*; a model failure (`ok:false`)
 *  is returned as-is, and an exhausted throw becomes a scored failure so the run
 *  always completes with a number instead of aborting. */
async function generateCase(
  provider: AiProvider,
  input: GoldenWorkflowCase["input"],
  generate: GenerateWorkflowOptions | undefined,
  retries: number,
): Promise<GenerateWorkflowResult> {
  let lastError = "provider error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateWorkflow(provider, input, generate);
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { ok: false, errors: [`provider error: ${lastError}`], attempts: 0 };
}

/** Run every golden case through the pipeline and aggregate the scores. */
export async function runWorkflowEval(
  provider: AiProvider,
  options: RunWorkflowEvalOptions = {},
): Promise<WorkflowEvalRun> {
  const cases = options.cases ?? GOLDEN_WORKFLOWS;
  const retries = options.retries ?? 2;
  const scores: WorkflowCaseScore[] = [];
  for (const c of cases) {
    const result = await generateCase(provider, c.input, options.generate, retries);
    scores.push(scoreWorkflowCase(c.id, result, c.expect));
  }
  return { scores, summary: summarizeWorkflowEval(scores) };
}

/** Extract the user prompt text from a completion request (for fixture lookup). */
function promptOf(req: AiCompletionRequest): string {
  const user = req.messages.find((m) => m.role === "user");
  const text = user?.content.find((c) => c.type === "text");
  return text && text.type === "text" ? text.text : "";
}

/**
 * A deterministic provider that replays each case's `referenceDraft`, keyed by
 * exact `input.prompt`. An unknown prompt returns `"{}"` (a normalize failure),
 * so a mismatched golden case surfaces as a failing case rather than silent
 * success. It lets the harness run end-to-end in CI (real pipeline, zero tokens),
 * proving the machinery and that every golden expectation is achievable.
 */
export function fixtureProvider(cases: GoldenWorkflowCase[] = GOLDEN_WORKFLOWS): AiProvider {
  const byPrompt = new Map(cases.map((c) => [c.input.prompt, c.referenceDraft]));
  return {
    async complete(req) {
      const draft = byPrompt.get(promptOf(req));
      return { text: draft === undefined ? "{}" : JSON.stringify(draft) };
    },
  };
}

/** Env bag — kept structural (not `NodeJS.ProcessEnv`) so this package stays
 *  bundler-clean if ever imported outside Node. */
export type EvalEnv = Record<string, string | undefined>;

/** The current process env, or `{}` in a no-process context. */
function defaultEnv(): EvalEnv {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/**
 * Build a live provider from environment variables for an opt-in BYOK eval run.
 * Returns `undefined` when not configured so callers can skip gracefully.
 *
 *   WORKFLOW_AI_EVAL_BASE_URL  e.g. https://api.openai.com/v1 or the 9router URL
 *   WORKFLOW_AI_EVAL_API_KEY   the BYOK key
 *   WORKFLOW_AI_EVAL_MODEL     model id
 */
export function providerFromEnv(env: EvalEnv = defaultEnv()): AiProvider | undefined {
  const baseUrl = env.WORKFLOW_AI_EVAL_BASE_URL;
  const apiKey = env.WORKFLOW_AI_EVAL_API_KEY;
  const model = env.WORKFLOW_AI_EVAL_MODEL;
  if (!baseUrl || !apiKey || !model) return undefined;
  return createOpenAiCompatibleProvider({ baseUrl, apiKey, model });
}

/** Render a human-readable report for a finished eval run (live CLI output). */
export function formatWorkflowEvalReport(run: WorkflowEvalRun): string {
  const { summary, scores } = run;
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const lines = scores.map((s) => {
    const mark = s.pass ? "PASS" : s.parsed ? "WEAK" : "FAIL";
    const detail = s.parsed
      ? `states ${pct(s.stateCoverage)} actions ${pct(s.actionCoverage)} count ${s.countOk ? "ok" : "low"} (${s.attempts} call${s.attempts === 1 ? "" : "s"})`
      : (s.errors ?? []).join("; ");
    return `  [${mark}] ${s.id} — ${detail}`;
  });
  return [
    `Workflow eval: ${summary.passed}/${summary.total} passed, graph-valid-rate ${pct(summary.parseRate)}, pass-rate ${pct(summary.passRate)}`,
    `  avg state-coverage ${pct(summary.avgStateCoverage)}, action-coverage ${pct(summary.avgActionCoverage)}, attempts ${summary.avgAttempts.toFixed(2)}`,
    ...lines,
  ].join("\n");
}
