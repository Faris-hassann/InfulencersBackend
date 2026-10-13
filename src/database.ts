import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before starting the backend. See .env.example.");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
export const prisma = new PrismaClient({ adapter });
