import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served at /gate by the backend's Fastify app (ADR-002) — base must
  // match so built asset URLs resolve correctly.
  base: "/gate/",
  build: {
    outDir: "dist",
  },
  server: {
    // Local dev: `npm run dev` here proxies API calls to the backend
    // (`npm run dev` in the parent directory, port 8787) so the SPA can be
    // developed standalone without CORS friction.
    proxy: {
      "/tasks": "http://localhost:8787",
      "/reports": "http://localhost:8787",
      "/control": "http://localhost:8787",
      "/webhooks": "http://localhost:8787",
      "/healthz": "http://localhost:8787",
    },
  },
});
