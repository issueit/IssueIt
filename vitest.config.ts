import { defineConfig } from "vitest/config";

export default defineConfig({ test: { root: ".", include: ["server/**/*.test.ts", "web/**/*.test.ts", "widget/**/*.test.ts", "scripts/**/*.test.ts"], environment: "node" } });
