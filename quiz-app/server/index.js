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

/** Stream a CSV file and respond with its rows as a JSON array. */
function respondWithCsv(res, csvPath, label) {
  const records = [];
  createReadStream(csvPath)
    .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
    .on('data',  (row) => records.push(row))
    .on('error', (err) => {
      console.error(`CSV parse error (${label}):`, err);
      res.status(500).json({ error: `Failed to read ${label}.` });
    })
    .on('end',   ()    => res.json(records));
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
// Append a new question row to the Questions sheet (or CSV fallback).
// Questions sheet columns: A=id  B=type  C=front  D=back  E=deck  F=notes
app.post('/api/questions', async (req, res) => {
  const { type, front, back, deck } = req.body;
  if (!type || !front || !deck)
    return res.status(400).json({ error: 'type, front, and deck are required.' });

  const id  = Date.now();
  const row = [id, type, String(front), String(back ?? ''), String(deck), ''];

  if (!isSheetsConfigured()) {
    // CSV fallback — append a line to questions.csv
    const line = row.map(csvField).join(',') + '\n';
    appendFileSync(join(__dirname, 'data', 'questions.csv'), line);
    return res.json({ id, persisted: false });
  }

  try {
    await appendRow('Questions', row);
    clearCache('Questions');   // bust cache so next GET returns the new row
    res.json({ id, persisted: true });
  } catch (err) {
    console.error('Sheets write error (add question):', err.message);
    res.status(500).json({ error: 'Failed to add question.' });
  }
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────
// Append a new task row to the Tasks sheet (or CSV fallback).
// Tasks sheet columns: A=id  B=title  C=description  D=project  E=due_date  F=status
app.post('/api/tasks', async (req, res) => {
  const { title, description, project, due_date } = req.body;
  if (!title)
    return res.status(400).json({ error: 'title is required.' });

  const id  = Date.now();
  const row = [id, String(title), String(description ?? ''), String(project ?? ''), String(due_date ?? ''), ''];

  if (!isSheetsConfigured()) {
    const line = row.map(csvField).join(',') + '\n';
    appendFileSync(join(__dirname, 'data', 'tasks.csv'), line);
    return res.json({ id, persisted: false });
  }

  try {
    await appendRow('Tasks', row);
    clearCache('Tasks');
    res.json({ id, persisted: true });
  } catch (err) {
    console.error('Sheets write error (add task):', err.message);
    res.status(500).json({ error: 'Failed to add task.' });
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
// Append a new schedule event to the Schedule sheet (or CSV fallback).
// Schedule sheet columns: A=id  B=time  C=title  D=duration_min  E=category  F=date
app.post('/api/schedule', async (req, res) => {
  const { time, title, duration_min, category, date } = req.body;
  if (!time || !title)
    return res.status(400).json({ error: 'time and title are required.' });

  const id  = Date.now();
  // date is optional — empty string means the event recurs every day
  const row = [id, String(time), String(title), Number(duration_min) || 30, String(category ?? ''), String(date ?? '')];

  if (!isSheetsConfigured()) {
    const line = row.map(csvField).join(',') + '\n';
    appendFileSync(join(__dirname, 'data', 'schedule.csv'), line);
    return res.json({ id, persisted: false });
  }

  try {
    await appendRow('Schedule', row);
    clearCache('Schedule');
    res.json({ id, persisted: true });
  } catch (err) {
    console.error('Sheets write error (add schedule):', err.message);
    res.status(500).json({ error: 'Failed to add schedule event.' });
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

// ── PATCH /api/tasks/:id ───────────────────────────────────────────────────────
// Write task completion status back to the Tasks sheet (column F).
// Tasks sheet columns: A=id  B=title  C=description  D=project  E=due_date  F=status
app.patch('/api/tasks/:id', async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body; // 'completed' | 'deferred' | ''

  const VALID = ['completed', 'deferred', ''];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: `Invalid status "${status}".` });
  }

  if (!isSheetsConfigured()) {
    // CSV mode: acknowledge silently — no persistent write possible
    return res.json({ id, status, persisted: false });
  }

  try {
    const tasks = await getSheet('Tasks');
    const task  = tasks.find(t => String(t.id) === String(id));
    if (!task) return res.status(404).json({ error: `Task ${id} not found.` });

    await updateCell('Tasks', task._sheetRow, 'F', status);
    res.json({ id, status, persisted: true });
  } catch (err) {
    console.error('Sheets write error (task status):', err.message);
    res.status(500).json({ error: 'Failed to update task status.' });
  }
});

// ── PATCH /api/questions/:id/notes ────────────────────────────────────────────
// Write open-ended card notes back to the Questions sheet (column F).
// Questions sheet columns: A=id  B=type  C=front  D=back  E=deck  F=notes
app.patch('/api/questions/:id/notes', async (req, res) => {
  const { id }   = req.params;
  const { note } = req.body;

  if (!isSheetsConfigured()) {
    return res.json({ id, persisted: false });
  }

  try {
    const questions = await getSheet('Questions');
    const question  = questions.find(q => String(q.id) === String(id));
    if (!question) return res.status(404).json({ error: `Question ${id} not found.` });

    await updateCell('Questions', question._sheetRow, 'F', note ?? '');
    res.json({ id, persisted: true });
  } catch (err) {
    console.error('Sheets write error (notes):', err.message);
    res.status(500).json({ error: 'Failed to update notes.' });
  }
});

// ── POST /api/results ──────────────────────────────────────────────────────────
// Append a study result row to the Results sheet (append-only log).
// Results sheet columns: timestamp  card_id  card_type  result
const RESULT_LABEL = {
  flashcard:    { right: 'correct',   left: 'incorrect' },
  'open-ended': { right: 'done',      left: 'later'     },
};

app.post('/api/results', async (req, res) => {
  const { cardId, cardType, direction } = req.body;
  const result = RESULT_LABEL[cardType]?.[direction] ?? direction;

  if (!isSheetsConfigured()) {
    return res.json({ persisted: false });
  }

  try {
    await appendRow('Results', [
      new Date().toISOString(),
      String(cardId),
      cardType,
      result,
    ]);
    res.json({ persisted: true });
  } catch (err) {
    console.error('Sheets write error (results):', err.message);
    res.status(500).json({ error: 'Failed to log result.' });
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

// ── PATCH /api/warmup/:id ──────────────────────────────────────────────────────
// Mark a warmup task completed for today (writes today's YYYY-MM-DD to column D).
// Warmup sheet columns: A=id  B=title  C=description  D=last_completed
app.patch('/api/warmup/:id', async (req, res) => {
  const { id } = req.params;
  // Prefer the client-sent local date so the stored value matches what the
  // client compares against (local YYYY-MM-DD, not server UTC).
  const today  = req.body.date || new Date().toISOString().slice(0, 10);

  if (!isSheetsConfigured()) {
    return res.json({ id, last_completed: today, persisted: false });
  }

  try {
    const tasks = await getSheet('Warmup');
    const task  = tasks.find(t => String(t.id) === String(id));
    if (!task) return res.status(404).json({ error: `Warmup task ${id} not found.` });

    await updateCell('Warmup', task._sheetRow, 'D', today);
    res.json({ id, last_completed: today, persisted: true });
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
