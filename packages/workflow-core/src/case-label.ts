/**
 * Derive a human-readable label for a workflow case from its form data, so a case list / header
 * shows e.g. "Nguyễn Văn A" instead of an opaque machine id (#1 — case label by data). PURE and
 * presentation-agnostic: the server denormalizes the result onto the instance summary, and the Run
 * view also calls it directly on the loaded instance's data. Never evaluates anything.
 *
 * Heuristic (first match wins): a field whose key clearly names the subject (full name / title /
 * Vietnamese "họ tên"), then any key merely containing such a word, then the first non-empty string
 * value as a last resort. Returns `undefined` when no usable string exists, so the caller keeps its
 * id fallback. The result is trimmed and capped so it stays a one-line label.
 */

const MAX_LEN = 80;

/** Key patterns from most to least specific; the first key that matches *and* has a usable string
 *  value is chosen. Covers English + Vietnamese subject fields. */
const KEY_PRIORITY: RegExp[] = [
  /^(full[_-]?name|fullname)$/i,
  /^(ho[_-]?(va[_-]?)?ten|hoten|hovaten)$/i,
  /^(name|title|label|subject)$/i,
  /(full[_-]?name|fullname|name|title|label|subject|ho[_-]?ten|hoten|^ten$)/i,
];

/** A field value usable as a label: a non-empty, trimmed string. */
function usableString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Trim + cap to a single short line. */
function clamp(text: string): string {
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1).trimEnd()}…` : text;
}

/** The best one-line label for a case from its data, or `undefined` if none can be derived. */
export function deriveCaseLabel(
  data: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!data) return undefined;
  const keys = Object.keys(data);

  for (const pattern of KEY_PRIORITY) {
    for (const key of keys) {
      if (!pattern.test(key)) continue;
      const value = usableString(data[key]);
      if (value) return clamp(value);
    }
  }

  for (const key of keys) {
    const value = usableString(data[key]);
    if (value) return clamp(value);
  }

  return undefined;
}
