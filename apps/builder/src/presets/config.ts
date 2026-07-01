/**
 * Base path/URL of the `@app/api` server the builder talks to (forms, themes, presets, auth).
 * Defaults to the same-origin `/api` proxy (production-hardening 2B: Vite dev proxy + nginx),
 * which keeps API calls same-origin so the HttpOnly auth cookie is sent automatically. Override
 * with `VITE_API_BASE` at build time only when the API lives on a different origin.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
