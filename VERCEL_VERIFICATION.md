# Vercel deployment verification

The October 14 startup logs exposed another failure: `sanitize-html` requires the ESM-only `htmlparser2` 12, resulting in `ERR_REQUIRE_ESM` when `require(ESM)` is disabled. This was reproduced locally with `node --no-experimental-require-module`. The build now bundles `src/validation.ts` and its sanitizer dependencies with esbuild into `dist/validation.js`, preserving current dependency versions and security fixes. `zod` stays external; Node built-in CommonJS imports use `createRequire`.

Verification for this fix: `npm run build`, all 21 API/authentication tests, and `npm run test:runtime` pass. The runtime test also passes on Node 24. It imports the real `app.mjs` with `require(ESM)` disabled, verifies `/` redirects to Swagger, checks documentation and asset responses, and exercises rich-text sanitization with a dummy database URL. No database connection is opened. This fix has not been deployed to Vercel.

The deployment fix removes the ambiguous Helmet default export and uses its named security-header middleware. The full existing header set is covered by a regression test.

The root `app.mjs` is a tracked JavaScript entry point. `npm run build` generates Prisma, compiles TypeScript using the project's own NodeNext configuration, and copies Swagger assets into `public/swagger`. Vercel then packages compiled JavaScript instead of type-checking the TypeScript source using a different module configuration.

Local verification used `@vercel/express@17.0.0` and `@vercel/node@22.0.0`, the builders included with Vercel CLI 62.7.0 from your deployment logs. The Express builder successfully ran the build, selected `app.mjs`, and produced a function with runtime `nodejs24.x`. Packaging checks confirmed the compiled application and generated Prisma client were present and the local `.env` was absent. Node 24 matches your Vercel project's configured major version.

Runtime checks exercise the exported deployment app, Swagger HTML and initialization, asset availability, security headers, and unauthorized API rejection. The backend API/authentication tests also pass.

This verifies the local Vercel builder and app, not a hosted deployment. Redeploy the updated repository. Configure `DATABASE_URL`, `CORS_ORIGIN`, `API_PUBLIC_URL`, and `NODE_ENV=production` in Vercel. Configure the dashboard's `API_INTERNAL_URL` with the deployed backend origin. The local environment file is not uploaded. Builds do not apply migrations or change administrator accounts.

Vercel's outer configuration schema requires `includeFiles` and `excludeFiles` to be strings, even though the underlying builder also accepts arrays. The configuration uses `includeFiles: "{dist/**,public/**}"` and one brace-expanded exclusion glob. Earlier configuration revisions were validated against the official schema, in addition to the earlier builder packaging checks.

The repeated `/favicon.ico` and `/favicon.png` errors in the supplied logs have the same sanitizer startup cause. The Vercel favicon is now checked in at `public/favicon.ico`, linked from Swagger, and explicitly included in the function package. Express serves `/favicon.ico` and redirects `/favicon.png` to it. The production runtime test passes on Node 24 with `require(ESM)` disabled and verifies the Swagger favicon link, ICO response/signature, and PNG redirect. Redeployment is still required to update the hosted site.

The live Swagger page subsequently returned 200 HTML for `swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`, and `swagger-ui.css`, explaining the blank browser page. The function now explicitly includes `public/**` and serves the copied assets through Express. The HTML handler matches only the Swagger root, preventing missing asset requests from returning HTML. The runtime regression test simulates unavailable dependency assets and verifies correct MIME types and exact contents for all three files, plus a 404 for missing assets.
