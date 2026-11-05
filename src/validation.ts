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
const optionalText = (max: number) => z.preprocess(
  value => (value === "" || value === undefined ? null : typeof value === "string" ? value.trim() : value),
  z.string().max(max).nullable().optional()
);

const date = z.iso.datetime({ offset: true }).transform(value => new Date(value));

const url = z.string().trim().max(2048).refine(value => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}, "Enter an HTTP or HTTPS URL");

const youtube = url.refine(value => {
  const host = new URL(value).hostname.toLowerCase();
  return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host);
}, "Enter a YouTube URL");

const optionalYoutube = z.preprocess(
  value => (value === "" || value === undefined ? null : value),
  youtube.nullable().optional()
);

const richDescription = text(100000).transform(cleanRichText).refine(
  value => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim().length > 0,
  "Write a description"
);

const optionalRichDescription = z.preprocess(
  value => {
    if (value === "" || value === undefined || value === null) return null;
    return typeof value === "string" ? cleanRichText(value) : value;
  },
  z.string().max(100000).refine(
    value => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim().length > 0,
    "Write a description"
  ).nullable().optional()
);

const imageUrlsSchema = z.preprocess(
  value => {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" && item.trim().length > 0);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  },
  z.array(url).default([])
);

export const contentFields = {
  title: text(250),
  titleAr: optionalText(250),
  description: richDescription,
  descriptionAr: optionalRichDescription,
  imageUrl: url,
  youtubeUrl: optionalYoutube,
  publishedOn: date,
};

export const contactFields = {
  firstName: text(100),
  firstNameAr: optionalText(100),
  lastName: text(100),
  lastNameAr: optionalText(100),
  description: text(10000),
  descriptionAr: optionalText(10000),
  email: z.string().trim().email().max(254),
  phoneNumber: text(32).regex(/^[+\d][\d\s().-]{4,31}$/, "Enter a valid phone number"),
  createdOn: date,
};

export const articleCategoryFields = {
  nameEn: text(250),
  nameAr: text(250),
  descriptionEn: richDescription,
  descriptionAr: richDescription,
  createdOn: date,
};

export const articleFields = {
  titleEn: text(250),
  titleAr: text(250),
  descriptionEn: richDescription,
  descriptionAr: richDescription,
  articleCategoryId: z.preprocess(
    value => (value === "" || value === undefined || value === null ? null : Number(value)),
    z.number().int().positive().nullable().optional()
  ),
  imageUrls: imageUrlsSchema,
  publishedOn: date,
};

export const awardFields = {
  titleEn: text(250),
  titleAr: text(250),
  descriptionEn: richDescription,
  descriptionAr: richDescription,
  imageUrls: imageUrlsSchema,
  publishedOn: date,
};

export function getFieldsForModel(model: string): Record<string, z.ZodTypeAny> {
  if (model === "contact") return contactFields;
  if (model === "articleCategory") return articleCategoryFields;
  if (model === "article") return articleFields;
  if (model === "award") return awardFields;
  return contentFields;
}

export function bodySchema(modelOrContact: string | boolean, method: "POST" | "PUT" | "PATCH") {
  const model = typeof modelOrContact === "boolean" ? (modelOrContact ? "contact" : "book") : modelOrContact;
  const fields = getFieldsForModel(model);
  const full = z.strictObject(fields);

  if (method === "PATCH") {
    return full.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field to update");
  }

  if (method === "POST") {
    if (model === "contact" || model === "articleCategory") {
      return z.strictObject({ ...fields, createdOn: date.optional() });
    }
    if (model === "article" || model === "award") {
      return z.strictObject({ ...fields, publishedOn: date.optional() });
    }
  }

  return full;
}

export const idSchema = z.coerce.number().int().positive().max(2147483647);

export const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).default(""),
  sortBy: z.string().trim().max(50).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  filter: z.string().trim().optional().superRefine((val, ctx) => {
    if (!val) return;
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        ctx.addIssue({ code: "custom", message: "Filter must be a JSON object" });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid filter JSON" });
    }
  }).transform(val => {
    if (!val) return undefined;
    try {
      return JSON.parse(val) as Record<string, any>;
    } catch {
      return undefined;
    }
  }),
});
