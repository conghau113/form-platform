import type { DesignTokens } from "@org/form-theme";
import { apiFetch } from "../lib/apiFetch";
import { API_BASE } from "../presets/config";

/** Builder ↔ API base. The single place a form/theme network call is constructed
 *  (R3/R5: `fetch` lives only in feature `client.ts` modules). Callers own response
 *  parsing and user-facing messaging so behaviour stays identical to the inline version.
 *  Requests ride `apiFetch` + the same-origin `API_BASE` proxy so the HttpOnly auth
 *  cookie is attached and expired access tokens refresh transparently (2B/A1). */
const JSON_HEADERS = { "content-type": "application/json" };

/** POST the serialized form schema. Server replies `{ id }` on success. */
export const postForm = (json: string): Promise<Response> =>
  apiFetch(`${API_BASE}/forms`, { method: "POST", headers: JSON_HEADERS, body: json });

/** POST the design tokens, persisted alongside the form under the same id. */
export const postTheme = (id: string, tokens: DesignTokens): Promise<Response> =>
  apiFetch(`${API_BASE}/themes/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(tokens),
  });

/** GET a saved form by id (raw, pre-migration — the caller migrates). */
export const getForm = (id: string): Promise<Response> =>
  apiFetch(`${API_BASE}/forms/${encodeURIComponent(id)}`);

/** GET the saved theme for a form id. A missing theme is a 404, not an error. */
export const getTheme = (id: string): Promise<Response> =>
  apiFetch(`${API_BASE}/themes/${encodeURIComponent(id)}`);
