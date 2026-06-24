/**
 * Text folding for robust, fuzzy substring matching in the AI eval scorers.
 *
 * A golden expectation like `expectActions: ["duyet"]` or `expectStates:
 * ["quản lý"]` must still match when the model legitimately emits the same
 * concept with different diacritics, casing, or word separators — e.g.
 * "duyệt", "Quản Lý", "từ chối" vs "tu_choi". Comparing the *folded* form of
 * both needle and haystack makes the match insensitive to all three:
 *
 *   - case             ("Approve" -> "approve")
 *   - diacritics       ("duyệt"   -> "duyet", "đơn" -> "don")
 *   - separators/punct ("tu_choi", "từ chối", "tu-choi" -> "tuchoi")
 *
 * Folding only ever *removes* characters and does so identically on both
 * sides, so any match that held under a plain lowercased substring check still
 * holds — it widens matches, never narrows them.
 */
export function foldForMatch(s: string): string {
  return s
    .normalize("NFD") // split base letter + combining diacritic
    .replace(/[̀-ͯ]/g, "") // drop the combining diacritics
    .toLowerCase()
    .replace(/đ/g, "d") // Vietnamese đ has no NFD decomposition
    .replace(/[^a-z0-9]+/g, ""); // ignore separators / punctuation / spacing
}

/** True when `needle` appears in `haystack` ignoring case, diacritics and separators. */
export function foldedIncludes(haystack: string, needle: string): boolean {
  const folded = foldForMatch(needle);
  // A needle that folds to nothing (e.g. a non-latin script the fold can't
  // romanize) would otherwise match everything — treat it as no match.
  return folded !== "" && foldForMatch(haystack).includes(folded);
}
