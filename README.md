# Influencers World API

Express 5, TypeScript, Prisma 7, and PostgreSQL. Node 22.12+ is required. The backend root URL redirects directly to Swagger.

## Setup

Run these commands in this folder:

```powershell
npm install
Copy-Item .env.example .env
# Edit .env and set your PostgreSQL DATABASE_URL.
npm run prisma:generate
npm run db:deploy
npm run dev
```

Open http://localhost:4000 to enter Swagger. `/swagger` also opens the documentation; `/openapi.json` returns the specification. `/health` checks the database connection. Swagger remains available when the database is offline.

The included initial migration creates all six tables. `db:deploy` applies it without resetting existing data. For later schema changes use `npm run db:migrate -- --name your_change`. Do not use the example password for an actual database.

## Routes

| Collection | Base URL | Prisma model | PostgreSQL table |
| --- | --- | --- | --- |
| Books | `/api/books` | Book | books |
| Podcasts | `/api/podcasts` | Podcast | podcasts |
| Tips & Tricks | `/api/tips-and-tricks` | Tip | tips_and_tricks |
| News | `/api/news` | News | news |
| News Letter | `/api/newsletters` | Newsletter | newsletters |
| Contact Us | `/api/contacts` | Contact | contacts |

Each base URL supports GET (list) and POST (create). Each `/{id}` URL supports GET (view), PUT (full replacement), PATCH (partial update), and DELETE. POST returns 201, DELETE returns 204, unknown records return 404, invalid inputs return 400, and unavailable databases return 503.

The JSON field names are camelCase. Content records contain `id`, `title`, `description`, `imageUrl`, `youtubeUrl`, `publishedOn`. Contact records contain `id`, `firstName`, `lastName`, `description`, `email`, `phoneNumber`, `createdOn`. IDs are generated; dates accept ISO 8601 date-time strings with an offset and are stored as PostgreSQL timezone-aware timestamps. `createdOn` can be omitted when creating a contact and defaults to now.

POST and PUT require all editable fields except the POST contact date. PATCH requires at least one editable field and preserves omitted fields. Unknown fields are rejected. Titles/names cannot be blank. Image URLs must use HTTP(S), video URLs must be on YouTube, and emails/phone numbers are validated. Content descriptions are sanitized Quill HTML; contact descriptions are plain text.

List parameters: `page` (default 1), `pageSize` (default 10, maximum 100), `search`, `sortBy`, `order` (`asc` or `desc`). Results are `{ data, pagination: { page, pageSize, total, totalPages } }`. Default sorting uses the record date descending, with ID as a stable tie-breaker. Search matches titles/descriptions or contact names/email/phone/message. `/api/summary` returns totals for all six collections. Dates are indexed. Concurrent inserts can make a list count and rows briefly differ because the two reads are independent.

## Commands

```powershell
npm test
npm run build
npm start
```

API tests exercise all six HTTP contracts using isolated in-memory test delegates; they do not replace PostgreSQL migration testing. Production requests always use Prisma and PostgreSQL. There is no authentication in this requested implementation; configure access control before exposing administration outside a trusted local environment. CORS allows the configured dashboard origins and is not authentication.

The Prisma adapter uses a pool of 10 connections with a connection timeout. Set `CORS_ORIGIN` to a comma-separated allowlist if the dashboard is hosted on another origin. `.env` is ignored by Git. No database connection is needed to generate the Prisma client or compile the application.

Dependency overrides pin patched `deepmerge-ts` and `mysql2` versions used by the Prisma tooling; Prisma generation and compilation are verified with those overrides.
