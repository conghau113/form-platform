import type { FieldNode, FormSchema } from "@org/form-schema";
import type { GenerateFormResult } from "../pipeline.js";
import type { GenerateFormInput } from "../prompt.js";

/**
 * P1 slice 3 — pure scoring for the golden-set eval.
 *
 * Given a generation result and a case's expectation, produce a machine score:
 * did it parse? are the expected field types present? the expected fields? the
 * minimum field count? Everything here is pure and deterministic so the harness
 * can be unit-tested without a model.
 */

/** The bar a generated form must clear for one golden case. */
export interface GoldenExpectation {
  /** Minimum number of named data fields the form should contain (whole tree). */
  minFields?: number;
  /** Field `type`s that must each appear at least once. */
  expectTypes?: FieldNode["type"][];
  /** Substrings expected in some field `name` or `label` (case-insensitive). */
  expectFields?: string[];
}

export interface GoldenCase {
  id: string;
  input: GenerateFormInput;
  expect: GoldenExpectation;
  /** Example correct answer; used only by the deterministic fixture/self-test. */
  referenceDraft: unknown;
}

export interface CaseScore {
  id: string;
  /** The form parsed into a contract-valid `FormSchema`. */
  parsed: boolean;
  attempts: number;
  /** Fraction of `expectTypes` present (1 when none required or unparsed→0). */
  typeCoverage: number;
  /** Fraction of `expectFields` matched (1 when none required or unparsed→0). */
  fieldCoverage: number;
  /** `minFields` satisfied (true when not specified). */
  fieldCountOk: boolean;
  /** parsed AND full type coverage AND full field coverage AND count ok. */
  pass: boolean;
  /** Validation errors when the form failed to parse. */
  errors?: string[];
}

export interface EvalSummary {
  total: number;
  parsed: number;
  passed: number;
  /** parsed / total — the headline P1 acceptance metric (target ≥ 0.95). */
  parseRate: number;
  /** passed / total — the stricter "matched the brief" metric. */
  passRate: number;
  avgTypeCoverage: number;
  avgFieldCoverage: number;
  avgAttempts: number;
}

/** Flatten every node in the tree (containers + their children/itemFields). */
function collectNodes(form: FormSchema): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (nodes: readonly unknown[]): void => {
    for (const node of nodes ?? []) {
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        out.push(obj);
        if (Array.isArray(obj.children)) walk(obj.children);
        if (Array.isArray(obj.itemFields)) walk(obj.itemFields);
      }
    }
  };
  walk(form.fields);
  return out;
}

const fraction = (matched: number, required: number): number =>
  required === 0 ? 1 : matched / required;

/** Score a single generation result against a case's expectation. */
export function scoreCase(
  id: string,
  result: GenerateFormResult,
  expect: GoldenExpectation,
): CaseScore {
  if (!result.ok) {
    return {
      id,
      parsed: false,
      attempts: result.attempts,
      typeCoverage: 0,
      fieldCoverage: 0,
      fieldCountOk: false,
      pass: false,
      errors: result.errors,
    };
  }

  const nodes = collectNodes(result.form);
  const types = new Set(nodes.map((n) => n.type).filter((t): t is string => typeof t === "string"));
  const named = nodes.filter((n) => typeof n.name === "string");
  const haystack = nodes
    .flatMap((n) => [n.name, n.label])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toLowerCase());

  const expectTypes = expect.expectTypes ?? [];
  const expectFields = expect.expectFields ?? [];
  const typesMatched = expectTypes.filter((t) => types.has(t)).length;
  const fieldsMatched = expectFields.filter((needle) =>
    haystack.some((h) => h.includes(needle.toLowerCase())),
  ).length;

  const typeCoverage = fraction(typesMatched, expectTypes.length);
  const fieldCoverage = fraction(fieldsMatched, expectFields.length);
  const fieldCountOk = expect.minFields == null || named.length >= expect.minFields;

  return {
    id,
    parsed: true,
    attempts: result.attempts,
    typeCoverage,
    fieldCoverage,
    fieldCountOk,
    pass: typeCoverage === 1 && fieldCoverage === 1 && fieldCountOk,
  };
}

const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Aggregate per-case scores into the headline eval metrics. */
export function summarizeEval(scores: CaseScore[]): EvalSummary {
  const total = scores.length;
  const parsed = scores.filter((s) => s.parsed).length;
  const passed = scores.filter((s) => s.pass).length;
  return {
    total,
    parsed,
    passed,
    parseRate: total === 0 ? 0 : parsed / total,
    passRate: total === 0 ? 0 : passed / total,
    avgTypeCoverage: avg(scores.map((s) => s.typeCoverage)),
    avgFieldCoverage: avg(scores.map((s) => s.fieldCoverage)),
    avgAttempts: avg(scores.map((s) => s.attempts)),
  };
}
