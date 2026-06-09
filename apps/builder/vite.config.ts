import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow importing the shared examples/ fixture from the monorepo root.
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
  },
});
