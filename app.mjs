import express from "express";
import application from "./dist/app.js";

// Vercel's root entry point consumes the JavaScript produced by npm run build.
// It does not run a second, differently configured TypeScript compilation.
const app = express();
app.disable("x-powered-by");
app.use(application);
export default app;
