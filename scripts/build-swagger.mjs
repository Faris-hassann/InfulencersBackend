import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("swagger-ui-dist/package.json"));
const destination = path.resolve("public/swagger");
await mkdir(destination, { recursive: true });
for (const filename of ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js", "favicon-16x16.png", "favicon-32x32.png"]) {
  await copyFile(path.join(source, filename), path.join(destination, filename));
}
console.log("Prepared Swagger assets in public/swagger for Vercel's static serving.");
