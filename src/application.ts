import express, { type ErrorRequestHandler } from "express";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { crossOriginOpenerPolicy, crossOriginResourcePolicy, originAgentCluster, referrerPolicy, strictTransportSecurity, xContentTypeOptions, xDnsPrefetchControl, xDownloadOptions, xFrameOptions, xPermittedCrossDomainPolicies, xPoweredBy, xXssProtection } from "helmet";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import { resources } from "./resources.js";
import { bodySchema, idSchema, querySchema } from "./validation.js";
import { openapi } from "./openapi.js";
import { createAuth, type AuthDatabase } from "./auth.js";

// Small adapter interface keeps the HTTP contract independently testable.
export interface Delegate {
  findMany(args: any): Promise<any[]>;
  findUnique(args: any): Promise<any>;
  count(args?: any): Promise<number>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}
export type Database = Record<(typeof resources)[number]["model"], Delegate> & AuthDatabase & { $queryRawUnsafe(query: string): Promise<unknown> };
export function createApp(db: Database) {
  const app = express();
  app.disable("x-powered-by");
  // Named middleware exports avoid Helmet's ambiguous CJS/ESM default type.
  // This is the same default header set as helmet({ contentSecurityPolicy: false }).
  app.use(crossOriginOpenerPolicy(), crossOriginResourcePolicy(), originAgentCluster(), referrerPolicy(), strictTransportSecurity(), xContentTypeOptions(), xDnsPrefetchControl(), xDownloadOptions(), xFrameOptions(), xPermittedCrossDomainPolicies(), xPoweredBy(), xXssProtection());
  app.use(cors({ credentials: true, origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map(value => value.trim()) }));
  app.use(express.json({ limit: "1mb" }));
  app.get("/favicon.ico", (_req, res) => res.sendFile(fileURLToPath(new URL("../public/favicon.ico", import.meta.url)), { maxAge: "1d" }));
  app.get("/favicon.png", (_req, res) => res.redirect(308, "/favicon.ico"));
  app.get("/", (_req, res) => res.redirect(302, "/swagger"));
  app.get("/openapi.json", (_req, res) => res.json(openapi));
  // Relative Swagger asset URLs need the slash, independently of static middleware.
  app.get(/^\/swagger$/, (_req, res) => res.redirect(301, "/swagger/"));
  // Serve the build's explicit asset copies even if Vercel's dependency tracing
  // omits swagger-ui-dist's dynamically resolved files.
  app.use("/swagger", express.static(fileURLToPath(new URL("../public/swagger/", import.meta.url)), { index: false }), swaggerUi.serve);
  // HTML belongs only at the documentation root, never at a missing asset URL.
  app.get("/swagger/", swaggerUi.setup(openapi, { customSiteTitle: "Influencers World · API", customfavIcon: "/favicon.ico?v=vercel", swaggerOptions: { withCredentials: true, requestInterceptor: (request: { headers: Record<string, string> }) => { request.headers["X-CMS-Request"] = "1"; return request; } } }));
  app.get("/health", async (_req, res) => {
    try { await db.$queryRawUnsafe("SELECT 1"); res.json({ status: "ok", database: "connected" }); }
    catch { res.status(503).json({ status: "unavailable", database: "disconnected" }); }
  });
  const auth = createAuth(db);
  app.use("/auth", auth.router);
  app.use("/api", auth.authenticate, auth.csrf, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/api/summary", async (_req, res) => {
    const totals = await Promise.all(resources.map(async resource => [resource.slug, await db[resource.model].count()]));
    res.json(Object.fromEntries(totals));
  });
  for (const resource of resources) {
    const route = `/api/${resource.slug}`;
    const delegate = db[resource.model];
    const contact = resource.model === "contact";
    app.get(route, async (req, res) => {
      const { page, pageSize, search, sortBy, order } = querySchema.parse(req.query);
      const sort = sortBy ?? resource.date;
      const allowed = contact ? ["id", "firstName", "lastName", "email", "createdOn"] : ["id", "title", "publishedOn"];
      if (!allowed.includes(sort)) { res.status(400).json({ message: "Invalid sort field for this section" }); return; }
      const where = search ? { OR: (contact ? ["firstName", "lastName", "email", "description", "phoneNumber"] : ["title", "description"]).map(field => ({ [field]: { contains: search, mode: "insensitive" } })) } : {};
      const [data, total] = await Promise.all([
        delegate.findMany({ where, orderBy: sort === "id" ? [{ id: order }] : [{ [sort]: order }, { id: order }], skip: (page - 1) * pageSize, take: pageSize }),
        delegate.count({ where }),
      ]);
      res.json({ data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    });
    app.post(route, async (req, res) => {
      const data = bodySchema(contact, "POST").parse(req.body);
      const record = await delegate.create({ data });
      res.status(201).location(`${route}/${record.id}`).json(record);
    });
    app.get(`${route}/:id`, async (req, res) => {
      const record = await delegate.findUnique({ where: { id: idSchema.parse(req.params.id) } });
      if (!record) { res.status(404).json({ message: "Record not found" }); return; }
      res.json(record);
    });
    for (const method of ["put", "patch"] as const) {
      app[method](`${route}/:id`, async (req, res) => {
        const id = idSchema.parse(req.params.id);
        const data = bodySchema(contact, method === "put" ? "PUT" : "PATCH").parse(req.body);
        res.json(await delegate.update({ where: { id }, data }));
      });
    }
    app.delete(`${route}/:id`, async (req, res) => {
      await delegate.delete({ where: { id: idSchema.parse(req.params.id) } });
      res.status(204).end();
    });
  }
  app.use((_req, res) => { res.status(404).json({ message: "Endpoint not found" }); });
  const handler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) { res.status(400).json({ message: "Please check the submitted fields", errors: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) }); return; }
    if (error.type === "entity.parse.failed") { res.status(400).json({ message: "Invalid JSON body" }); return; }
    if (error.type === "entity.too.large") { res.status(413).json({ message: "Request body exceeds 1 MB" }); return; }
    if (error.code === "P2025") { res.status(404).json({ message: "Record not found" }); return; }
    if (error.code === "P2002") { res.status(409).json({ message: "A record with these unique values already exists" }); return; }
    if (["P1000", "P1001", "P1002", "P1017", "P2021", "P2022", "ECONNREFUSED", "ETIMEDOUT", "28P01", "42P01"].includes(error.code) || error.name === "PrismaClientInitializationError") {
      res.status(503).json({ message: "Database unavailable. Check DATABASE_URL and apply the Prisma migrations." }); return;
    }
    console.error("API request failed:", error);
    res.status(500).json({ message: "Unable to complete the request" });
  };
  app.use(handler);
  return app;
}
