/**
 * sheets.js — Google Sheets API client with in-memory cache.
 *
 * All functions are no-ops / throw if GOOGLE_SHEET_ID is not set;
 * callers should gate on isSheetsConfigured() before calling.
 */
import { google } from 'googleapis';

// ── Auth ───────────────────────────────────────────────────────────────────────
function makeAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // .env stores literal \n sequences; unescape them into real newlines for the PEM parser
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// Lazily initialised — never created if env vars are absent
let _client = null;
function client() {
  if (!_client) _client = google.sheets({ version: 'v4', auth: makeAuth() });
  return _client;
}

// ── Cache ──────────────────────────────────────────────────────────────────────
// Millisecond TTLs per sheet tab
const TTL = {
  Questions: 5 * 60_000,   // 5 min
  Tasks:     5 * 60_000,   // 5 min
  Schedule:      30_000,   // 30 s — schedule is time-sensitive
};

const cache = new Map(); // sheetName → { data: Object[], fetchedAt: number }

function isFresh(name) {
  const entry = cache.get(name);
  return entry && Date.now() - entry.fetchedAt < (TTL[name] ?? 60_000);
}

// ── getSheet ───────────────────────────────────────────────────────────────────
/**
 * Fetch all rows from a named tab, returned as an array of plain objects.
 * The header row becomes the object keys. Each object also carries _sheetRow
 * (1-based physical row in the spreadsheet) for write-back operations.
 *
 * Results are cached per TTL — subsequent calls within the window are free.
 *
 * @param {'Questions'|'Tasks'|'Schedule'} sheetName
 * @returns {Promise<Object[]>}
 */
export async function getSheet(sheetName) {
  if (isFresh(sheetName)) return cache.get(sheetName).data;

  const res = await client().spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetName,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const [header = [], ...dataRows] = res.data.values ?? [];

  const data = dataRows.map((row, i) => {
    const obj = {};
    header.forEach((col, j) => { obj[col] = row[j] ?? ''; });
    // Store the 1-based sheet row index so write-back doesn't need a second fetch
    obj._sheetRow = i + 2; // +1 for header, +1 for 0-index
    return obj;
  });

  cache.set(sheetName, { data, fetchedAt: Date.now() });
  return data;
}

// ── updateCell ─────────────────────────────────────────────────────────────────
/**
 * Write a single cell value and bust the cache for that sheet.
 *
 * @param {string} sheetName  e.g. 'Tasks'
 * @param {number} sheetRow   1-based row index (from record._sheetRow)
 * @param {string} colLetter  e.g. 'F'
 * @param {string} value
 */
export async function updateCell(sheetName, sheetRow, colLetter, value) {
  await client().spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${colLetter}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
  // Bust cache so the next GET reflects the new value
  cache.delete(sheetName);
}

// ── appendRow ──────────────────────────────────────────────────────────────────
/**
 * Append one row of values to a sheet tab. Used for the Results log.
 * Does not invalidate any cache (the Results tab is never fetched).
 *
 * @param {string}   sheetName  e.g. 'Results'
 * @param {string[]} values     Cell values in column order
 */
export async function appendRow(sheetName, values) {
  await client().spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetName,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

// ── clearCache ─────────────────────────────────────────────────────────────────
/**
 * Bust the in-memory cache for one sheet tab.
 * Call this after appendRow on data tabs (Questions, Tasks, Schedule) so the
 * next GET re-fetches fresh data instead of serving the stale pre-append copy.
 *
 * @param {string} sheetName  e.g. 'Questions'
 */
export function clearCache(sheetName) {
  cache.delete(sheetName);
}

// ── isSheetsConfigured ─────────────────────────────────────────────────────────
/**
 * Returns true only when all three required env vars are present.
 * Used by index.js to decide whether to call Sheets or fall back to CSV.
 */
export function isSheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}
