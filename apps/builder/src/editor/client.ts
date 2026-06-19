import type { DesignTokens } from "@org/form-theme";

/** Builder ↔ API base. The single place a form/theme network call is constructed
 *  (R3/R5: `fetch` lives only in feature `client.ts` modules). Callers own response
 *  parsing and user-facing messaging so behaviour stays identical to the inline version. */
const API = "http://localhost:3001";
const JSON_HEADERS = { "content-type": "application/json" };

/** POST the serialized form schema. Server replies `{ id }` on success. */
export const postForm = (json: string): Promise<Response> =>
  fetch(`${API}/forms`, { method: "POST", headers: JSON_HEADERS, body: json });

/** POST the design tokens, persisted alongside the form under the same id. */
export const postTheme = (id: string, tokens: DesignTokens): Promise<Response> =>
  fetch(`${API}/themes/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(tokens),
  });

/** GET a saved form by id (raw, pre-migration — the caller migrates). */
export const getForm = (id: string): Promise<Response> =>
  fetch(`${API}/forms/${encodeURIComponent(id)}`);

/** GET the saved theme for a form id. A missing theme is a 404, not an error. */
export const getTheme = (id: string): Promise<Response> =>
  fetch(`${API}/themes/${encodeURIComponent(id)}`);
