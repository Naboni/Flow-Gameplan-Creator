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
      "@flow/core": path.resolve(__dirname, "../../libs/core/src/index.ts"),
      "@flow/layout": path.resolve(__dirname, "../../libs/layout/src/index.ts"),
      "@flow/miro": path.resolve(__dirname, "../../libs/miro/src/index.ts")
    }
  },
  server: {
    port: 5173
  }
});
