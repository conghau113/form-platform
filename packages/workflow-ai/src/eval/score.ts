import type { GenerateWorkflowResult } from "../pipeline.js";
import type { GenerateWorkflowInput } from "../prompt.js";

/**
 * P3 / C5 — pure scoring for the workflow golden-set eval.
 *
 * Given a generation result and a case's expectation, produce a machine score:
 * did it produce a contract- AND graph-valid definition? are the expected states
 * / actions present? the minimum state + transition counts? Everything here is
 * pure and deterministic so the harness can be unit-tested without a model.
 *
 * NOTE the moat metric: a `parsed` result is, by construction, ALSO graph-valid —
 * the pipeline only returns `ok:true` after `normalizeWorkflowDraft` has run Zod
 * AND `validateGraph`. So `parseRate` here IS the graph-valid-rate.
 */

/** The bar a generated workflow must clear for one golden case. */
export interface GoldenWorkflowExpectation {
  /** Minimum number of states (nodes) the workflow should contain. */
  minStates?: number;
  /** Minimum number of transitions the workflow should contain. */
  minTransitions?: number;
  /** Substrings expected in some node `status` (case-insensitive). */
  expectStates?: string[];
  /** Substrings expected in some transition `action` (case-insensitive). */
  expectActions?: string[];
}

export interface GoldenWorkflowCase {
  id: string;
  input: GenerateWorkflowInput;
  expect: GoldenWorkflowExpectation;
  /** Example correct answer; used only by the deterministic fixture/self-test. */
  referenceDraft: unknown;
}

export interface WorkflowCaseScore {
  id: string;
  /** The output parsed into a contract- AND graph-valid `WorkflowDefinition`. */
  parsed: boolean;
  attempts: number;
  /** Fraction of `expectStates` present (1 when none required or unparsed→0). */
  stateCoverage: number;
  /** Fraction of `expectActions` present (1 when none required or unparsed→0). */
  actionCoverage: number;
  /** `minStates` + `minTransitions` satisfied (true when not specified). */
  countOk: boolean;
  /** parsed AND full state coverage AND full action coverage AND count ok. */
  pass: boolean;
  /** Validation errors (Zod or graph) when the output failed to normalize. */
  errors?: string[];
}

export interface WorkflowEvalSummary {
  total: number;
  parsed: number;
  passed: number;
  /** parsed / total — the headline metric. Equals the graph-valid-rate (target ≥ 0.95). */
  parseRate: number;
  /** passed / total — the stricter "matched the brief" metric. */
  passRate: number;
  avgStateCoverage: number;
  avgActionCoverage: number;
  avgAttempts: number;
}

const fraction = (matched: number, required: number): number =>
  required === 0 ? 1 : matched / required;

/** Score a single generation result against a case's expectation. */
export function scoreWorkflowCase(
  id: string,
  result: GenerateWorkflowResult,
  expect: GoldenWorkflowExpectation,
): WorkflowCaseScore {
  if (!result.ok) {
    return {
      id,
      parsed: false,
      attempts: result.attempts,
      stateCoverage: 0,
      actionCoverage: 0,
      countOk: false,
      pass: false,
      errors: result.errors,
    };
  }

  const { nodes, transitions } = result.workflow;
  const statuses = nodes.map((n) => n.status.toLowerCase());
  const actions = transitions.map((t) => t.action.toLowerCase());

  const expectStates = expect.expectStates ?? [];
  const expectActions = expect.expectActions ?? [];
  const statesMatched = expectStates.filter((needle) =>
    statuses.some((s) => s.includes(needle.toLowerCase())),
  ).length;
  const actionsMatched = expectActions.filter((needle) =>
    actions.some((a) => a.includes(needle.toLowerCase())),
  ).length;

  const stateCoverage = fraction(statesMatched, expectStates.length);
  const actionCoverage = fraction(actionsMatched, expectActions.length);
  const countOk =
    (expect.minStates == null || nodes.length >= expect.minStates) &&
    (expect.minTransitions == null || transitions.length >= expect.minTransitions);

  return {
    id,
    parsed: true,
    attempts: result.attempts,
    stateCoverage,
    actionCoverage,
    countOk,
    pass: stateCoverage === 1 && actionCoverage === 1 && countOk,
  };
}

const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Aggregate per-case scores into the headline eval metrics. */
export function summarizeWorkflowEval(scores: WorkflowCaseScore[]): WorkflowEvalSummary {
  const total = scores.length;
  const parsed = scores.filter((s) => s.parsed).length;
  const passed = scores.filter((s) => s.pass).length;
  return {
    total,
    parsed,
    passed,
    parseRate: total === 0 ? 0 : parsed / total,
    passRate: total === 0 ? 0 : passed / total,
    avgStateCoverage: avg(scores.map((s) => s.stateCoverage)),
    avgActionCoverage: avg(scores.map((s) => s.actionCoverage)),
    avgAttempts: avg(scores.map((s) => s.attempts)),
  };
}
