export const resources = [
  { slug: "books", model: "book", name: "Books", schema: "Book", date: "publishedOn" },
  { slug: "podcasts", model: "podcast", name: "Podcasts", schema: "Podcast", date: "publishedOn" },
  { slug: "tips-and-tricks", model: "tip", name: "Tips & Tricks", schema: "Tip", date: "publishedOn" },
  { slug: "news", model: "news", name: "News", schema: "News", date: "publishedOn" },
  { slug: "newsletters", model: "newsletter", name: "News Letter", schema: "Newsletter", date: "publishedOn" },
  { slug: "contacts", model: "contact", name: "Contact Us", schema: "Contact", date: "createdOn" },
] as const;
