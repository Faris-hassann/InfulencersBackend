import { z } from "zod";
import sanitizeHtml from "sanitize-html";

export function cleanRichText(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "blockquote", "pre", "code", "ol", "ul", "li", "a", "span", "div", "sub", "sup"],
    allowedAttributes: { a: ["href", "target", "rel"], "*": ["class", "data-list"] },
    allowedClasses: { "*": ["ql-align-*", "ql-indent-*", "ql-direction-rtl", "ql-syntax", "ql-code-block", "ql-code-block-container", "ql-font-*", "ql-size-*"] },
    allowedSchemes: ["https", "http", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }) },
  });
}
const text = (max: number) => z.string().trim().min(1, "This field is required").max(max);
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const url = z.string().trim().max(2048).refine(value => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}, "Enter an HTTP or HTTPS URL");
const youtube = url.refine(value => {
  const host = new URL(value).hostname.toLowerCase();
  return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host);
}, "Enter a YouTube URL");
const richDescription = text(100000).transform(cleanRichText).refine(value => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim().length > 0, "Write a description");
const contentFields = { title: text(250), description: richDescription, imageUrl: url, youtubeUrl: youtube, publishedOn: date };
const contactFields = { firstName: text(100), lastName: text(100), description: text(10000), email: z.email().max(254), phoneNumber: text(32).regex(/^[+\d][\d\s().-]{4,31}$/, "Enter a valid phone number"), createdOn: date };

export function bodySchema(contact: boolean, method: "POST" | "PUT" | "PATCH") {
  const full = z.strictObject(contact ? contactFields : contentFields);
  if (method === "PATCH") return full.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field to update");
  if (contact && method === "POST") return z.strictObject({ ...contactFields, createdOn: date.optional() });
  return full;
}
export const idSchema = z.coerce.number().int().positive().max(2147483647);
export const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).default(""),
  sortBy: z.enum(["id", "title", "publishedOn", "createdOn", "firstName", "lastName", "email"]).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});
