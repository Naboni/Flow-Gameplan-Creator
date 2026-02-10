import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Keep this alias targeted for Render monorepo builds where @flow/miro
      // is symlinked outside apps/web and cannot resolve nested @flow/layout.
      "@flow/layout": path.resolve(__dirname, "node_modules/@flow/layout/src/index.ts")
    }
  },
  server: {
    port: 5173
  }
});
