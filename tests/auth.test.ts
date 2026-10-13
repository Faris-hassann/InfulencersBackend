import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/application.js";
import { hashPassword, verifyPassword, hashToken } from "../src/auth.js";
import { resources } from "../src/resources.js";
import { authenticatedApp, memoryDatabase, TEST_EMAIL, TEST_PASSWORD } from "./fixtures.js";

test("passwords use salted scrypt hashes and constant-time verification", async () => {
  const first = await hashPassword(TEST_PASSWORD); const second = await hashPassword(TEST_PASSWORD);
  assert.notEqual(first, second); assert.ok(!first.includes(TEST_PASSWORD));
  assert.equal(await verifyPassword(TEST_PASSWORD, first), true); assert.equal(await verifyPassword("incorrect", first), false); assert.equal(await verifyPassword(TEST_PASSWORD, "invalid"), false);
});
test("all CMS collections and methods require authentication", async () => {
  const app = createApp(memoryDatabase());
  for (const resource of resources) {
    await request(app).get(`/api/${resource.slug}`).expect(401);
    await request(app).get(`/api/${resource.slug}/1`).expect(401);
    for (const method of ["post", "put", "patch", "delete"] as const) await request(app)[method](`/api/${resource.slug}${method === "post" ? "" : "/1"}`).set("X-CMS-Request", "1").send({}).expect(401);
  }
  await request(app).get("/api/summary").expect(401);
  await request(app).get("/auth/me").expect(401);
});
test("successful sign-in returns only public identity and a protected session cookie", async () => {
  const { agent, app } = await authenticatedApp();
  const result = await agent.post("/auth/login").send({ email: TEST_EMAIL.toUpperCase(), password: TEST_PASSWORD }).expect(200);
  assert.equal(result.body.user.role, "admin"); assert.equal(result.body.user.email, TEST_EMAIL);
  assert.equal(result.body.user.passwordHash, undefined); assert.equal(result.body.token, undefined);
  const cookie = result.headers["set-cookie"][0]; assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i); assert.match(cookie, /Max-Age=28800/);
  await agent.get("/auth/me").expect(200);
  await request(app).get("/auth/me").set("Cookie", "iw_admin_session=forged").expect(401);
  await request(app).get("/auth/me").set("Cookie", `iw_admin_session=${"a".repeat(64)}`).expect(401);
});
test("wrong email and password have generic responses and login is throttled", async () => {
  const { app } = await authenticatedApp();
  const first = await request(app).post("/auth/login").set("X-CMS-Request", "1").send({ email: TEST_EMAIL, password: "wrong" }).expect(401);
  const second = await request(app).post("/auth/login").set("X-CMS-Request", "1").send({ email: "unknown@example.test", password: "wrong" }).expect(401);
  assert.equal(first.body.message, second.body.message);
  for (let attempt = 0; attempt < 3; attempt++) await request(app).post("/auth/login").set("X-CMS-Request", "1").send({ email: TEST_EMAIL, password: "wrong" }).expect(401);
  const blocked = await request(app).post("/auth/login").set("X-CMS-Request", "1").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(429);
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
});
test("non-admin and disabled identities cannot sign in or use existing sessions", async () => {
  for (const update of [{ role: "editor" }, { enabled: false }]) {
    const { agent, database, app } = await authenticatedApp();
    await database.admin.upsert({ where: { email: TEST_EMAIL }, create: {}, update });
    await agent.get("/api/books").expect(403); await agent.get("/auth/me").expect(403);
    await request(app).post("/auth/login").set("X-CMS-Request", "1").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(401);
  }
});
test("logout revokes the stored session, including copied cookies", async () => {
  const { agent, app } = await authenticatedApp();
  const login = await agent.post("/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  await request(app).get("/auth/me").set("Cookie", cookie).expect(200);
  const logout = await agent.post("/auth/logout").expect(204); assert.match(logout.headers["set-cookie"][0], /Expires=Thu, 01 Jan 1970/);
  await agent.get("/auth/me").expect(401); await request(app).get("/auth/me").set("Cookie", cookie).expect(401);
  await agent.post("/auth/logout").expect(204);
});
test("expired sessions cannot access records", async () => {
  const { agent, database } = await authenticatedApp();
  const login = await agent.post("/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);
  const token = login.headers["set-cookie"][0].split(";")[0].split("=")[1];
  await database.adminSession.create({ data: { tokenHash: hashToken(token), adminId: login.body.user.id, expiresOn: new Date(Date.now() - 1000) } });
  await agent.get("/api/books").expect(401);
});
test("login rotates the current session and rejects reuse of the old cookie", async () => {
  const { agent, app } = await authenticatedApp();
  const previous = await agent.post("/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);
  const oldCookie = previous.headers["set-cookie"][0].split(";")[0];
  const current = await agent.post("/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);
  assert.notEqual(previous.headers["set-cookie"][0], current.headers["set-cookie"][0]);
  await request(app).get("/auth/me").set("Cookie", oldCookie).expect(401); await agent.get("/auth/me").expect(200);
});
test("mutation and login CSRF checks reject missing headers and foreign origins", async () => {
  const { app, agent } = await authenticatedApp();
  await request(app).post("/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(403);
  await agent.post("/api/books").set("Origin", "https://evil.example").send({}).expect(403);
  await agent.post("/auth/logout").set("Origin", "https://evil.example").expect(403);
  await agent.post("/auth/login").set("Origin", "http://localhost:3000").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);
});
