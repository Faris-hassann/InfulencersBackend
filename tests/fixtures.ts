import type { Database, Delegate } from "../src/application.js";
import { resources } from "../src/resources.js";
import { hashPassword, hashToken, type AdminIdentity } from "../src/auth.js";
import request from "supertest";
import { createApp } from "../src/application.js";

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
    const matchCondition = (record: any, cond: any): boolean => {
      if (!cond || Object.keys(cond).length === 0) return true;
      if (cond.OR && Array.isArray(cond.OR)) return cond.OR.some((sub: any) => matchCondition(record, sub));
      if (cond.AND && Array.isArray(cond.AND)) return cond.AND.every((sub: any) => matchCondition(record, sub));
      for (const [key, val] of Object.entries(cond)) {
        if (key === "AND" || key === "OR") continue;
        if (val !== null && typeof val === "object" && "contains" in (val as any)) {
          const recVal = String(record[key] ?? "").toLowerCase();
          if (!recVal.includes(String((val as any).contains).toLowerCase())) return false;
        } else if (record[key] !== val) {
          return false;
        }
      }
      return true;
    };
    const matching = (where: any) => [...records.values()].filter(record => matchCondition(record, where));
    const delegate: Delegate = {
      findMany: async ({ where, skip = 0, take = 100, orderBy = [] }) => matching(where).sort((a, b) => {
        for (const entry of orderBy) { const [key, order] = Object.entries(entry)[0]; const av = a[key], bv = b[key]; if (av < bv) return order === "asc" ? -1 : 1; if (av > bv) return order === "asc" ? 1 : -1; } return 0;
      }).slice(skip, skip + take),
      count: async (args) => matching(args?.where).length,
      findUnique: async ({ where }) => records.get(where.id) ?? null,
      create: async ({ data }) => {
        const defaultDate = resource.date === "createdOn" ? { createdOn: new Date() } : { publishedOn: new Date() };
        const record = { ...defaultDate, ...data, id: nextId++ };
        records.set(record.id, record);
        return record;
      },
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
