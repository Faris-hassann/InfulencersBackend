import type { Database, Delegate } from "../src/app.js";
import { resources } from "../src/resources.js";
import { hashPassword, hashToken, type AdminIdentity } from "../src/auth.js";
import request from "supertest";
import { createApp } from "../src/app.js";

export const TEST_EMAIL = "admin@example.test";
export const TEST_PASSWORD = "Test-password-2026";
const testHash = hashPassword(TEST_PASSWORD);

// Test-only storage. The application server always uses PostgreSQL through Prisma.
export function memoryDatabase(): Database {
  const database = { $queryRawUnsafe: async () => [{ "?column?": 1 }] } as unknown as Database;
  const admins = new Map<number, AdminIdentity>();
  const sessions = new Map<string, any>();
  database.admin = {
    findUnique: async ({ where }) => where.id ? admins.get(where.id) ?? null : [...admins.values()].find(admin => admin.email === where.email) ?? null,
    upsert: async ({ where, create, update }) => { const found = [...admins.values()].find(admin => admin.email === where.email); const value = found ? { ...found, ...update } : { id: admins.size + 1, enabled: true, role: "admin", ...create }; admins.set(value.id, value); return value; },
  };
  database.adminSession = {
    create: async ({ data }) => { sessions.set(data.tokenHash, data); return data; },
    findUnique: async ({ where }) => { const session = sessions.get(where.tokenHash); return session ? { ...session, admin: admins.get(session.adminId) } : null; },
    deleteMany: async ({ where }) => { let count = 0; for (const [key, session] of sessions) { const match = (condition: any) => (condition.tokenHash && key === condition.tokenHash) || (condition.expiresOn && session.expiresOn <= condition.expiresOn.lte); if (match(where) || where.OR?.some(match)) { sessions.delete(key); count++; } } return { count }; },
  };
  for (const resource of resources) {
    const records = new Map<number, any>(); let nextId = 1;
    const missing = () => Object.assign(new Error("Not found"), { code: "P2025" });
    const matching = (where: any) => [...records.values()].filter(record => !where?.OR || where.OR.some((condition: any) => {
      const [key, value] = Object.entries(condition)[0] as [string, any];
      return String(record[key] ?? "").toLowerCase().includes(value.contains.toLowerCase());
    }));
    const delegate: Delegate = {
      findMany: async ({ where, skip = 0, take = 100, orderBy = [] }) => matching(where).sort((a, b) => {
        for (const entry of orderBy) { const [key, order] = Object.entries(entry)[0]; const av = a[key], bv = b[key]; if (av < bv) return order === "asc" ? -1 : 1; if (av > bv) return order === "asc" ? 1 : -1; } return 0;
      }).slice(skip, skip + take),
      count: async (args) => matching(args?.where).length,
      findUnique: async ({ where }) => records.get(where.id) ?? null,
      create: async ({ data }) => { const record = { ...(resource.model === "contact" ? { createdOn: new Date() } : {}), ...data, id: nextId++ }; records.set(record.id, record); return record; },
      update: async ({ where, data }) => { if (!records.has(where.id)) throw missing(); const record = { ...records.get(where.id), ...data }; records.set(where.id, record); return record; },
      delete: async ({ where }) => { const record = records.get(where.id); if (!record) throw missing(); records.delete(where.id); return record; },
    };
    database[resource.model] = delegate;
  }
  return database;
}

export async function authenticatedApp(database = memoryDatabase()) {
  await database.admin.upsert({ where: { email: TEST_EMAIL }, create: { email: TEST_EMAIL, passwordHash: await testHash }, update: {} });
  const app = createApp(database);
  const agent = request.agent(app);
  agent.set("X-CMS-Request", "1");
  await agent.post("/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD }).expect(200);
  return { app, agent, database };
}
