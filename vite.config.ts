import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const api = process.env.ISSUEIT_API ?? "http://127.0.0.1:8391";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "web/src") } },
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: Object.fromEntries(["/api", "/v1", "/r/", "/a/", "/e/", "/widget.js", "/health"].map((p) => [p, { target: api, changeOrigin: false }])),
  },
});
