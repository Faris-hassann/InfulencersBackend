import express from "express";
import { createApp, type Database } from "./application.js";
import { prisma } from "./database.js";

// Vercel discovers this entry point and serves the exported app directly.
// Database initialization is isolated from the testable application factory.
const app: ReturnType<typeof express> = createApp(prisma as unknown as Database);
export default app;
