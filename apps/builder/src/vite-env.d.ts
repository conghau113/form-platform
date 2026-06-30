/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the `@app/api` server; consumed in src/presets/config.ts. */
  readonly VITE_API_BASE?: string;
}
