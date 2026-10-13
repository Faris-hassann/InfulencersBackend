import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/application.js";
import { resources } from "../src/resources.js";
import { memoryDatabase, authenticatedApp } from "./fixtures.js";

const content = { title: "A useful idea", description: "<p>A <strong>formatted</strong> description.</p>", imageUrl: "https://example.com/cover.jpg", youtubeUrl: "https://www.youtube.com/watch?v=example", publishedOn: "2026-10-14T12:00:00.000Z" };
const contact = { firstName: "Sara", lastName: "Ali", description: "Please get in touch.", email: "sara@example.com", phoneNumber: "+20 100 123 4567", createdOn: "2026-10-14T12:00:00.000Z" };
test("named Helmet middleware preserves the full security header set", async () => {
  const response = await request(createApp(memoryDatabase())).get("/").expect(302);
  const expected = { "cross-origin-opener-policy": "same-origin", "cross-origin-resource-policy": "same-origin", "origin-agent-cluster": "?1", "referrer-policy": "no-referrer", "strict-transport-security": "max-age=31536000; includeSubDomains", "x-content-type-options": "nosniff", "x-dns-prefetch-control": "off", "x-download-options": "noopen", "x-frame-options": "SAMEORIGIN", "x-permitted-cross-domain-policies": "none", "x-xss-protection": "0" };
  for (const [header, value] of Object.entries(expected)) assert.equal(response.headers[header], value, header);
  assert.equal(response.headers["x-powered-by"], undefined);
});
for (const resource of resources) {
  test(`${resource.name}: create, list, view, PUT, PATCH, delete`, async () => {
    const { agent } = await authenticatedApp(); const path = `/api/${resource.slug}`; const data = resource.model === "contact" ? contact : content;
    const created = await agent.post(path).send(data).expect(201);
    assert.equal(created.headers.location, `${path}/${created.body.id}`);
    const id = created.body.id;
    const list = await agent.get(path).expect(200); assert.equal(list.body.pagination.total, 1); assert.equal(list.body.data[0].id, id);
    await agent.get(`${path}/${id}`).expect(200);
    await agent.put(`${path}/${id}`).send({ description: "Incomplete" }).expect(400);
    const replacement = { ...data, description: resource.model === "contact" ? "New message" : "<p>New description</p>" };
    const put = await agent.put(`${path}/${id}`).send(replacement).expect(200); assert.equal(put.body.description, replacement.description);
    const patch = await agent.patch(`${path}/${id}`).send({ description: resource.model === "contact" ? "Patched message" : "<p>Patched description</p>" }).expect(200);
    assert.equal(patch.body[resource.model === "contact" ? "email" : "title"], data[resource.model === "contact" ? "email" : "title"]);
    assert.equal(patch.body[resource.date], data[resource.date as keyof typeof data]);
    await agent.patch(`${path}/${id}`).send({}).expect(400);
    await agent.patch(`${path}/${id}`).send({ id: 42 }).expect(400);
    await agent.delete(`${path}/${id}`).expect(204);
    await agent.get(`${path}/${id}`).expect(404);
    await agent.patch(`${path}/${id}`).send({ description: "Missing" }).expect(404);
    await agent.delete(`${path}/${id}`).expect(404);
  });
}
test("sanitizes rich text without removing Quill formatting", async () => {
  const { agent } = await authenticatedApp();
  const result = await agent.post("/api/books").send({ ...content, description: '<h2>Title</h2><p class="ql-align-center"><strong>Safe</strong><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">Link</a></p>' }).expect(201);
  assert.match(result.body.description, /<h2>Title<\/h2>/); assert.match(result.body.description, /<strong>Safe<\/strong>/); assert.match(result.body.description, /ql-align-center/); assert.doesNotMatch(result.body.description, /script|onerror|javascript|<img/);
  await agent.post("/api/books").send({ ...content, description: "<p><br></p>" }).expect(400);
});
test("validates URLs, dates, contact data, IDs and query parameters", async () => {
  const { agent } = await authenticatedApp();
  for (const invalid of [{ imageUrl: "javascript:alert(1)" }, { youtubeUrl: "https://youtube.com.evil.test/watch" }, { publishedOn: "2026-02-30T12:00:00Z" }, { title: " " }, { extraField: "unknown" }]) await agent.post("/api/books").send({ ...content, ...invalid }).expect(400);
  for (const invalid of [{ email: "invalid" }, { phoneNumber: "abc" }, { firstName: "" }]) await agent.post("/api/contacts").send({ ...contact, ...invalid }).expect(400);
  for (const id of ["0", "-1", "abc", "2147483648"]) await agent.get(`/api/books/${id}`).expect(400);
  for (const query of ["page=0", "pageSize=101", "sortBy=email", "order=wrong", "unknown=true"]) await agent.get(`/api/books?${query}`).expect(400);
  await agent.post("/api/books").set("Content-Type", "application/json").send("{invalid").expect(400);
});
test("pagination, search, sorting, and summary cover all collections", async () => {
  const { agent } = await authenticatedApp();
  for (const title of ["Zebra", "Alpha", "Beta"]) await agent.post("/api/books").send({ ...content, title }).expect(201);
  const page = await agent.get("/api/books?page=2&pageSize=1&sortBy=title&order=asc").expect(200);
  assert.equal(page.body.data[0].title, "Beta"); assert.equal(page.body.pagination.totalPages, 3);
  const search = await agent.get("/api/books?search=ALPHA").expect(200); assert.equal(search.body.pagination.total, 1);
  const summary = await agent.get("/api/summary").expect(200); assert.equal(summary.body.books, 3); assert.equal(Object.keys(summary.body).length, 6);
});
test("Contact Us allows server-created date and keeps description plain", async () => {
  const { agent } = await authenticatedApp(); const { createdOn, ...body } = contact;
  const result = await agent.post("/api/contacts").send({ ...body, description: "<b>Literal message</b>" }).expect(201);
  assert.ok(result.body.createdOn); assert.equal(result.body.description, "<b>Literal message</b>");
});
test("Swagger redirect, OpenAPI contract, health and unavailable database", async () => {
  const database = memoryDatabase(); const { agent } = await authenticatedApp(database);
  const redirect = await agent.get("/").expect(302); assert.equal(redirect.headers.location, "/swagger");
  assert.equal(redirect.headers["x-content-type-options"], "nosniff");
  assert.equal(redirect.headers["x-frame-options"], "SAMEORIGIN");
  const swaggerRedirect = await agent.get("/swagger").expect(301);
  assert.equal(swaggerRedirect.headers.location, "/swagger/");
  await agent.get("/swagger/").expect(200);
  const swaggerScript = await agent.get("/swagger/swagger-ui-init.js").expect(200);
  assert.match(swaggerScript.text, /X-CMS-Request/);
  assert.doesNotMatch(swaggerScript.text, /"requestInterceptor":\s*"/);
  const document = await agent.get("/openapi.json").expect(200);
  for (const resource of resources) assert.ok(document.body.paths[`/api/${resource.slug}/{id}`].patch);
  await agent.get("/health").expect(200);
  database.$queryRawUnsafe = async () => { throw new Error("Offline"); };
  await agent.get("/health").expect(503);
  database.book.findMany = async () => { throw Object.assign(new Error("Offline"), { code: "P1001" }); };
  const offline = await agent.get("/api/books").expect(503); assert.match(offline.body.message, /DATABASE_URL/);
});
