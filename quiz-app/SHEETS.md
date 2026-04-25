# Google Sheets — Data Format & Integration Reference

This document covers everything about how the app uses Google Sheets: the
spreadsheet structure, column-by-column field reference for every tab, how the
server reads and writes data, the in-memory caching layer, authentication, and
the CSV fallback mode used in local development without credentials.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Spreadsheet setup](#2-spreadsheet-setup)
3. [Tab: Questions](#3-tab-questions)
4. [Tab: Tasks](#4-tab-tasks)
5. [Tab: Schedule](#5-tab-schedule)
6. [Tab: Warmup](#6-tab-warmup)
7. [Tab: Results](#7-tab-results)
8. [How `sheets.js` works](#8-how-sheetsjs-works)
9. [How each server operation maps to a Sheets API call](#9-how-each-server-operation-maps-to-a-sheets-api-call)
10. [Authentication](#10-authentication)
11. [Caching](#11-caching)
12. [CSV fallback mode](#12-csv-fallback-mode)
13. [Gotchas and edge cases](#13-gotchas-and-edge-cases)

---

## 1. Overview

Google Sheets acts as the database. The app has **one spreadsheet** with five
named tabs — one per data type. The server reads and writes using the
**Google Sheets API v4** via a service account (server-to-server auth, no user
login required).

```
Spreadsheet
├── Questions   ← flashcards and open-ended prompts
├── Tasks       ← to-do items
├── Schedule    ← daily timeline events
├── Warmup      ← morning warm-up tasks
└── Results     ← append-only swipe-result log
```

The tab name in the spreadsheet must exactly match the name used in the code
(case-sensitive). The server addresses data by tab name, not by index.

Every tab must have a **header row** as row 1. The server reads the header to
map columns to object keys — column order matters, but only insofar as
hard-coded write operations reference columns by letter (A, B, C…). Renaming
headers is safe for read operations; changing column order for a tab that has
write-back operations (Tasks, Questions, Warmup) would require updating the
column letter in `server/index.js`.

---

## 2. Spreadsheet setup

### One-time steps

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Create five tabs named exactly: `Questions`, `Tasks`, `Schedule`, `Warmup`, `Results`.
3. Add the header rows described in sections 3–7 below.
4. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```
5. Set up a service account (see [section 10](#10-authentication)).
6. Share the spreadsheet with the service account email (Editor access).
7. Set the three env vars in Vercel (or `.env` locally):
   ```
   GOOGLE_SHEET_ID=<the id from step 4>
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account@project.iam.gserviceaccount.com>
   GOOGLE_PRIVATE_KEY=<-----BEGIN RSA PRIVATE KEY-----\n...>
   ```

### Verifying it works

Hit `https://your-app.vercel.app/api/questions` in a browser. If you see a JSON
array (even an empty one `[]`), the connection is working. If you see a 500
error, check the Vercel function logs for the exact message.

---

## 3. Tab: Questions

Stores every flashcard and open-ended card. Each row is one card.

### Header row (row 1)

```
id | type | front | back | deck | notes
A    B      C       D      E      F
```

### Field reference

| Column | Header | Type | Required | Description |
|--------|--------|------|----------|-------------|
| A | `id` | number | yes | Unix timestamp in ms (`Date.now()`) at creation time. Used as a stable identifier across sessions. |
| B | `type` | string | yes | `flashcard` or `open-ended`. Controls which card face component is rendered. |
| C | `front` | string | yes | The question text (flashcard) or prompt text (open-ended). |
| D | `back` | string | no | The answer text. Only used for `flashcard` type. Leave empty for `open-ended`. |
| E | `deck` | string | yes | Deck label shown on the card (e.g. `Biology`, `CS`, `Weekly Review`). Used for visual grouping only — no filtering logic is applied by deck. |
| F | `notes` | string | no | Freeform notes for open-ended cards. Written by `PATCH /api/questions/:id/notes`. Leave blank initially. |

### Example rows

```
id              | type       | front                              | back                      | deck         | notes
1715000000000   | flashcard  | What is the capital of France?     | Paris                     | Geography    |
1715000000001   | open-ended | What are your top 3 goals today?   |                           | Daily Review | Written 2026-04-24: ...
```

### Write operations

| Operation | Trigger | What changes |
|-----------|---------|-------------|
| **Append row** | `POST /api/questions` | New row added at the bottom with columns A–F |
| **Update cell** | `PATCH /api/questions/:id/notes` | Column F of the matching row |

### Important: notes persistence

Notes are written to Sheets via a **1-second debounced PATCH** call every time
the user types in the open-ended card's textarea. The primary store is
`localStorage` (instant); Sheets is the secondary sync. If the debounced call
fails, the note is still in localStorage and will be present next time the user
opens the card on the same device. On a different device, the Sheets version is
the source of truth — the server returns the `notes` value in the Questions
response.

---

## 4. Tab: Tasks

Stores to-do items. Each row is one task.

### Header row (row 1)

```
id | title | description | project | due_date | status
A    B        C             D         E          F
```

### Field reference

| Column | Header | Type | Required | Description |
|--------|--------|------|----------|-------------|
| A | `id` | number | yes | Unix timestamp in ms at creation time. |
| B | `title` | string | yes | Short task name, shown as the main text on the card. |
| C | `description` | string | no | Optional detail text shown below the title. |
| D | `project` | string | no | Project or category tag (e.g. `Backend`, `Design`). Shown as a small pill at the bottom of the card. |
| E | `due_date` | string | no | `YYYY-MM-DD` format. Parsed client-side as **local midnight** to produce the due-date pill (Overdue / Today / Tomorrow / date string). Leave blank for no due date. |
| F | `status` | string | no | `completed`, `deferred`, or empty. Updated by `PATCH /api/tasks/:id`. Starts empty when a task is first added. |

### Example rows

```
id              | title                    | description                    | project  | due_date   | status
1715000000002   | Refactor auth module     | Extract token logic…           | Backend  | 2026-04-23 | completed
1715000000003   | Sketch Q2 roadmap        | Draft feature priorities…      | Strategy | 2026-04-30 |
```

### Write operations

| Operation | Trigger | What changes |
|-----------|---------|-------------|
| **Append row** | `POST /api/tasks` | New row added at the bottom with columns A–F |
| **Update cell** | `PATCH /api/tasks/:id` | Column F (`status`) of the matching row |

### Status values

| Value | Meaning | Swipe direction |
|-------|---------|-----------------|
| `completed` | Task done | Right swipe |
| `deferred` | Put off for later | Left swipe |
| `` (empty) | Not yet reviewed | (initial state) |

Note: the app does not filter tasks by status when loading. All tasks are
returned regardless of their status column. If you want to archive completed
tasks, delete or move their rows manually in Sheets.

### Due date rendering

The client parses `due_date` as `new Date(dateStr + 'T00:00:00')` — the
`T00:00:00` suffix forces local midnight so the day never shifts due to
timezone. The pills:

| Condition | Label | Colour |
|-----------|-------|--------|
| `diffDays < 0` | Overdue | Red |
| `diffDays === 0` | Today | Amber |
| `diffDays === 1` | Tomorrow | Amber |
| `diffDays > 1` | `Apr 30` (short date) | Neutral |

---

## 5. Tab: Schedule

Stores daily timeline events. Each row is one event slot.

### Header row (row 1)

```
id | time | title | duration_min | category | date
A    B      C        D              E          F
```

### Field reference

| Column | Header | Type | Required | Description |
|--------|--------|------|----------|-------------|
| A | `id` | number | yes | Unix timestamp in ms at creation time. |
| B | `time` | string | yes | 24-hour `HH:MM` format (e.g. `09:00`, `13:30`). Parsed to a `Date` object anchored to today's local date. |
| C | `title` | string | yes | Activity name shown in the schedule widget and panel. |
| D | `duration_min` | number | yes | Duration in minutes (integer). Used to compute the activity window and the progress bar. |
| E | `category` | string | no | Label shown as a small pill (e.g. `Work`, `Health`, `Personal`). No filtering — purely visual. |
| F | `date` | string | no | `YYYY-MM-DD` for a one-off event on a specific day. **Leave blank for a recurring daily event.** |

### Example rows

```
id              | time  | title                    | duration_min | category  | date
1715000000004   | 06:30 | Morning workout          | 45           | Health    |
1715000000005   | 09:00 | Deep work block          | 90           | Work      |
1715000000006   | 14:00 | Team standup             | 15           | Meetings  | 2026-04-25
```

Row 1 and 2 appear every day. Row 3 only appears on 2026-04-25.

### Write operations

| Operation | Trigger | What changes |
|-----------|---------|-------------|
| **Append row** | `POST /api/schedule` | New row added at the bottom with columns A–F |

There is no PATCH operation on schedule events. To edit or remove an event,
change the spreadsheet directly.

### Daily filtering (client-side)

The server returns all schedule rows. The client's `useSchedule` hook filters
them:

```
show row if:  row.date is empty   (recurring)
              OR
              row.date === todayStr()  (one-off, matches today)
```

`todayStr()` produces a `YYYY-MM-DD` string in the **user's local timezone**.
Rows with unparseable `time` values are silently dropped.

### Current/next detection

After filtering and sorting by time, the hook walks the array and checks:

```
current  = first row where  startTime ≤ now < startTime + duration_min
next     = first row where  startTime > now  (after current's window)
```

This re-evaluates every 60 seconds via `setInterval` without a network call.

---

## 6. Tab: Warmup

Stores the daily warm-up task list. Each row is one task. This list is fixed
(you manage it directly in Sheets) — users cannot add warm-up tasks from the app.

### Header row (row 1)

```
id | title | description | last_completed
A    B        C             D
```

### Field reference

| Column | Header | Type | Required | Description |
|--------|--------|------|----------|-------------|
| A | `id` | number | yes | A stable numeric ID. Unlike other tabs, these are typically small integers (1, 2, 3…) since you set them manually. |
| B | `title` | string | yes | Task name shown on the warm-up card. |
| C | `description` | string | no | Optional detail text shown below the title. |
| D | `last_completed` | string | no | `YYYY-MM-DD` of the most recent completion. Written by `PATCH /api/warmup/:id`. Empty initially. |

### Example rows

```
id | title                    | description                                          | last_completed
1  | Check yesterday's goals  | Take 60 seconds to review what you set out to do.   | 2026-04-24
2  | Set today's top 3        | Write down the three most important things today.    | 2026-04-24
3  | Hydrate                  | Drink a full glass of water before you begin.        |
4  | One deep breath          | Close your eyes and take one slow breath in and out. | 2026-04-25
```

### Write operations

| Operation | Trigger | What changes |
|-----------|---------|-------------|
| **Update cell** | `PATCH /api/warmup/:id` | Column D (`last_completed`) of the matching row |

### How the gate works

On every page load, the app fetches all warm-up rows and filters to those where
`last_completed !== todayStr()`. If the filtered list is empty, the gate is
cleared. If not, the pending tasks are shown as a swipe sequence.

### Timezone: why the client sends the date

The server runs in UTC (Vercel functions always run in UTC). If the server were
to write `new Date().toISOString().slice(0,10)`, at 11 PM Eastern it would write
the *next* day's date — meaning the task would appear incomplete again the
following morning.

To fix this, **the client sends its local date** in the PATCH request body:

```json
PATCH /api/warmup/1
{ "date": "2026-04-25" }
```

The server uses `req.body.date` if present, falling back to UTC only if absent.
This means `last_completed` always stores the user's local date, which is also
what `todayStr()` produces when comparing on the next load.

---

## 7. Tab: Results

An append-only log of every card swipe. Never read back by the app — exists
purely for study-history analysis outside the app (e.g. in Sheets itself, or
exported to a spreadsheet formula or script).

### Header row (row 1)

```
timestamp | card_id | card_type | result
A           B         C           D
```

### Field reference

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `timestamp` | string | ISO 8601 UTC timestamp (`new Date().toISOString()`), e.g. `2026-04-25T14:00:00.000Z` |
| B | `card_id` | string | The `id` value from the Questions tab |
| C | `card_type` | string | `flashcard` or `open-ended` |
| D | `result` | string | Mapped from swipe direction — see table below |

### Result values

| Card type | Right swipe | Left swipe |
|-----------|-------------|------------|
| `flashcard` | `correct` | `incorrect` |
| `open-ended` | `done` | `later` |

### Write operations

Only `appendRow` — no reads, no updates, no cache.

---

## 8. How `sheets.js` works

`server/sheets.js` is the only file that talks to the Google Sheets API. All
routes in `server/index.js` call its exported functions rather than touching the
API directly.

### The five exported functions

```js
isSheetsConfigured()            // bool — are all three env vars present?
getSheet(sheetName)             // Promise<Object[]> — fetch all data rows
updateCell(name, row, col, val) // Promise<void> — write one cell
appendRow(sheetName, values)    // Promise<void> — append one row
clearCache(sheetName)           // void — bust the in-memory cache
```

### Lazy client initialisation

The Sheets API client (`google.sheets(...)`) is created once, on first use, and
stored in a module-level variable. If the env vars are absent it is never created.

```js
let _client = null;
function client() {
  if (!_client) _client = google.sheets({ version: 'v4', auth: makeAuth() });
  return _client;
}
```

This means importing `sheets.js` has zero cost if `isSheetsConfigured()` returns
false — nothing is instantiated.

### `getSheet` — reading data

```js
const res = await client().spreadsheets.values.get({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: sheetName,              // e.g. 'Questions' — fetches the whole tab
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'FORMATTED_STRING',
});
```

`range: 'Questions'` with no cell suffix fetches **all rows and columns** in the
tab (equivalent to `Questions!A:Z`).

`UNFORMATTED_VALUE` returns raw values: numbers as numbers, not formatted strings
like `"1,234"`. `FORMATTED_STRING` for dates returns them as they appear in the
sheet rather than as a serial number.

The response is `res.data.values`: a 2D array where `[0]` is the header row and
`[1..n]` are data rows. The header is used to build JavaScript objects:

```js
const [header = [], ...dataRows] = res.data.values ?? [];

const data = dataRows.map((row, i) => {
  const obj = {};
  header.forEach((col, j) => { obj[col] = row[j] ?? ''; });
  obj._sheetRow = i + 2;  // 1-based physical row: +1 for header, +1 for 0-index
  return obj;
});
```

Every object gets `_sheetRow` attached — the 1-based row number in the actual
spreadsheet. This is what `updateCell` uses to know which row to write to,
without needing a second lookup.

### `updateCell` — writing one cell

```js
await client().spreadsheets.values.update({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: `${sheetName}!${colLetter}${sheetRow}`,  // e.g. 'Tasks!F5'
  valueInputOption: 'RAW',
  requestBody: { values: [[value]] },
});
cache.delete(sheetName);  // always bust cache after a write
```

`RAW` means the value is written exactly as provided — no formula parsing, no
date conversion. After the write the cache for that sheet is deleted so the next
`getSheet` call re-fetches fresh data.

### `appendRow` — adding a new row

```js
await client().spreadsheets.values.append({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: sheetName,
  valueInputOption: 'RAW',
  insertDataOption: 'INSERT_ROWS',
  requestBody: { values: [values] },  // values is a flat array: [id, title, ...]
});
```

`INSERT_ROWS` inserts a new physical row rather than overwriting existing data.
The `range` only needs to be the tab name — Sheets finds the first empty row
after the existing data automatically.

Note: `appendRow` does **not** clear the cache itself. Callers that append to a
tab that is also read (Questions, Tasks, Schedule) must call `clearCache(name)`
immediately after:

```js
await appendRow('Questions', row);
clearCache('Questions');  // so the next GET includes the new row
```

The Results tab is never read, so `appendRow` on Results needs no cache clearing.

---

## 9. How each server operation maps to a Sheets API call

| Route | Sheets calls | Cache behaviour |
|-------|-------------|-----------------|
| `GET /api/questions` | `getSheet('Questions')` | Returns cached data if fresh; else API call |
| `POST /api/questions` | `appendRow('Questions', [...])` then `clearCache('Questions')` | Cache busted |
| `PATCH /api/questions/:id/notes` | `getSheet('Questions')` then `updateCell('Questions', row, 'F', note)` | getSheet may use cache; updateCell busts it |
| `GET /api/tasks` | `getSheet('Tasks')` | Returns cached data if fresh; else API call |
| `POST /api/tasks` | `appendRow('Tasks', [...])` then `clearCache('Tasks')` | Cache busted |
| `PATCH /api/tasks/:id` | `getSheet('Tasks')` then `updateCell('Tasks', row, 'F', status)` | getSheet may use cache; updateCell busts it |
| `GET /api/schedule` | `getSheet('Schedule')` | Returns cached data if fresh (30 s TTL); else API call |
| `POST /api/schedule` | `appendRow('Schedule', [...])` then `clearCache('Schedule')` | Cache busted |
| `GET /api/warmup` | `getSheet('Warmup')` | Returns cached data if fresh; else API call |
| `PATCH /api/warmup/:id` | `getSheet('Warmup')` then `updateCell('Warmup', row, 'D', date)` | getSheet may use cache; updateCell busts it |
| `POST /api/results` | `appendRow('Results', [...])` | No cache (Results never read) |

PATCH operations always do two API calls: one read (to find the row number) and
one write. The read may be served from cache.

---

## 10. Authentication

The app uses **service account** authentication — a robot account that has
direct API access without any user login flow.

### How it works

1. A service account is created in Google Cloud Console.
2. A JSON key is downloaded. It contains a `client_email` and a `private_key`.
3. The spreadsheet is shared with the service account email (just like sharing
   with a person, but with the robot's email address).
4. The server creates a `GoogleAuth` object using those credentials and requests
   the `spreadsheets` OAuth scope.

```js
function makeAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}
```

### The `\\n` → `\n` replacement

Private keys contain real newline characters. When stored in a `.env` file they
are often saved with the literal two-character sequence `\n` (backslash + n)
rather than a real newline. The `.replace(/\\n/g, '\n')` converts them back to
real newlines before the key is passed to the PEM parser.

On Vercel's Environment Variables UI, if you paste the key with the newlines
visible in the text box (i.e. you pasted the raw multi-line key), no replacement
is needed — Vercel preserves real newlines. Both forms work because the regex
only replaces the literal `\n` two-character sequence, not real newlines.

### Setting up the service account (step by step)

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or select an existing one).
3. Enable the **Google Sheets API** under APIs & Services → Library.
4. Go to APIs & Services → Credentials → Create Credentials → **Service Account**.
5. Give it any name, click through the optional permission steps, click Done.
6. Click the service account email in the list, go to the **Keys** tab.
7. Add Key → Create new key → **JSON** → Download.
8. Open the JSON file. Copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` (the whole `-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n` block) → `GOOGLE_PRIVATE_KEY`
9. Open your spreadsheet → Share → paste the service account email → set **Editor** → Share.
10. Copy the spreadsheet ID from the URL → `GOOGLE_SHEET_ID`.

---

## 11. Caching

The server keeps one in-memory cache (a `Map`) per serverless function instance.
Reads within the TTL window are served instantly without touching the Sheets API.

### Cache TTLs

| Sheet | TTL | Reason |
|-------|-----|--------|
| Questions | 5 minutes | Content changes rarely; reduces API quota usage |
| Tasks | 5 minutes | Same reason |
| Schedule | 30 seconds | Time-sensitive — current/next detection needs reasonably fresh data |
| Warmup | 60 seconds (default) | Needs to reflect same-day completions reasonably quickly |
| Results | not cached | Write-only; never read |

### Cache lifecycle

```
getSheet('Questions')
  └─ isFresh? → return cache.get('Questions').data   (no API call)
  └─ stale/missing → call Sheets API → store in cache → return data

updateCell('Questions', ...)
  └─ write to Sheets API → cache.delete('Questions')

appendRow('Questions', ...)
  └─ write to Sheets API   (no cache interaction — caller must clearCache)

clearCache('Questions')
  └─ cache.delete('Questions')   (next getSheet will hit the API)
```

### Serverless cold starts

Each Vercel serverless invocation may run in a fresh Node process, meaning the
cache starts empty. On the first request to a fresh instance every `getSheet`
call hits the API. Subsequent requests within the same instance's lifetime
benefit from the cache. This is expected behaviour — the cache exists to reduce
quota usage within a warm instance, not to guarantee persistence across
invocations.

---

## 12. CSV fallback mode

When any of the three `GOOGLE_*` env vars is absent, `isSheetsConfigured()`
returns `false` and every route falls back to the CSV files in `server/data/`.

### CSV files

```
server/data/
├── questions.csv   ← Questions tab equivalent
├── tasks.csv       ← Tasks tab equivalent
├── schedule.csv    ← Schedule tab equivalent
└── warmup.csv      ← Warmup tab equivalent
```

These files ship with sample data and are used as the data source during local
development without Google credentials.

### What works in CSV mode

| Operation | Works? | Notes |
|-----------|--------|-------|
| GET (read data) | ✅ | Streams the CSV file, parses it, returns JSON |
| POST (append) | ✅ | Appends a new CSV line to the file |
| PATCH (update cell) | ❌ | Silently acknowledged — returns `{ persisted: false }` |

PATCH operations (marking a task complete, saving notes, marking a warmup done)
are acknowledged but not persisted in CSV mode. There is no logic to rewrite an
existing CSV row in-place.

### CSV format

The CSV files use the same column headers as the corresponding Sheets tabs. Fields
containing commas, quotes, or newlines are wrapped in double quotes (the server
uses a `csvField()` helper for this when writing). The files are read by the
`csv-parse` library with `{ columns: true, trim: true, skip_empty_lines: true }`.

---

## 13. Gotchas and edge cases

### Tab names are case-sensitive

`getSheet('questions')` would fail — the tab must be named exactly `Questions`.
The Sheets API returns a 400 if the range doesn't match a tab name.

### Empty cells become empty strings

The server normalises missing cells to `''`:

```js
header.forEach((col, j) => { obj[col] = row[j] ?? ''; });
```

A spreadsheet row with fewer cells than the header (e.g. a row where the last
few columns were never filled in) will have `''` for those fields in the
returned object. Code that checks for a due date or a `last_completed` date
must check for both `null` and `''`.

### Trailing rows / blank rows in the sheet

`csv-parse` is configured with `skip_empty_lines: true`. The Sheets API returns
only rows that have at least one non-empty cell, so blank rows in the middle of
a sheet are generally safe, but can shift `_sheetRow` numbering if rows are
deleted. The `_sheetRow` value is computed fresh on every `getSheet` call, so
after a cache bust it will always be correct.

### The `_sheetRow` property

Every object returned by `getSheet` has a `_sheetRow` property (the 1-based
physical row index in the spreadsheet). This is used exclusively by `updateCell`
— it is a server-internal field and is never sent to the client. If you write
code that serialises the full object to JSON and sends it, strip `_sheetRow`
first.

### Concurrent writes

The server has no write locking. Two simultaneous PATCH requests to the same
row will both succeed, with the last one winning. In practice this is not an
issue because the app is single-user.

### Sheets API quota

The free Google Sheets API quota is:
- 300 read requests per minute per project
- 300 write requests per minute per project

The in-memory cache prevents repeated reads within the TTL window, keeping
normal usage well within quota. If you see `429 Too Many Requests` errors in
the Vercel logs, the cache TTLs need to be increased.

### Adding a new tab

If you add a new tab to the spreadsheet and want the server to read it:
1. Add a TTL entry in the `TTL` object in `sheets.js`.
2. Add a GET route in `server/index.js` that calls `getSheet('YourTabName')`.
3. Add a matching CSV fallback file in `server/data/yourtabname.csv`.

The tab name in `getSheet()` must exactly match the tab name in the spreadsheet.
