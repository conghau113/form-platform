import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";

// Where the dev server proxies `/api` to. Defaults to the local api (`pnpm dev` → :3001).
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig(({ mode }) => {
  // Env-driven base path (Phase 0): `VITE_BASE_PATH` lets the SPA be served under a sub-path
  // (e.g. `/form-platform/`) per environment. Defaults to `/` so dev serves at the root. Vite
  // exposes the resolved value as `import.meta.env.BASE_URL`, which main.tsx uses as the router
  // basename. `loadEnv(mode, …, "")` reads `.env`/`.env.<mode>` (build with `--mode test|production`).
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/";

  return {
    base,
    plugins: [react()],
    server: {
      // Allow importing the shared examples/ fixture from the monorepo root.
      fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
      // Same-origin API access (production-hardening 2B): the SPA calls `/api/*`, which we proxy to
      // the api, stripping the `/api` prefix. This makes the HttpOnly auth cookie same-origin (so it
      // is sent automatically) and removes any CORS/cross-site concern in dev, mirroring nginx in prod.
      proxy: {
        "/api": {
          target: API_TARGET,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
