// Builds the embeddable widget into dist/cdn/widget.js: one small file, no dependencies.
import { build } from "esbuild";

const result = await build({
  entryPoints: ["widget/widget.ts"],
  outfile: "dist/cdn/widget.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari14"],
  legalComments: "none",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`widget.js: ${(bytes / 1024).toFixed(1)} KB`);
