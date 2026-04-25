/**
 * api/index.js — Vercel serverless function entry point.
 *
 * Vercel routes all /api/* requests here (see vercel.json rewrites).
 * It imports this file and calls the default export as an HTTP handler,
 * which is the Express app defined in server/index.js.
 *
 * This file is intentionally thin — all route logic lives in server/index.js
 * so the same code also runs as a normal Node process during local development.
 */
import app from '../server/index.js';
export default app;
