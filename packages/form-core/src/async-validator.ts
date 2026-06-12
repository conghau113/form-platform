import type { AsyncValidator } from "@org/form-schema";

/** The normalized outcome of a remote value check. */
export interface AsyncValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Build the remote-check URL: `url?value=<String(value)>&name=<fieldName>`. An existing
 * query string on the configured url is preserved. Platform-agnostic — shared by web +
 * native (same synthetic-base trick as `buildDataSourceUrl` for relative urls).
 */
export function buildAsyncValidatorUrl(
  av: AsyncValidator,
  fieldName: string,
  value: unknown,
): string {
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(av.url);
  const url = new URL(av.url, "http://_relative_base_");
  url.searchParams.set("value", String(value));
  url.searchParams.set("name", fieldName);
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

/**
 * Run one remote value check. Protocol: the endpoint answers JSON
 * `{ valid: boolean, message?: string }` — only an EXPLICIT `valid: false` is invalid
 * (a malformed body counts as valid), and `message` falls back to `av.message`.
 * Throws on a non-ok response; the CALLER decides the failure policy (the web renderer
 * fails OPEN so a flaky endpoint never blocks submit). The fetch impl is injectable
 * for tests and non-DOM environments.
 */
export async function checkAsyncValidator(
  av: AsyncValidator,
  fieldName: string,
  value: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<AsyncValidationResult> {
  const res = await fetchImpl(buildAsyncValidatorUrl(av, fieldName, value));
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = (await res.json()) as { valid?: unknown; message?: unknown } | null;
  return {
    valid: json?.valid !== false,
    message: typeof json?.message === "string" ? json.message : av.message,
  };
}
