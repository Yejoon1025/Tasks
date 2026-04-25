/**
 * API_BASE — base URL prepended to every /api fetch call.
 *
 * Dev:  '' (empty) → Vite proxy forwards /api/* to localhost:3001
 * Prod: 'https://your-app.onrender.com' → direct HTTPS to Render
 *
 * Set VITE_API_BASE as a GitHub repository secret; it gets injected at
 * build time by the GitHub Actions workflow. Leave it unset locally.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
