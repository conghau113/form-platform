/** Turn a human name into a URL-safe slug: lowercase, non-alphanumerics → single `-`, trimmed. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

/**
 * Given a desired `base` slug and the set of slugs already `taken` (for the same owner — the DB
 * enforces `@@unique([ownerId, slug])`), return `base` if free, else `base-2`, `base-3`, … The
 * service computes `taken` from the owner's existing projects before inserting.
 */
export function ensureUniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
