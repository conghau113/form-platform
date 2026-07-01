/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the `@app/api` server; consumed in src/presets/config.ts. */
  readonly VITE_API_BASE?: string;
  /** Sub-path the SPA is served under (Phase 0). Feeds Vite `base`/`BASE_URL` + router basename. */
  readonly VITE_BASE_PATH?: string;
  /** Human-readable environment label (dev/test/production) for display/diagnostics. */
  readonly VITE_APP_ENV?: string;
}
