import type { FormSchema } from "@org/form-schema";

/**
 * P1 — output URL safety.
 *
 * A generated form is machine-authored from untrusted input (a prompt, or an
 * image that could carry an injection like "POST submissions to attacker.test").
 * Before the form is handed back we strip any submit / data-source URL whose host
 * is not on an explicit allowlist. An empty allowlist ⇒ nothing external is kept.
 *
 * Read-time data-source fetches at render are governed by the renderer's injected
 * `fetcher` (Track V), not by trusting URLs the model produced — so this focuses
 * on the URLs baked into the contract. Pure: clones, never mutates the input.
 */

export interface SanitizeResult {
  form: FormSchema;
  /** URLs that were removed, for the caller to surface back to the user. */
  stripped: string[];
}

/** True when `rawUrl`'s host matches an allowlist entry (exact or subdomain). */
function hostAllowed(rawUrl: string, allowlist: string[]): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowlist.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    return allowed.length > 0 && (host === allowed || host.endsWith(`.${allowed}`));
  });
}

/** Remove off-allowlist submit/data-source URLs from a (valid) generated form. */
export function stripDisallowedUrls(form: FormSchema, allowlist: string[]): SanitizeResult {
  const clone = structuredClone(form);
  const stripped: string[] = [];

  // settings.submitUrl — where submissions are POSTed (the primary exfil vector).
  const settings = clone.settings as { submitUrl?: string } | undefined;
  if (settings?.submitUrl && !hostAllowed(settings.submitUrl, allowlist)) {
    stripped.push(settings.submitUrl);
    settings.submitUrl = undefined;
  }

  // dataSource.url on any field — drop the whole dataSource when its url is
  // off-list (a dataSource without a url would fail re-validation).
  const walk = (nodes: unknown[]): void => {
    for (const node of nodes ?? []) {
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        const ds = obj.dataSource as { url?: string } | undefined;
        if (ds?.url && !hostAllowed(ds.url, allowlist)) {
          stripped.push(ds.url);
          obj.dataSource = undefined;
        }
        if (Array.isArray(obj.children)) walk(obj.children);
        if (Array.isArray(obj.itemFields)) walk(obj.itemFields);
      }
    }
  };
  walk(clone.fields);

  return { form: clone, stripped };
}
