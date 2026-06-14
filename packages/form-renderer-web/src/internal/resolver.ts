import { type AsyncValidationResult, checkAsyncValidator } from "@org/form-core";
import type { AsyncValidator } from "@org/form-schema";

/** Read a dotted react-hook-form path (`members.0.email`) out of a values object. */
export function getAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Write a resolver error at a dotted path, creating intermediate objects — and
 *  ARRAYS for numeric segments — so `members.0.email` lands where RHF expects it. */
export function setErrorAtPath(
  errors: Record<string, unknown>,
  path: string,
  err: { type: string; message: string },
): void {
  const segs = path.split(".");
  let cur: Record<string, unknown> = errors;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    let next = cur[seg];
    if (next == null || typeof next !== "object") {
      next = /^\d+$/.test(segs[i + 1] as string) ? [] : {};
      cur[seg] = next;
    }
    cur = next as Record<string, unknown>;
  }
  cur[segs[segs.length - 1] as string] = err;
}

export type AsyncCacheEntry = { value: unknown; promise: Promise<AsyncValidationResult> };
export type AsyncCache = Map<string, AsyncCacheEntry>;

/** One debounced remote check. The entry is registered in the cache BEFORE the
 *  debounce sleep, so a newer keystroke supersedes this one: when the sleep wakes
 *  up under a different cached value, it reports valid without fetching — the
 *  newest entry's own resolver run carries the real verdict. A network failure
 *  fails OPEN (valid) so a flaky endpoint never blocks submit. */
export async function runAsyncCheck(
  cache: AsyncCache,
  path: string,
  name: string,
  value: unknown,
  validator: AsyncValidator,
): Promise<AsyncValidationResult> {
  await new Promise((resolve) => setTimeout(resolve, validator.debounceMs ?? 400));
  if (!Object.is(cache.get(path)?.value, value)) return { valid: true };
  try {
    return await checkAsyncValidator(validator, name, value);
  } catch {
    return { valid: true };
  }
}
