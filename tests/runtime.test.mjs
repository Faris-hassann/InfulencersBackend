import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Documentation must start without opening a database connection.
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.DOTENV_CONFIG_QUIET = "true";

test("production entry starts with require(ESM) disabled and serves Swagger", async () => {
  assert.equal(process.features.require_module, false);
  // Model Vercel omitting swagger-ui-dist's dynamically resolved assets.
  // Successful responses must come from the explicitly packaged public copies.
  const require = createRequire(import.meta.url);
  const assetPathModule = require.resolve("swagger-ui-dist/absolute-path");
  const originalAssetPath = require(assetPathModule);
  require.cache[assetPathModule].exports = () => fileURLToPath(new URL("../.missing-swagger-assets/", import.meta.url));
  let app;
  try {
    ({ default: app } = await import("../app.mjs"));
  } finally {
    require.cache[assetPathModule].exports = originalAssetPath;
  }
  const { prisma } = await import("../dist/database.js");
  try {
    const root = await request(app).get("/").expect(302);
    assert.equal(root.headers.location, "/swagger");
    const redirect = await request(app).get("/swagger").expect(301);
    assert.equal(redirect.headers.location, "/swagger/");
    const html = await request(app).get("/swagger/").expect(200);
    assert.match(html.text, /swagger-ui/);
    assert.match(html.text, /href="\/favicon\.ico\?v=vercel"/);
    const icon = await request(app).get("/favicon.ico").expect(200);
    assert.match(icon.headers["content-type"], /image\/(?:x-icon|vnd\.microsoft\.icon)/);
    assert.deepEqual([...icon.body.subarray(0, 4)], [0, 0, 1, 0]);
    const pngIcon = await request(app).get("/favicon.png").expect(308);
    assert.equal(pngIcon.headers.location, "/favicon.ico");
    await request(app).get("/favicon.png").redirects(1).expect(200);
    const init = await request(app).get("/swagger/swagger-ui-init.js").expect(200);
    assert.match(init.headers["content-type"], /javascript/);
    assert.match(init.text, /SwaggerUIBundle\(swaggerOptions\)/);
    for (const filename of ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js"]) {
      const asset = await request(app).get(`/swagger/${filename}`).expect(200);
      assert.match(asset.headers["content-type"], filename.endsWith(".css") ? /text\/css/ : /javascript/);
      assert.equal(asset.text, await readFile(new URL(`../public/swagger/${filename}`, import.meta.url), "utf8"));
      assert.doesNotMatch(asset.text.slice(0, 200), /<!DOCTYPE html>|<html/i);
    }
    await request(app).get("/swagger/missing.js").expect(404);
    await request(app).get("/openapi.json").expect(200);
    const { cleanRichText } = await import("../dist/validation.js");
    const result = cleanRichText('<p class="ql-align-center"><strong>Safe</strong><a href="javascript:alert(1)">Link</a><script>alert(1)</script></p>');
    assert.match(result, /<strong>Safe<\/strong>/);
    assert.match(result, /ql-align-center/);
    assert.doesNotMatch(result, /javascript:|<script/);
  } finally {
    await prisma.$disconnect();
  }
});
