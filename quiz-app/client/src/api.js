/**
 * API_BASE — base URL prepended to every /api fetch call.
 *
 * Dev:        '' (empty) → Vite proxy forwards /api/* to localhost:3001
 * Production: '' (empty) → Vercel serves frontend and API on the same domain,
 *             so /api/* resolves to the same origin with no prefix needed.
 *
 * VITE_API_BASE can be set if the API is ever hosted on a separate domain,
 * but for the current Vercel deployment it is left unset (defaults to '').
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
