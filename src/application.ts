import express, { type ErrorRequestHandler, type Request, type Response, type RequestHandler } from "express";
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

function getAllowedSort(model: string): string[] {
  if (model === "contact") return ["id", "firstName", "firstNameAr", "lastName", "lastNameAr", "email", "createdOn"];
  if (model === "articleCategory") return ["id", "nameEn", "nameAr", "createdOn"];
  if (model === "article") return ["id", "titleEn", "titleAr", "publishedOn", "articleCategoryId"];
  if (model === "award") return ["id", "titleEn", "titleAr", "publishedOn"];
  return ["id", "title", "titleAr", "publishedOn"];
}

function getSearchFields(model: string): string[] {
  if (model === "contact") return ["firstName", "firstNameAr", "lastName", "lastNameAr", "email", "description", "descriptionAr", "phoneNumber"];
  if (model === "articleCategory") return ["nameEn", "nameAr", "descriptionEn", "descriptionAr"];
  if (model === "article" || model === "award") return ["titleEn", "titleAr", "descriptionEn", "descriptionAr"];
  return ["title", "titleAr", "description", "descriptionAr"];
}

export function createApp(db: Database) {
  const app = express();
  app.disable("x-powered-by");
  // Named middleware exports avoid Helmet's ambiguous CJS/ESM default type.
  // This is the same default header set as helmet({ contentSecurityPolicy: false }).
  app.use(crossOriginOpenerPolicy(), crossOriginResourcePolicy(), originAgentCluster(), referrerPolicy(), strictTransportSecurity(), xContentTypeOptions(), xDnsPrefetchControl(), xDownloadOptions(), xFrameOptions(), xPermittedCrossDomainPolicies(), xPoweredBy(), xXssProtection());
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    ...(process.env.CORS_ORIGIN ?? "").split(",").map(value => value.trim()).filter(Boolean),
  ];
  app.use(cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
  }));
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
  const adminGuard: RequestHandler[] = [auth.authenticate, auth.csrf];
  app.use("/auth", auth.router);
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/api/summary", ...adminGuard, async (_req: Request, res: Response) => {
    const totals = await Promise.all(resources.map(async resource => [resource.slug, await db[resource.model].count()]));
    res.json(Object.fromEntries(totals));
  });
  for (const resource of resources) {
    const route = `/api/${resource.slug}`;
    const delegate = db[resource.model];
    const allowed = getAllowedSort(resource.model);
    const searchFields = getSearchFields(resource.model);

    // Contacts list is private to admin; public content lists are accessible to all visitors
    const listGuards: RequestHandler[] = resource.model === "contact" ? adminGuard : [];
    app.get(route, ...listGuards, async (req: Request, res: Response) => {
      const { page, pageSize, search, sortBy, order, filter } = querySchema.parse(req.query);
      const sort = sortBy ?? resource.date;
      if (!allowed.includes(sort)) { res.status(400).json({ message: "Invalid sort field for this section" }); return; }

      const searchConditions = search ? searchFields.map(field => ({ [field]: { contains: search, mode: "insensitive" } })) : null;
      let where: any = {};
      if (searchConditions && filter) {
        where = { AND: [{ OR: searchConditions }, filter] };
      } else if (searchConditions) {
        where = { OR: searchConditions };
      } else if (filter) {
        where = filter;
      }

      const findArgs: any = {
        where,
        orderBy: sort === "id" ? [{ id: order }] : [{ [sort]: order }, { id: order }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      };
      if (resource.model === "article") {
        findArgs.include = { articleCategory: true };
      }

      const [data, total] = await Promise.all([
        delegate.findMany(findArgs),
        delegate.count({ where }),
      ]);
      res.json({ data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    });

    // POST /api/contacts is public (website contact inquiry form); other creations require admin
    const createGuards: RequestHandler[] = resource.model === "contact" ? [] : adminGuard;
    app.post(route, ...createGuards, async (req: Request, res: Response) => {
      const data = bodySchema(resource.model, "POST").parse(req.body);
      const record = await delegate.create({ data });
      res.status(201).location(`${route}/${record.id}`).json(record);
    });

    // Single item view: contacts require admin; content items are public
    const itemGuards: RequestHandler[] = resource.model === "contact" ? adminGuard : [];
    app.get(`${route}/:id`, ...itemGuards, async (req: Request, res: Response) => {
      const id = idSchema.parse(req.params.id);
      const findArgs: any = { where: { id } };
      if (resource.model === "article") {
        findArgs.include = { articleCategory: true };
      }
      const record = await delegate.findUnique(findArgs);
      if (!record) { res.status(404).json({ message: "Record not found" }); return; }
      res.json(record);
    });

    for (const method of ["put", "patch"] as const) {
      app[method](`${route}/:id`, ...adminGuard, async (req: Request, res: Response) => {
        const id = idSchema.parse(req.params.id);
        const data = bodySchema(resource.model, method === "put" ? "PUT" : "PATCH").parse(req.body);
        const updateArgs: any = { where: { id }, data };
        if (resource.model === "article") {
          updateArgs.include = { articleCategory: true };
        }
        res.json(await delegate.update(updateArgs));
      });
    }

    app.delete(`${route}/:id`, ...adminGuard, async (req: Request, res: Response) => {
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
