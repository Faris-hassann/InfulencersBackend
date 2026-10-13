import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "iw_admin_session";
const SESSION_MS = 8 * 60 * 60 * 1000;
export type AdminIdentity = { id: number; email: string; role: string; enabled: boolean; passwordHash: string };
export type Session = { tokenHash: string; adminId: number; expiresOn: Date; admin: AdminIdentity };
export interface AuthDatabase {
  admin: { findUnique(args: any): Promise<AdminIdentity | null>; upsert(args: any): Promise<AdminIdentity> };
  adminSession: { create(args: any): Promise<unknown>; findUnique(args: any): Promise<Session | null>; deleteMany(args: any): Promise<unknown> };
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algorithm, salt, key] = hash.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(key ?? "")) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
}
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function tokenFrom(request: Request) {
  const entry = request.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return null;
  const token = entry.slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
const cookieOptions = () => ({ httpOnly: true, secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" });
const publicUser = (admin: AdminIdentity) => ({ id: admin.id, email: admin.email, role: admin.role });

export function createAuth(db: AuthDatabase) {
  const router = Router();
  // Process-local throttling bounds password derivation work; no trust in forwarded IP headers.
  const failures = new Map<string, { count: number; until: number }>();
  const loginSchema = z.strictObject({ email: z.email().max(254).transform(value => value.trim().toLowerCase()), password: z.string().min(1).max(256) });
  const dummyHash = hashPassword(randomBytes(32).toString("hex"));
  async function findSession(request: Request) {
    const token = tokenFrom(request); if (!token) return null;
    const session = await db.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { admin: true } });
    if (!session || session.expiresOn.getTime() <= Date.now()) return null;
    return session;
  }
  const authenticate: RequestHandler = async (req, res, next) => {
    const session = await findSession(req);
    if (!session) { res.status(401).json({ message: "Sign in to continue" }); return; }
    if (!session.admin.enabled || session.admin.role !== "admin") { res.status(403).json({ message: "Administrator access is required" }); return; }
    res.locals.admin = publicUser(session.admin); res.locals.session = session; next();
  };
  const csrf: RequestHandler = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    const origin = req.get("Origin");
    const allowed = [...(process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","), process.env.API_PUBLIC_URL ?? "http://localhost:4000"].map(value => value.trim());
    if (req.get("X-CMS-Request") !== "1" || (origin && !allowed.includes(origin))) { res.status(403).json({ message: "Request origin could not be verified" }); return; }
    next();
  };
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.use(csrf);
  router.post("/login", async (req, res) => {
    const ip = req.ip ?? "unknown"; const now = Date.now();
    const previous = failures.get(ip);
    if (previous && previous.until > now && previous.count >= 5) { res.setHeader("Retry-After", Math.ceil((previous.until - now) / 1000)); res.status(429).json({ message: "Too many sign-in attempts. Try again in 15 minutes." }); return; }
    const { email, password } = loginSchema.parse(req.body);
    const admin = await db.admin.findUnique({ where: { email } });
    const valid = await verifyPassword(password, admin?.passwordHash ?? await dummyHash);
    if (!admin || !valid || !admin.enabled || admin.role !== "admin") {
      if (failures.size >= 10000) for (const [key, value] of failures) { if (value.until <= now) failures.delete(key); }
      if (failures.size >= 10000 && !failures.has(ip)) { res.status(429).json({ message: "Too many sign-in attempts. Try again later." }); return; }
      failures.set(ip, { count: previous && previous.until > now ? previous.count + 1 : 1, until: previous && previous.until > now ? previous.until : now + 15 * 60 * 1000 });
      res.status(401).json({ message: "The email or password is incorrect" }); return;
    }
    failures.delete(ip);
    const oldToken = tokenFrom(req);
    const token = randomBytes(32).toString("hex");
    const expiresOn = new Date(Date.now() + SESSION_MS);
    await db.adminSession.deleteMany({ where: { OR: [{ expiresOn: { lte: new Date() } }, ...(oldToken ? [{ tokenHash: hashToken(oldToken) }] : [])] } });
    await db.adminSession.create({ data: { tokenHash: hashToken(token), adminId: admin.id, expiresOn } });
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
    res.json({ user: publicUser(admin), expiresOn });
  });
  router.get("/me", authenticate, (_req, res) => res.json({ user: res.locals.admin, expiresOn: res.locals.session.expiresOn }));
  router.post("/logout", async (req, res) => {
    const token = tokenFrom(req);
    if (token) await db.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(SESSION_COOKIE, cookieOptions()); res.status(204).end();
  });
  return { router, authenticate, csrf };
}
