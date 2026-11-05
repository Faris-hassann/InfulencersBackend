import { resources } from "./resources.js";

const string = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const content = {
  title: string(250),
  titleAr: { type: "string", maxLength: 250, nullable: true },
  description: { ...string(100000), description: "Sanitized Quill HTML" },
  descriptionAr: { type: "string", maxLength: 100000, description: "Sanitized Quill HTML", nullable: true },
  imageUrl: { ...string(2048), format: "uri" },
  youtubeUrl: { type: "string", maxLength: 2048, format: "uri", description: "YouTube HTTP(S) URL", nullable: true },
  publishedOn: { type: "string", format: "date-time" },
};
const contact = {
  firstName: string(100),
  firstNameAr: { type: "string", maxLength: 100, nullable: true },
  lastName: string(100),
  lastNameAr: { type: "string", maxLength: 100, nullable: true },
  description: string(10000),
  descriptionAr: { type: "string", maxLength: 10000, nullable: true },
  email: { type: "string", format: "email", maxLength: 254 },
  phoneNumber: string(32),
  createdOn: { type: "string", format: "date-time" },
};
const articleCategory = {
  nameEn: string(250),
  nameAr: string(250),
  descriptionEn: { ...string(100000), description: "Sanitized Quill HTML" },
  descriptionAr: { ...string(100000), description: "Sanitized Quill HTML" },
  createdOn: { type: "string", format: "date-time" },
};
const article = {
  titleEn: string(250),
  titleAr: string(250),
  descriptionEn: { ...string(100000), description: "Sanitized Quill HTML" },
  descriptionAr: { ...string(100000), description: "Sanitized Quill HTML" },
  articleCategoryId: { type: "integer", nullable: true },
  imageUrls: { type: "array", items: { ...string(2048), format: "uri" } },
  publishedOn: { type: "string", format: "date-time" },
};
const award = {
  titleEn: string(250),
  titleAr: string(250),
  descriptionEn: { ...string(100000), description: "Sanitized Quill HTML" },
  descriptionAr: { ...string(100000), description: "Sanitized Quill HTML" },
  imageUrls: { type: "array", items: { ...string(2048), format: "uri" } },
  publishedOn: { type: "string", format: "date-time" },
};

function getPropertiesForModel(model: string): Record<string, unknown> {
  if (model === "contact") return contact;
  if (model === "articleCategory") return articleCategory;
  if (model === "article") return article;
  if (model === "award") return award;
  return content;
}

function getSortEnumForModel(model: string): string[] {
  if (model === "contact") return ["id", "firstName", "firstNameAr", "lastName", "lastNameAr", "email", "createdOn"];
  if (model === "articleCategory") return ["id", "nameEn", "nameAr", "createdOn"];
  if (model === "article") return ["id", "titleEn", "titleAr", "publishedOn", "articleCategoryId"];
  if (model === "award") return ["id", "titleEn", "titleAr", "publishedOn"];
  return ["id", "title", "titleAr", "publishedOn"];
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const errors = Object.fromEntries([400, 401, 403, 404, 409, 429, 500, 503].map(code => [code, { description: ({ 400: "Validation error", 401: "Sign in required", 403: "Admin access or request origin rejected", 404: "Record not found", 409: "Conflict", 429: "Too many sign-in attempts", 500: "Internal error", 503: "Database unavailable" } as Record<number,string>)[code], content: json(ref("Error")) }]));
const schemas: Record<string, unknown> = { Error: { type: "object", properties: { message: { type: "string" }, errors: { type: "array", items: { type: "object", properties: { field: { type: "string" }, message: { type: "string" } } } } } } };
const paths: Record<string, unknown> = {};

for (const resource of resources) {
  const properties = getPropertiesForModel(resource.model);
  const requiredKeys = Object.keys(properties).filter(key => {
    if (["titleAr", "descriptionAr", "firstNameAr", "lastNameAr", "youtubeUrl", "articleCategoryId", "imageUrls"].includes(key)) return false;
    return true;
  });
  schemas[resource.schema] = { type: "object", required: ["id", ...requiredKeys], properties: { id: { type: "integer", readOnly: true }, ...properties } };

  for (const method of ["Create", "Replace", "Patch"]) {
    schemas[`${resource.schema}${method}`] = {
      type: "object",
      additionalProperties: false,
      properties,
      required: method === "Patch" ? [] : requiredKeys.filter(key => !(method === "Create" && (key === "createdOn" || key === "publishedOn"))),
      ...(method === "Patch" ? { minProperties: 1 } : {}),
    };
  }
  const itemResponse = { description: "Record", content: json(ref(resource.schema)) };
  const body = (name: string) => ({ required: true, content: json(ref(name)) });
  paths[`/api/${resource.slug}`] = {
    get: {
      tags: [resource.name],
      summary: `List ${resource.name}`,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
        { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
        { name: "sortBy", in: "query", schema: { type: "string", enum: getSortEnumForModel(resource.model) } },
        { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        { name: "filter", in: "query", description: "JSON dynamic filter object", schema: { type: "string" } },
      ],
      responses: {
        200: {
          description: "Paginated records",
          content: json({
            type: "object",
            properties: {
              data: { type: "array", items: ref(resource.schema) },
              pagination: { type: "object", properties: { page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } },
            },
          }),
        },
        ...errors,
      },
    },
    post: { tags: [resource.name], summary: `Create ${resource.schema}`, requestBody: body(`${resource.schema}Create`), responses: { 201: itemResponse, ...errors } },
  };
  paths[`/api/${resource.slug}/{id}`] = {
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    get: { tags: [resource.name], summary: `View ${resource.schema}`, responses: { 200: itemResponse, ...errors } },
    put: { tags: [resource.name], summary: "Replace all editable fields", requestBody: body(`${resource.schema}Replace`), responses: { 200: itemResponse, ...errors } },
    patch: { tags: [resource.name], summary: "Update only supplied fields", requestBody: body(`${resource.schema}Patch`), responses: { 200: itemResponse, ...errors } },
    delete: { tags: [resource.name], summary: `Delete ${resource.schema}`, responses: { 204: { description: "Deleted" }, ...errors } },
  };
}

paths["/api/summary"] = { get: { tags: ["Overview"], summary: "Record totals for all sections", responses: { 200: { description: "Totals", content: json({ type: "object", properties: Object.fromEntries(resources.map(r => [r.slug, { type: "integer" }])) }) }, ...errors } } };
paths["/health"] = { get: { security: [], tags: ["Overview"], summary: "Database readiness", responses: { 200: { description: "Database connected" }, 503: { description: "Database unavailable" } } } };
schemas.AdminUser = { type: "object", properties: { id: { type: "integer" }, email: { type: "string", format: "email" }, role: { type: "string", enum: ["admin"] } } };
const authResponse = { description: "Administrator session", content: json({ type: "object", properties: { user: ref("AdminUser"), expiresOn: { type: "string", format: "date-time" } } }) };
paths["/auth/login"] = { post: { security: [], tags: ["Authentication"], summary: "Sign in as administrator", description: "Sets an HttpOnly session cookie. Use this endpoint first; Swagger sends the cookie and X-CMS-Request header automatically. Invalid attempts are throttled.", requestBody: { required: true, content: json({ type: "object", additionalProperties: false, required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password", maxLength: 256 } } }) }, responses: { 200: authResponse, ...errors } } };
paths["/auth/me"] = { get: { tags: ["Authentication"], summary: "Check session and administrator role", responses: { 200: authResponse, ...errors } } };
paths["/auth/logout"] = { post: { security: [], tags: ["Authentication"], summary: "Revoke current session and clear the cookie", responses: { 204: { description: "Signed out" }, ...errors } } };

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Influencers World CMS API",
    version: "2.0.0",
    description: "Administrator-only content and contact management. Sign in with /auth/login before using CMS operations. Mutating requests require X-CMS-Request: 1 and an allowed Origin when supplied. Swagger adds the header automatically. POST creates, PUT replaces, PATCH updates selected fields. Content descriptions are sanitized Quill HTML; contacts use plain text.",
  },
  servers: [{ url: "/" }],
  security: [{ adminSession: [] }],
  tags: [{ name: "Authentication" }, { name: "Overview" }, ...resources.map(r => ({ name: r.name }))],
  paths,
  components: {
    schemas,
    securitySchemes: {
      adminSession: {
        type: "apiKey",
        in: "cookie",
        name: "iw_admin_session",
        description: "HttpOnly session issued by /auth/login. Sign in using the login endpoint; do not paste a token into this dialog.",
      },
    },
  },
};
