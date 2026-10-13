import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { hashPassword } from "./auth.js";
import { z } from "zod";

const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
const password = z.string().min(10).max(256).parse(process.env.ADMIN_PASSWORD);
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before creating the administrator");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log("Administrator already exists. The existing password and access settings were preserved.");
  } else {
    await prisma.admin.create({ data: { email, passwordHash: await hashPassword(password), role: "admin", enabled: true } });
    console.log("Administrator created with a hashed password.");
  }
} finally { await prisma.$disconnect(); }
