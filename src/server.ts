import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { createApp, type Database } from "./app.js";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env before starting the backend. See .env.example.");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
const prisma = new PrismaClient({ adapter });
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const server = createApp(prisma as unknown as Database).listen(port, () => console.log(`API and Swagger: http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    const timer = setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => { void prisma.$disconnect().finally(() => { clearTimeout(timer); process.exit(0); }); });
  });
}
