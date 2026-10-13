import { build } from "esbuild";

// Serverless runtimes can disable require(ESM), which sanitize-html needs to
// load htmlparser2 12. Bundle both together instead of downgrading either one.
await build({
  entryPoints: ["src/validation.ts"],
  outfile: "dist/validation.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["zod"],
  sourcemap: true,
  banner: { js: 'import { createRequire as createBundleRequire } from "node:module"; const require = createBundleRequire(import.meta.url);' },
});
