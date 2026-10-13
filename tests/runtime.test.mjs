import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Documentation must start without opening a database connection.
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.DOTENV_CONFIG_QUIET = "true";

test("production entry starts with require(ESM) disabled and serves Swagger", async () => {
  assert.equal(process.features.require_module, false);
  const { default: app } = await import("../app.mjs");
  const { prisma } = await import("../dist/database.js");
  try {
    const root = await request(app).get("/").expect(302);
    assert.equal(root.headers.location, "/swagger");
    const redirect = await request(app).get("/swagger").expect(301);
    assert.equal(redirect.headers.location, "/swagger/");
    const html = await request(app).get("/swagger/").expect(200);
    assert.match(html.text, /swagger-ui/);
    await request(app).get("/swagger/swagger-ui-init.js").expect(200);
    await request(app).get("/swagger/swagger-ui.css").expect(200);
    await request(app).get("/swagger/swagger-ui-bundle.js").expect(200);
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
