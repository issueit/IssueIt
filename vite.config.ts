import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const api = process.env.ISSUEIT_API ?? "http://127.0.0.1:8391";
// The version the About page shows, taken from the one place it is written down.
const { version } = createRequire(import.meta.url)("./package.json") as { version: string };

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "web/src") } },
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: Object.fromEntries(["/api", "/v1", "/r/", "/a/", "/e/", "/widget.js", "/health"].map((p) => [p, { target: api, changeOrigin: false }])),
  },
});
