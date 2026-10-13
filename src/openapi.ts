import { resources } from "./resources.js";

const string = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const content = { title: string(250), description: { ...string(100000), description: "Sanitized Quill HTML" }, imageUrl: { ...string(2048), format: "uri" }, youtubeUrl: { ...string(2048), format: "uri", description: "YouTube HTTP(S) URL" }, publishedOn: { type: "string", format: "date-time" } };
const contact = { firstName: string(100), lastName: string(100), description: string(10000), email: { type: "string", format: "email", maxLength: 254 }, phoneNumber: string(32), createdOn: { type: "string", format: "date-time" } };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const errors = Object.fromEntries([400, 404, 409, 500, 503].map(code => [code, { description: ({ 400: "Validation error", 404: "Record not found", 409: "Conflict", 500: "Internal error", 503: "Database unavailable" } as Record<number,string>)[code], content: json(ref("Error")) }]));
const schemas: Record<string, unknown> = { Error: { type: "object", properties: { message: { type: "string" }, errors: { type: "array", items: { type: "object", properties: { field: { type: "string" }, message: { type: "string" } } } } } } };
const paths: Record<string, unknown> = {};
for (const resource of resources) {
  const properties = resource.model === "contact" ? contact : content;
  schemas[resource.schema] = { type: "object", required: ["id", ...Object.keys(properties)], properties: { id: { type: "integer", readOnly: true }, ...properties } };
  for (const method of ["Create", "Replace", "Patch"]) {
    schemas[`${resource.schema}${method}`] = { type: "object", additionalProperties: false, properties,
      required: method === "Patch" ? [] : Object.keys(properties).filter(key => !(resource.model === "contact" && method === "Create" && key === "createdOn")),
      ...(method === "Patch" ? { minProperties: 1 } : {}) };
  }
  const itemResponse = { description: "Record", content: json(ref(resource.schema)) };
  const body = (name: string) => ({ required: true, content: json(ref(name)) });
  paths[`/api/${resource.slug}`] = {
    get: { tags: [resource.name], summary: `List ${resource.name}`, parameters: [
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
      { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
      { name: "sortBy", in: "query", schema: { type: "string", enum: resource.model === "contact" ? ["id", "firstName", "lastName", "email", "createdOn"] : ["id", "title", "publishedOn"] } },
      { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
    ], responses: { 200: { description: "Paginated records", content: json({ type: "object", properties: { data: { type: "array", items: ref(resource.schema) }, pagination: { type: "object", properties: { page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } } } }) }, ...errors } },
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
paths["/api/summary"] = { get: { tags: ["Overview"], summary: "Record totals for all six sections", responses: { 200: { description: "Totals", content: json({ type: "object", properties: Object.fromEntries(resources.map(r => [r.slug, { type: "integer" }])) }) }, ...errors } } };
paths["/health"] = { get: { tags: ["Overview"], summary: "Database readiness", responses: { 200: { description: "Database connected" }, 503: { description: "Database unavailable" } } } };
export const openapi = { openapi: "3.0.3", info: { title: "Influencers World API", version: "1.0.0", description: "Content and contact management. POST creates, PUT replaces, PATCH updates selected fields. Descriptions contain sanitized Quill HTML except contacts, which use plain text." }, servers: [{ url: "/" }], tags: [{ name: "Overview" }, ...resources.map(r => ({ name: r.name }))], paths, components: { schemas } };
