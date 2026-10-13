import app from "./app.js";
import { prisma } from "./database.js";
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const server = app.listen(port, () => console.log(`API and Swagger: http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    const timer = setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => { void prisma.$disconnect().finally(() => { clearTimeout(timer); process.exit(0); }); });
  });
}
