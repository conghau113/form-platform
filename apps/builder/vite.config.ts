import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

// Where the dev server proxies `/api` to. Defaults to the local api (`pnpm dev` → :3001).
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
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
});
