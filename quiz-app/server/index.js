/**
 * server/index.js — Express API server.
 *
 * All data is backed by Google Sheets via sheets.js.  When the three required
 * Google env vars are absent the server falls back to plain CSV files under
 * server/data/ (useful for offline development without a Sheets account).
 *
 * Sheet column layout (id column has been removed from all tabs):
 *
 *   Questions:  A=front  B=back  C=type  D=time_spent_min  E=result
 *   Tasks:      A=front  B=back  C=type  D=due_date  E=time_spent_min  F=result
 *   Warmup:     A=front  B=back  C=last_completed
 *   Schedule:   A=time   B=front  C=duration_min  D=type  E=date
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 *  GET  /api/questions              → array of question objects (each with _sheetRow)
 *  POST /api/questions              → append a new question row; returns { persisted }
 *  PATCH /api/questions/:row        → accumulate time_spent_min (col D); optionally write result (col E)
 *
 *  GET  /api/tasks                  → array of task objects (each with _sheetRow)
 *  POST /api/tasks                  → append a new task row; returns { persisted }
 *  PATCH /api/tasks/:row            → accumulate time_spent_min (col E); optionally write result (col F)
 *
 *  GET  /api/schedule               → array of schedule event objects (each with _sheetRow)
 *  POST /api/schedule               → append a new schedule event; returns { persisted }
 *
 *  GET  /api/warmup                 → array of warmup task objects (each with _sheetRow)
 *  PATCH /api/warmup/:row           → write last_completed date (col C)
 *
 *
 * Deployment
 * ─────────────────────────────────────────────────────────────────────────────
 *  Local dev:  node server/index.js  (or via `npm run server` from quiz-app/)
 *  Vercel:     api/index.js imports this file and exports `app` as the handler.
 *              app.listen() is skipped when process.env.VERCEL is set.
 */
import { config as dotenvConfig } from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createReadStream, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { parse } from 'csv-parse';

// Load .env from the project root (one level above server/).
// Called in the module body — by the time any request handler calls
// isSheetsConfigured() or getSheet(), process.env is already populated.
const __here = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__here, '..', '.env') });

import {
  getSheet,
  updateCell,
  appendRow,
  clearCache,
  isSheetsConfigured,
} from './sheets.js';

const __dirname = __here;  // reuse the dirname computed for dotenv above

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Escape one field for CSV: wrap in quotes if it contains commas, quotes, or newlines. */
function csvField(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

/**
 * Stream a CSV file and respond with its rows as a JSON array.
 * Attaches _sheetRow to each record (matching the Google Sheets convention:
 * row 1 = header, first data row = 2, second = 3, etc.) so that PATCH
 * endpoints work the same way in CSV mode and Sheets mode.
 */
function respondWithCsv(res, csvPath, label) {
  const records = [];
  createReadStream(csvPath)
    .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
    .on('data',  (row) => records.push(row))
    .on('error', (err) => {
      console.error(`CSV parse error (${label}):`, err);
      res.status(500).json({ error: `Failed to read ${label}.` });
    })
    .on('end', () => {
      // i + 2: +1 for 0-based index, +1 for header row
      const withRows = records.map((r, i) => ({ ...r, _sheetRow: i + 2 }));
      res.json(withRows);
    });
}

// ── GET /api/questions ─────────────────────────────────────────────────────────
app.get('/api/questions', async (req, res) => {
  if (isSheetsConfigured()) {
    try {
      return res.json(await getSheet('Questions'));
    } catch (err) {
      console.error('Sheets error (Questions):', err.message);
      return res.status(500).json({ error: 'Failed to read Questions sheet.' });
    }
  }
  respondWithCsv(res, join(__dirname, 'data', 'questions.csv'), 'question bank');
});

// ── POST /api/questions ────────────────────────────────────────────────────────
// Append a new flashcard row.
// Questions sheet columns: A=front  B=back  C=type  D=time_spent_min  E=result
app.post('/api/questions', async (req, res) => {
  const { front, back, type } = req.body;
  if (!front || !type)
    return res.status(400).json({ error: 'front and type are required.' });

  const row = [String(front), String(back ?? ''), String(type), 0, ''];

  if (!isSheetsConfigured()) {
    const line = row.map(csvField).join(',') + '\n';
    appendFileSync(join(__dirname, 'data', 'questions.csv'), line);
    return res.json({ persisted: false });
  }

  try {
    await appendRow('Questions', row);
    clearCache('Questions');   // bust cache so next GET returns the new row
    res.json({ persisted: true });
  } catch (err) {
    console.error('Sheets write error (add question):', err.message);
    res.status(500).json({ error: 'Failed to add question.' });
  }
});

// ── PATCH /api/questions/:row ─────────────────────────────────────────────────
// Accumulate time_spent_min (col D) and/or write result (col E).
// :row is the 1-based physical sheet row number (_sheetRow from the client).
// Questions sheet columns: A=front  B=back  C=type  D=time_spent_min  E=result
app.patch('/api/questions/:row', async (req, res) => {
  const row              = parseInt(req.params.row, 10);
  const { minutes, result } = req.body;

  if (!isSheetsConfigured())
    return res.json({ row, persisted: false });

  try {
    const questions = await getSheet('Questions');
    const question  = questions.find(q => q._sheetRow === row);
    if (!question) return res.status(404).json({ error: `Row ${row} not found.` });

    if (minutes > 0) {
      const current = parseFloat(question.time_spent_min) || 0;
      const updated = Math.round((current + minutes) * 10) / 10;
      await updateCell('Questions', row, 'D', updated);
    }

    if (result !== undefined) {
      await updateCell('Questions', row, 'E', result);
    }

    res.json({ row, persisted: true });
  } catch (err) {
    console.error('Sheets write error (question):', err.message);
    res.status(500).json({ error: 'Failed to update question.' });
  }
});

// ── GET /api/tasks ─────────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  if (isSheetsConfigured()) {
    try {
      return res.json(await getSheet('Tasks'));
    } catch (err) {
      console.error('Sheets error (Tasks):', err.message);
      return res.status(500).json({ error: 'Failed to read Tasks sheet.' });
    }
  }
  respondWithCsv(res, join(__dirname, 'data', 'tasks.csv'), 'tasks');
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────
// Append a new task row.
// Tasks sheet columns: A=front  B=back  C=type  D=due_date  E=time_spent_min  F=result
app.post('/api/tasks', async (req, res) => {
  const { front, back, type, due_date } = req.body;
  if (!front)
    return res.status(400).json({ error: 'front is required.' });

  const row = [String(front), String(back ?? ''), String(type ?? ''), String(due_date ?? ''), 0, ''];

  if (!isSheetsConfigured()) {
    const line = row.map(csvField).join(',') + '\n';
    appendFileSync(join(__dirname, 'data', 'tasks.csv'), line);
    return res.json({ persisted: false });
  }

  try {
    await appendRow('Tasks', row);
    clearCache('Tasks');
    res.json({ persisted: true });
  } catch (err) {
    console.error('Sheets write error (add task):', err.message);
    res.status(500).json({ error: 'Failed to add task.' });
  }
});

// ── PATCH /api/tasks/:row ──────────────────────────────────────────────────────
// Accumulate time_spent_min (col E) and/or write result (col F).
// :row is the 1-based physical sheet row number (_sheetRow from the client).
// Tasks sheet columns: A=front  B=back  C=type  D=due_date  E=time_spent_min  F=result
app.patch('/api/tasks/:row', async (req, res) => {
  const row                        = parseInt(req.params.row, 10);
  const { result, time_spent_min } = req.body;

  if (!isSheetsConfigured()) {
    return res.json({ row, persisted: false });
  }

  try {
    const tasks = await getSheet('Tasks');
    const task  = tasks.find(t => t._sheetRow === row);
    if (!task) return res.status(404).json({ error: `Row ${row} not found.` });

    if (time_spent_min > 0) {
      const current = parseFloat(task.time_spent_min) || 0;
      const updated = Math.round((current + time_spent_min) * 10) / 10;
      await updateCell('Tasks', row, 'E', updated);
    }

    if (result !== undefined) {
      await updateCell('Tasks', row, 'F', result);
    }

    res.json({ row, persisted: true });
  } catch (err) {
    console.error('Sheets write error (task):', err.message);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// ── GET /api/schedule ──────────────────────────────────────────────────────────
app.get('/api/schedule', async (req, res) => {
  if (isSheetsConfigured()) {
    try {
      return res.json(await getSheet('Schedule'));
    } catch (err) {
      console.error('Sheets error (Schedule):', err.message);
      return res.status(500).json({ error: 'Failed to read Schedule sheet.' });
    }
  }
  respondWithCsv(res, join(__dirname, 'data', 'schedule.csv'), 'schedule');
});

// ── POST /api/schedule ────────────────────────────────────────────────────────
// Append a new schedule event.
// Schedule sheet columns: A=time  B=front  C=duration_min  D=type  E=date
app.post('/api/schedule', async (req, res) => {
  const { time, front, duration_min, type, date } = req.body;
  if (!time || !front)
    return res.status(400).json({ error: 'time and front are required.' });

  // date is optional — empty string means the event recurs every day
  const row = [String(time), String(front), Number(duration_min) || 30, String(type ?? ''), String(date ?? '')];

  if (!isSheetsConfigured()) {
    const line = row.map(csvField).join(',') + '\n';
    appendFileSync(join(__dirname, 'data', 'schedule.csv'), line);
    return res.json({ persisted: false });
  }

  try {
    await appendRow('Schedule', row);
    clearCache('Schedule');
    res.json({ persisted: true });
  } catch (err) {
    console.error('Sheets write error (add schedule):', err.message);
    res.status(500).json({ error: 'Failed to add schedule event.' });
  }
});

// ── GET /api/warmup ────────────────────────────────────────────────────────────
app.get('/api/warmup', async (req, res) => {
  if (isSheetsConfigured()) {
    try {
      return res.json(await getSheet('Warmup'));
    } catch (err) {
      console.error('Sheets error (Warmup):', err.message);
      return res.status(500).json({ error: 'Failed to read Warmup sheet.' });
    }
  }
  respondWithCsv(res, join(__dirname, 'data', 'warmup.csv'), 'warmup');
});

// ── PATCH /api/warmup/:row ─────────────────────────────────────────────────────
// Mark a warmup task complete: write last_completed date to column C.
// :row is the 1-based physical sheet row number (_sheetRow from the client).
// Warmup sheet columns: A=front  B=back  C=last_completed
app.patch('/api/warmup/:row', async (req, res) => {
  const row   = parseInt(req.params.row, 10);
  // Prefer the client-sent local date so the stored value matches what the
  // client compares against (local YYYY-MM-DD, not server UTC).
  const today = req.body.date || new Date().toISOString().slice(0, 10);

  if (!isSheetsConfigured()) {
    return res.json({ row, last_completed: today, persisted: false });
  }

  try {
    const tasks = await getSheet('Warmup');
    const task  = tasks.find(t => t._sheetRow === row);
    if (!task) return res.status(404).json({ error: `Row ${row} not found.` });

    await updateCell('Warmup', row, 'C', today);
    res.json({ row, last_completed: today, persisted: true });
  } catch (err) {
    console.error('Sheets write error (warmup):', err.message);
    res.status(500).json({ error: 'Failed to mark warmup task.' });
  }
});

// ── Start (local dev only) ─────────────────────────────────────────────────────
// On Vercel the app is imported as a handler — app.listen() must not be called.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const mode = isSheetsConfigured() ? 'Google Sheets' : 'CSV files (Sheets not configured)';
    console.log(`Server running at http://localhost:${PORT} — data source: ${mode}`);
  });
}

export default app;
