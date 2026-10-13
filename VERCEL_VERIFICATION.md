# Vercel deployment verification

The deployment fix removes the ambiguous Helmet default export and uses its named security-header middleware. The full existing header set is covered by a regression test.

The root `app.mjs` is a tracked JavaScript entry point. `npm run build` generates Prisma, compiles TypeScript using the project's own NodeNext configuration, and copies Swagger assets into `public/swagger`. Vercel then packages compiled JavaScript instead of type-checking the TypeScript source using a different module configuration.

Local verification used `@vercel/express@17.0.0` and `@vercel/node@22.0.0`, the builders included with Vercel CLI 62.7.0 from your deployment logs. The Express builder successfully ran the build, selected `app.mjs`, and produced a function with runtime `nodejs24.x`. Packaging checks confirmed the compiled application and generated Prisma client were present and the local `.env` was absent. Node 24 matches your Vercel project's configured major version.

Runtime checks exercise the exported deployment app, Swagger HTML and initialization, asset availability, security headers, and unauthorized API rejection. The backend API/authentication tests also pass.

This verifies the local Vercel builder and app, not a hosted deployment. Redeploy the updated repository. Configure `DATABASE_URL`, `CORS_ORIGIN`, `API_PUBLIC_URL`, and `NODE_ENV=production` in Vercel. Configure the dashboard's `API_INTERNAL_URL` with the deployed backend origin. The local environment file is not uploaded. Builds do not apply migrations or change administrator accounts.

Vercel's outer configuration schema requires `includeFiles` and `excludeFiles` to be strings, even though the underlying builder also accepts arrays. The configuration uses `includeFiles: "dist/**"` and one brace-expanded exclusion glob. The complete `vercel.json` is validated against the official remote schema, in addition to the builder packaging checks.
