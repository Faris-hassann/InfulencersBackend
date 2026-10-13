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
npm run admin:create
npm run dev
```

Open http://localhost:4000 to enter Swagger. `/swagger` also opens the documentation; `/openapi.json` returns the specification. `/health` checks the database connection. Swagger remains available when the database is offline.

The included migrations create all six content/contact tables and the `admins` and `admin_sessions` tables. `db:deploy` applies them without resetting existing data. For later schema changes use `npx prisma migrate dev --name your_change`. Do not use the example database password for an actual database.

## Authentication and authorization

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the ignored backend `.env`, then run `npm run admin:create` after migrations. This creates the supplied administrator with a salted scrypt password hash and the `admin` role. The local configuration is already populated with the credentials you supplied, and that account has been created in your configured database. The bootstrap command preserves any existing account's password and access settings instead of resetting them. The bootstrap password can be removed from `.env` after creation; it is not required by the running server.

`POST /auth/login` accepts `{ email, password }`. Email matching is case-insensitive. Only enabled accounts with the `admin` role can sign in. Incorrect credentials produce a generic 401 response. Five invalid attempts from an IP trigger a 15-minute cooldown; throttling is process-local, so multiple server instances need a shared gateway limiter.

Login generates a random 256-bit session token and sets an eight-hour HttpOnly, SameSite Strict cookie named `iw_admin_session`. Only the token's SHA-256 hash is stored in PostgreSQL. Session state survives server restarts. `GET /auth/me` validates expiry, current role, and enabled status. `POST /auth/logout` deletes the current stored session and clears the cookie. Login rotates an existing session cookie. Expired sessions are rejected and cleaned up during successful logins.

Every `/api/*` endpoint requires authentication and the current `admin` role. Missing, forged, revoked, and expired sessions return 401. Disabled or non-admin identities return 403. Authenticated CMS responses are not cached. All non-read requests require `X-CMS-Request: 1`; when an Origin is present, it must match `CORS_ORIGIN` or `API_PUBLIC_URL`. Swagger adds this header automatically. Use Swagger's `/auth/login` endpoint first; the browser sends its issued cookie for later calls. Documentation and health remain public.

In production use HTTPS, `NODE_ENV=production`, and the actual `API_PUBLIC_URL`/`CORS_ORIGIN`. Production cookies use Secure automatically; `COOKIE_SECURE=true` enables it in other environments. The dashboard proxies API calls through its own origin. Configure CORS for that dashboard origin. The API does not trust client-supplied forwarded IP headers.

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

API tests exercise all six authenticated HTTP contracts using isolated in-memory test delegates. Authentication tests cover password hashing, unauthenticated access, role enforcement, disabled accounts, cookie settings, invalid credentials, throttling, session rotation, expiry, logout revocation, and CSRF checks. Production requests always use Prisma and PostgreSQL.

The Prisma adapter uses a pool of 10 connections with a connection timeout. Set `CORS_ORIGIN` to a comma-separated allowlist if the dashboard is hosted on another origin. `.env` is ignored by Git. No database connection is needed to generate the Prisma client or compile the application.

Dependency overrides pin patched `deepmerge-ts` and `mysql2` versions used by the Prisma tooling; Prisma generation and compilation are verified with those overrides.
