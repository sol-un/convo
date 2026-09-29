import { build } from "esbuild"

// Bundles the server into one self-contained file; the web Client's build
// lands next to it in dist/public.
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  // Some bundled dependencies are CommonJS and call require().
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
})
