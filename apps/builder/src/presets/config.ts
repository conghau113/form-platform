/**
 * Base URL of the `@app/api` server the builder talks to (forms, themes, presets).
 * Set `VITE_API_BASE` at build time (see env.example) to point at a deployed API;
 * defaults to the local dev server so existing workflows are unchanged.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";
