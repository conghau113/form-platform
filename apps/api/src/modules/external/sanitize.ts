/**
 * Keys stripped from a form body before it leaves for a third party.
 *
 * - `permissions` holds `viewRoles`/`editRoles` — **the tenant's own Role codes**. Handing those to
 *   an integrating system is the same class of leak E3a's reviewer caught on `forProject`, and the
 *   integration has no use for them: field-level RBAC is enforced here, not there.
 * - `url` appears on the remote-fetch shapes (`asyncValidator`, `dataSource`, `lookup` —
 *   `packages/form-schema/src/schema.ts:117,334,431`). Those point at *our* endpoints; a caller that
 *   learned them would be reading our topology. No user-visible string is keyed `url` (the `"url"`
 *   in the `format` enum is a *value*, not a key), so removing the key by name is precise.
 * - `submitUrl` (`schema.ts:1043`, under `settings`) is where submissions are POSTed — the same
 *   class of endpoint, and `packages/form-ai/src/sanitize.ts:42` already calls it "the primary exfil
 *   vector" on its own, lower-trust egress path.
 *
 * ⚠️ Two egress sanitizers now exist — this one and `packages/form-ai/src/sanitize.ts` (which
 * host-allowlists rather than strips). A new URL-bearing schema field has to be added to **both**.
 *
 * ⚠️ This is a redaction list, not the §12.B mapping. The real export (D1) still has to decide what
 * `permissions` and `visibleWhen` becoming absent *means* for the caller — plan R11 — and say so out
 * loud rather than letting the fields quietly vanish.
 */
const REDACTED_KEYS = new Set(["permissions", "url", "submitUrl"]);

/**
 * Deep-copy `value` with every {@link REDACTED_KEYS} entry removed, at any depth.
 *
 * Copies rather than mutating: the input is a repo-owned object that other callers share, and a
 * sanitizer that edited it in place would strip fields from the platform's own runtime too.
 */
export function redactForExternal<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key)) continue;
    out[key] = walk(child);
  }
  return out;
}
