import type { Database, Delegate } from "../src/app.js";
import { resources } from "../src/resources.js";

// Test-only storage. The application server always uses PostgreSQL through Prisma.
export function memoryDatabase(): Database {
  const database = { $queryRawUnsafe: async () => [{ "?column?": 1 }] } as unknown as Database;
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
