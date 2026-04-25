# Quiz App — Architecture & Code Reference

A mobile-first study and productivity app. Swipe-based flashcards, open-ended
prompts, task management, a daily schedule widget, and a warm-up gate that runs
every morning before the main app appears. All data lives in a Google Sheets
spreadsheet; the same server falls back to local CSV files when Sheets is not
configured (useful for offline development).

---

## Table of Contents

1. [How it works — big picture](#1-how-it-works--big-picture)
2. [Repository layout](#2-repository-layout)
3. [Deployment (Vercel)](#3-deployment-vercel)
4. [Local development](#4-local-development)
5. [Data layer — Google Sheets](#5-data-layer--google-sheets)
6. [Server (Express API)](#6-server-express-api)
7. [Client — entry point and app shell](#7-client--entry-point-and-app-shell)
8. [Client — hooks](#8-client--hooks)
9. [Client — components](#9-client--components)
10. [Client — styles](#10-client--styles)
11. [Data flow end-to-end](#11-data-flow-end-to-end)
12. [Cross-device sync](#12-cross-device-sync)
13. [Adding new features](#13-adding-new-features)

---

## 1. How it works — big picture

```
Browser (React SPA)
        │
        │  /api/*  (same domain)
        ▼
Vercel Serverless Function  ←→  Google Sheets API
   (Express app)
        │  fallback when Sheets not configured
        ▼
   server/data/*.csv
```

**Frontend**: React 18 + Vite. Compiled to static files served by Vercel's CDN.
All routing is client-side; there is only one HTML page.

**Backend**: A single Express app (`server/index.js`) that handles every
`/api/*` route. In production Vercel imports it as a serverless function;
locally it runs as a plain Node server.

**Data**: Google Sheets is the database. Each sheet tab (`Questions`, `Tasks`,
`Schedule`, `Warmup`, `Results`) maps directly to an API endpoint. The server
caches reads in memory for a few minutes to avoid hitting the Sheets quota.

---

## 2. Repository layout

```
Tasks/                          ← git repo root
├── .github/
│   └── workflows/
│       └── deploy.yml.disabled ← old GitHub Actions CI (disabled; Vercel handles deploys)
└── quiz-app/                   ← Vercel root directory
    ├── vercel.json             ← Vercel build config + /api/* rewrite rule
    ├── package.json            ← root workspace: "type":"module", concurrently dev script
    ├── .env                    ← local secrets (git-ignored)
    ├── .env.example            ← template — copy to .env and fill in
    │
    ├── api/
    │   └── index.js            ← Vercel serverless entry point (imports server/index.js)
    │
    ├── server/
    │   ├── index.js            ← Express routes for all /api/* endpoints
    │   ├── sheets.js           ← Google Sheets API client + in-memory cache
    │   ├── package.json        ← server deps: express, cors, googleapis, csv-parse, dotenv
    │   └── data/               ← CSV fallback files (used when Sheets not configured)
    │       ├── questions.csv
    │       ├── tasks.csv
    │       ├── schedule.csv
    │       └── warmup.csv
    │
    └── client/
        ├── index.html          ← HTML shell (mounts #root, loads Inter font)
        ├── vite.config.js      ← Vite: React plugin, /api proxy to :3001, base path
        ├── package.json        ← client deps: react, react-dom, @react-spring, @use-gesture
        └── src/
            ├── main.jsx        ← React entry point; mounts <App />
            ├── App.jsx         ← Root component; warmup gate + deck routing
            ├── api.js          ← API_BASE export ('' in dev and on Vercel)
            ├── config.js       ← Shared constants: swipe thresholds, card types, storage keys
            │
            ├── hooks/
            │   ├── useSession.js          ← Tracks swipe results; persists to localStorage
            │   ├── useSchedule.js         ← Fetches schedule; finds current/next activity
            │   └── useVisibilityRefresh.js ← Fires callback when tab becomes visible
            │
            ├── components/
            │   ├── CardStack.jsx      ← Study deck: manages card order, skip re-queue, summary
            │   ├── TaskStack.jsx      ← Task deck: same mechanics, different swipe semantics
            │   ├── WarmupGate.jsx     ← Daily warm-up sequence shown before main app
            │   ├── ScheduleWidget.jsx ← Compact bar showing current/next activity
            │   ├── SchedulePanel.jsx  ← Full-day activity list (expanded state)
            │   ├── AddPanel.jsx       ← Bottom-sheet form: add question / task / schedule event
            │   ├── Summary.jsx        ← Study session complete screen
            │   └── cards/
            │       ├── DeckCard.jsx       ← Drag wrapper: spring animation + swipe detection
            │       ├── FlashCard.jsx      ← Two-sided flip card (question → answer)
            │       ├── OpenEndedCard.jsx  ← Flip card with freeform textarea on the back
            │       ├── TaskCard.jsx       ← Single-faced card for a task item
            │       └── WarmupCard.jsx     ← Single-faced card for a warm-up task
            │
            └── styles/
                ├── tokens.css     ← CSS custom properties (colours, radii, shadows, card size)
                ├── global.css     ← Reset, base typography, app shell layout
                ├── cards.css      ← Deck card, flip animation, progress bar, indicators
                ├── tasks.css      ← TaskCard and TaskStack done screen styles
                ├── summary.css    ← Summary screen styles (shared by TaskStack done screen)
                ├── schedule.css   ← ScheduleWidget and SchedulePanel styles
                ├── warmup.css     ← WarmupGate and WarmupCard styles
                └── add-panel.css  ← AddPanel bottom-sheet styles
```

---

## 3. Deployment (Vercel)

### Architecture on Vercel

```
https://your-app.vercel.app/          → React SPA (Vite build, served from CDN)
https://your-app.vercel.app/api/*     → Express serverless function (api/index.js)
```

Everything runs under the **same domain**. There is no CORS configuration
needed and no `VITE_API_BASE` environment variable — all fetch calls use a
relative path like `/api/questions`.

### vercel.json

```json
{
  "installCommand": "npm install && cd server && npm install",
  "buildCommand":   "cd client && npm install && npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index" }
  ]
}
```

| Field | Purpose |
|---|---|
| `installCommand` | Installs root deps (concurrently) **and** server deps (googleapis, express, etc.) |
| `buildCommand` | Installs client deps then runs `vite build` |
| `outputDirectory` | Where Vercel finds the built static files |
| `rewrites` | Sends every `/api/*` request to `api/index.js` (the serverless function) |

### Serverless function entry point (`api/index.js`)

Vercel's serverless runtime imports the file at `api/index.js` and calls its
default export as an HTTP handler. The file simply re-exports the Express app:

```js
import app from '../server/index.js';
export default app;
```

This keeps all route logic in `server/index.js` — the same file that runs as a
regular Node process during local development.

### Auto-deploy

Vercel watches the `master` branch on GitHub. Every push triggers a rebuild.
The old GitHub Actions workflow (`deploy.yml.disabled`) is no longer needed and
has been disabled.

### Environment variables (set in Vercel dashboard)

| Variable | Where set | Purpose |
|---|---|---|
| `GOOGLE_SHEET_ID` | Vercel → Project → Environment Variables | Identifies the spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Vercel → Project → Environment Variables | Service account auth |
| `GOOGLE_PRIVATE_KEY` | Vercel → Project → Environment Variables | Service account private key (paste with real newlines) |

No other variables are required. `VITE_API_BASE` and `CORS_ORIGIN` are not used.

---

## 4. Local development

### Prerequisites
- Node 18+
- A `.env` file at `quiz-app/.env` (copy from `.env.example`)

### Start everything

```bash
cd quiz-app
npm install          # installs concurrently
cd server && npm install && cd ..   # installs Express, googleapis, etc.
cd client && npm install && cd ..   # installs React, Vite, etc.
npm run dev          # starts both servers concurrently
```

`npm run dev` runs two processes in parallel:

| Process | Command | Port |
|---|---|---|
| API server | `node server/index.js` | 3001 |
| Vite dev server | `vite` (in client/) | 5173 |

The Vite dev server proxies `/api/*` to `http://localhost:3001` (configured in
`vite.config.js`), so the React app can call `fetch('/api/questions')` the same
way it does in production.

### Without Google Sheets

Leave the `GOOGLE_*` variables blank in `.env`. The server detects this via
`isSheetsConfigured()` and reads/writes the CSV files in `server/data/` instead.
Writes (PATCH, POST) do work in CSV mode for reads and appends, but PATCH
operations (updating a cell in an existing row) silently acknowledge without
persisting, since there is no in-place CSV update logic.

---

## 5. Data layer — Google Sheets

### Spreadsheet structure

Each sheet tab has a header row that defines the column names. The server maps
rows to JavaScript objects using those headers.

#### Questions tab
| id | type | front | back | deck | notes |
|---|---|---|---|---|---|
| 1715000000000 | flashcard | What is X? | The answer | Biology | |
| 1715000000001 | open-ended | Reflect on Y | | Philosophy | my notes |

- `type`: `flashcard` or `open-ended`
- `back`: empty for open-ended cards
- `notes`: freeform text; updated by PATCH /api/questions/:id/notes

#### Tasks tab
| id | title | description | project | due_date | status |
|---|---|---|---|---|---|
| 1715000000002 | Buy milk | From Whole Foods | Errands | 2025-04-25 | |

- `status`: `completed`, `deferred`, or empty; updated by PATCH /api/tasks/:id

#### Schedule tab
| id | time | title | duration_min | category | date |
|---|---|---|---|---|---|
| 1715000000003 | 09:00 | Deep Work | 90 | Focus | |
| 1715000000004 | 14:00 | Team standup | 30 | Meetings | 2025-04-24 |

- `time`: 24-hour `HH:MM` format
- `date`: `YYYY-MM-DD` for a one-off event, **empty** for a recurring daily event

#### Warmup tab
| id | title | description | last_completed |
|---|---|---|---|
| 1 | 10 push-ups | | 2025-04-24 |
| 2 | 5 min journal | Write anything | |

- `last_completed`: `YYYY-MM-DD` of the most recent completion; updated by
  PATCH /api/warmup/:id. Written in the **user's local timezone** (the client
  sends its local date in the request body).

#### Results tab (append-only log)
| timestamp | card_id | card_type | result |
|---|---|---|---|
| 2025-04-24T14:00:00.000Z | 1715000000000 | flashcard | correct |

Never read back by the app; exists purely as a study-history log.

### `server/sheets.js` — how the API client works

```
isSheetsConfigured()   checks env vars — gates all Sheets calls
getSheet(name)         fetches all rows, returns array of plain objects;
                       each object has _sheetRow (1-based physical row number)
                       for use by updateCell
updateCell(...)        writes one cell, then clears the cache for that sheet
appendRow(...)         appends one row; caller must call clearCache() if the
                       sheet is also read (Results tab is never read, so it's fine)
clearCache(name)       removes cached data so the next getSheet() hits the API
```

**Cache TTLs** (in-memory per serverless invocation):

| Sheet | TTL |
|---|---|
| Questions | 5 minutes |
| Tasks | 5 minutes |
| Schedule | 30 seconds |
| Warmup | (no TTL defined, falls back to 60 s default) |
| Results | never cached (write-only) |

Note: Vercel serverless functions can be cold-started in a new process, so the
cache may be empty on the first request to a fresh instance. This is fine — the
cache only exists to reduce API calls within a single warm instance's lifetime.

---

## 6. Server (Express API)

All routes live in `server/index.js`. Every route follows the same pattern:

```
1. Check isSheetsConfigured()
2. If yes → call the sheets.js function (getSheet / updateCell / appendRow)
3. If no  → read/write the CSV fallback in server/data/
4. Return JSON
```

### Route reference

| Method | Path | Body | Returns | Sheets operation |
|---|---|---|---|---|
| GET | `/api/questions` | — | `Question[]` | getSheet('Questions') |
| POST | `/api/questions` | `{type, front, back, deck}` | `{id, persisted}` | appendRow + clearCache |
| PATCH | `/api/questions/:id/notes` | `{note}` | `{id, persisted}` | updateCell col F |
| GET | `/api/tasks` | — | `Task[]` | getSheet('Tasks') |
| POST | `/api/tasks` | `{title, description, project, due_date}` | `{id, persisted}` | appendRow + clearCache |
| PATCH | `/api/tasks/:id` | `{status}` | `{id, status, persisted}` | updateCell col F |
| GET | `/api/schedule` | — | `ScheduleEvent[]` | getSheet('Schedule') |
| POST | `/api/schedule` | `{time, title, duration_min, category, date}` | `{id, persisted}` | appendRow + clearCache |
| GET | `/api/warmup` | — | `WarmupTask[]` | getSheet('Warmup') |
| PATCH | `/api/warmup/:id` | `{date}` | `{id, last_completed, persisted}` | updateCell col D |
| POST | `/api/results` | `{cardId, cardType, direction}` | `{persisted}` | appendRow (no cache) |

### `persisted` flag

Every write endpoint returns `{ persisted: true/false }`. `false` means the
server is in CSV mode and the write either went to a file (POST) or was silently
acknowledged (PATCH). The client ignores this flag — it always updates its own
local state optimistically.

### Timezone handling

`PATCH /api/warmup/:id` requires the client to send `{ date: "YYYY-MM-DD" }` in
the request body. The server uses that date directly instead of calling
`new Date().toISOString()`, which would give a UTC date. This matters because
Vercel functions run in UTC — at 11 PM Eastern the server's UTC date would
already be the next day.

---

## 7. Client — entry point and app shell

### `main.jsx`

Mounts `<App />` into `#root`. Imports `tokens.css` first because CSS custom
properties must be defined before any component stylesheet references them.

### `App.jsx`

The root component. Owns:

- **Warmup gate state** — always fetches `/api/warmup` on mount (never skips
  based on localStorage) to ensure cross-device consistency. Shows a spinner
  while the fetch is in flight, then either shows WarmupGate or the main app.
- **Questions and tasks data** — fetched on mount, kept in state, updated
  optimistically when the AddPanel submits.
- **Deck switching** — `deckIndex` (0 = Study, 1 = Tasks), animated by a key +
  CSS slide-in class. The header also accepts a horizontal drag gesture to switch
  decks.
- **Schedule state** — delegated entirely to `useSchedule()`; App just passes
  the results down to ScheduleWidget and SchedulePanel.
- **Cross-device sync** — see section 12.

State flow for the warmup gate:

```
mount
  └─ fetch /api/warmup
       ├─ all done today  →  setGateCleared(true), cache in localStorage
       ├─ some pending    →  setPendingWarmup(pending), show WarmupGate
       └─ network error   →  setGateCleared(true)  (fail open, never block user)
```

### `api.js`

```js
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
```

Prepended to every `fetch()` call. Always `''` in the current setup (Vercel
same-domain). If the API were ever moved to a separate host, set `VITE_API_BASE`
to that URL at build time.

### `config.js`

Single source of truth for:
- Swipe physics (`SWIPE_THRESHOLD_PX`, `FLY_DISTANCE_PX`, etc.)
- Card stack geometry (`VISIBLE_CARD_COUNT`, `STACK_SCALE_STEP`, `STACK_OFFSET_PX`)
- Card type strings (`CARD_TYPE.FLASHCARD`, `.OPEN_ENDED`, `.TASK`, `.WARMUP`)
- localStorage key prefixes (`SESSION_STORAGE_KEY`, `NOTE_STORAGE_PREFIX`, `WARMUP_CLEARED_PREFIX`)

---

## 8. Client — hooks

### `useSession`

Tracks the current study session's swipe results. Persists to `localStorage`
under `quiz_session` so progress survives a page refresh within the same session.

```
recordSwipe(id, direction, type)
  flashcard:  right → correct[],  left → incorrect[]
  open-ended: right → completed[], left → deferred[]

resetSession()   clears everything and writes an empty object to localStorage

sessionStats     { correct, incorrect, completed, deferred }  — counts only
```

### `useSchedule`

Fetches `/api/schedule`, enriches each row (parses `HH:MM` → `Date`, coerces
`duration_min`, filters to today-only events), and returns:

```
schedule   — sorted array of enriched event objects (each has .startDate: Date)
current    — event whose window contains right now, or null
next       — first future event, or null
progress   — 0–1 float: how far through `current` (null if no current event)
refresh()  — re-fetches (call after posting a new schedule event)
```

A `setInterval` ticks every 60 seconds to re-evaluate `current`/`next` without
a page reload.

**Filtering logic**: An event is shown if `row.date` is empty (recurring daily)
or exactly matches today's local `YYYY-MM-DD` string.

### `useVisibilityRefresh`

Registers a `visibilitychange` listener that fires the callback whenever the
page becomes visible (tab switch, phone unlock). Used by App.jsx to re-fetch
questions and tasks.

The callback is stored in a ref so the effect never needs to re-run — the latest
version of the function is always called without stale closures.

---

## 9. Client — components

### `WarmupGate`

Shown before the main app each morning. Receives the `tasks` array (already
filtered to incomplete) from App.jsx.

- Renders a DeckCard stack using `CARD_TYPE.WARMUP` cards
- Both left-swipe and right-swipe count as "done" (warm-up has no pass/fail)
- Up-swipe also marks done (re-queue isn't useful here)
- Each swipe fires `PATCH /api/warmup/:id` with `{ date: todayStr() }` (local
  timezone) — fire-and-forget, errors logged to console only
- When the last card is cleared, shows a "done" screen with an "Enter the app →"
  button that calls `onComplete()` in App.jsx

### `CardStack`

Manages the study deck (flashcards + open-ended cards).

**Deck indexing**: The deck is a flat array. `currentIndex` points to the top
card (deck.length - 1 initially, decrements toward -1). Cards with index >
currentIndex are hidden; cards earlier than `currentIndex - VISIBLE_CARD_COUNT`
are unmounted. The top 3 are rendered with scale + translateY to create the
stacked depth effect.

**Skip (swipe up)**: The card is removed from its current position and prepended
at index 0 (the bottom of the stack). Its `_version` is bumped so React unmounts
and remounts it fresh — important for FlashCard's `flipped` state and
OpenEndedCard's scroll position.

**Results sync**: Every left/right swipe fires a fire-and-forget POST to
`/api/results`. This never blocks the UI.

### `TaskStack`

Same mechanics as CardStack but with task-specific semantics:

| Swipe | Meaning | Sheets write |
|---|---|---|
| Right | Complete | PATCH /api/tasks/:id `{ status: 'completed' }` |
| Left | Defer | PATCH /api/tasks/:id `{ status: 'deferred' }` |
| Up | Skip (re-queue) | none |

### `DeckCard`

The animated drag wrapper. Uses `@react-spring/web` for spring physics and
`@use-gesture/react` for pointer/touch tracking.

**Gesture detection** (on drag release):
1. Upward: `|my| > SWIPE_UP_THRESHOLD_PX && |my| >= |mx|`, or velocity check
2. Horizontal: `|mx| > SWIPE_THRESHOLD_PX`, or velocity check
3. Neither: snap back to center

**Indicators**: Four animated overlays fade in as the card is dragged:
- Right edge glow (green tint + "Correct" / "Complete" / "Done" label)
- Left edge glow (red tint + "Incorrect" / "Defer" / "Skip" label)
- Top center label ("Again" / "Skip") on upward drag
- Card surface gets a subtle color gradient while dragging horizontally

Labels per card type are defined in the `LABELS` map at the top of the file.

**Face rendering**: DeckCard delegates to one of four face components based on
`question.type`:

| type | Component |
|---|---|
| `flashcard` | FlashCard |
| `open-ended` | OpenEndedCard |
| `task` | TaskCard |
| `warmup` | WarmupCard |

### `FlashCard`

Two-sided flip card. Tap anywhere → flip. Front shows the question; back shows
the answer. No state is persisted — `flipped` is local React state that resets
when the card remounts (i.e. after skip re-queue).

### `OpenEndedCard`

Flip card with a textarea on the back for freeform notes.

- **Primary store**: `localStorage` — notes are saved on every keystroke via
  `localStorage.setItem(NOTE_STORAGE_PREFIX + id, value)`. This means notes
  survive browser close without waiting for the network.
- **Secondary sync**: A 1-second debounced `PATCH /api/questions/:id/notes` call
  writes the note to the Google Sheet. Fire-and-forget; failure is logged but
  does not surface to the user.
- Swiping is enabled as soon as the card flips to the back (`onReady()` callback).

### `TaskCard`

Single-faced. Displays: Task badge, due-date pill (colour-coded: overdue/today/tomorrow/future),
title, description, project tag. Due date is parsed as local midnight to avoid
UTC-offset shifting the displayed day.

### `WarmupCard`

Single-faced. Minimal: badge, title, description, swipe-right hint.

### `ScheduleWidget`

Compact bar at the top of the main content area. Shows either the current
activity (with a progress bar) or the next upcoming one. Clicking toggles the
full-day `SchedulePanel`.

States: `--empty` (no events), `--now` (currently in an event), `--next`
(next event is in the future). Each state gets its own accent color via CSS.

### `SchedulePanel`

Full-day activity list rendered as a `<ul>`. Items are styled as past/current/
future. `current` is highlighted; past items are dimmed. Duration is formatted
as `30m` or `1h 30m`.

### `AddPanel`

A modal bottom-sheet with three tabs: Question / Task / Schedule.

- Dismissed by tapping the scrim or after a successful submit
- Validates required fields client-side (via `required` attribute) and
  server-side (server returns a 400 with `{ error: "..." }`)
- On success: calls `onAdded(type, newItem)` so App.jsx can update local state
  immediately without waiting for a re-fetch (optimistic update)
- Schedule events are the exception: App.jsx calls `refreshSchedule()` instead
  of patching local state, because schedule enrichment (parsing times, sorting)
  is complex enough to just re-fetch

### `Summary`

Shown when all study cards have been swiped. Displays a 2×2 grid of stat tiles
(Correct / Incorrect / Completed / Deferred) and a "Start over" button.

---

## 10. Client — styles

All stylesheets use CSS custom properties from `tokens.css`. They are plain CSS
(no preprocessor).

| File | Covers |
|---|---|
| `tokens.css` | All custom properties: colours, shadows, radii, card dimensions, font stack |
| `global.css` | Box-model reset, body font, app shell layout, header, deck tabs, loading/error states |
| `cards.css` | `.deck-card-outer`, flip animation, edge indicators, corner labels, progress bar |
| `tasks.css` | TaskCard layout, due-date pill colours, task done screen |
| `summary.css` | Summary grid tiles, restart button |
| `schedule.css` | ScheduleWidget bar + states, SchedulePanel list |
| `warmup.css` | WarmupGate shell, WarmupCard, done screen |
| `add-panel.css` | Scrim, bottom-sheet panel, tab bar, form fields, submit button |

**Import order**: `tokens.css` must be imported before everything else (done in
`main.jsx`). Component-level imports (`cards.css` in CardStack, etc.) can be in
any order relative to each other.

---

## 11. Data flow end-to-end

### Viewing questions

```
App mounts
  → fetch /api/questions
      → server: isSheetsConfigured()?
          yes → getSheet('Questions')  (cache hit or Sheets API call)
          no  → stream questions.csv
      → returns Question[]
  → setQuestions(data)
  → CardStack renders deck
```

### Swiping a flashcard right (Correct)

```
User drags card past threshold and releases
  → DeckCard detects right swipe, plays fly-off animation
  → onRest callback fires → onSwipe(id, 'right', 'flashcard')
  → CardStack: setCurrentIndex(i - 1)
  → CardStack: POST /api/results {cardId, cardType:'flashcard', direction:'right'}
      → server appends row to Results sheet: [timestamp, id, 'flashcard', 'correct']
  → App.jsx: recordSwipe(id, 'right', 'flashcard')
      → session.correct.push(id), persists to localStorage
```

### Adding a question

```
User opens AddPanel, fills in fields, submits
  → POST /api/questions {type, front, back, deck}
      → server: appendRow('Questions', [id, type, front, back, deck, ''])
      → server: clearCache('Questions')
      → returns {id, persisted: true}
  → AddPanel: onAdded('question', {id, type, front, back, deck, notes:''})
  → App.jsx: setQuestions(prev => [...prev, newItem])  (optimistic update)
  → AddPanel closes
```

### Warmup gate on page load

```
App mounts
  → gateCleared = false, warmupChecked = false (always — never read from localStorage)
  → fetch /api/warmup
      → server returns WarmupTask[] with last_completed dates
  → client filters: tasks where last_completed !== todayStr()
  → none pending → setGateCleared(true), write localStorage, show main app
  → some pending → setPendingWarmup(pending), show WarmupGate
  → network error → setGateCleared(true)  (fail open)
```

### Completing a warmup task

```
User swipes warmup card
  → WarmupGate: handleSwipe(id) → markDone(id)
      → PATCH /api/warmup/:id  {date: todayStr()}  (fire-and-forget)
          → server: updateCell('Warmup', row, 'D', date)  (writes user's local date)
  → WarmupGate: setCurrentIndex(i - 1)
  → last card cleared → setDone(true) → shows "All warmed up!" screen
  → user clicks "Enter the app →" → App.jsx: handleGateComplete()
      → localStorage.setItem(todayKey, '1')
      → setGateCleared(true) → main app renders
```

---

## 12. Cross-device sync

### Questions and tasks

App.jsx re-fetches both endpoints in two situations:

1. **Page visibility change**: `useVisibilityRefresh` fires whenever
   `document.visibilityState` becomes `'visible'` (tab focus, phone unlock).
2. **5-minute background poll**: `setInterval` in App.jsx calls the same fetch
   every 5 minutes while the app is open.

Both paths call the same `refreshRef.current()` function. The ref pattern means
the interval/listener never needs to re-register when component state changes.

### Schedule

Schedule data is fetched by `useSchedule`, which re-fetches whenever
`refreshTick` increments (call `refresh()` to trigger) or on mount. The 60-second
`setInterval` inside the hook re-evaluates `current`/`next` without a network
call (it just updates `now` and recomputes from the cached `schedule` array).

### Warmup

The warmup gate always hits the server on every page load (no localStorage
short-circuit). This means:
- Opening the app on a second device after completing warmup on the first device
  correctly shows the main app immediately.
- Reloading the page shows the warmup only if it hasn't actually been completed
  in Sheets, regardless of localStorage state.
- localStorage is written only after the gate clears, as a hint for future
  sessions. It is never read to determine gate state.

---

## 13. Adding new features

### Adding a new data sheet tab

1. **Create the tab in Google Sheets** with a header row.
2. **Add TTL to `server/sheets.js`** in the `TTL` object.
3. **Add a GET route in `server/index.js`** that calls `getSheet('YourTab')`.
4. **Add a CSV fallback file** at `server/data/yourtab.csv` with the same headers.
5. **Fetch from the client** with a new hook or inline fetch in the component.

### Adding a new card type

1. **Add a constant to `CARD_TYPE`** in `config.js`.
2. **Add an entry to `LABELS`** in `DeckCard.jsx`.
3. **Create a new face component** in `components/cards/`.
4. **Add a branch to DeckCard's face selector** (`question.type === CARD_TYPE.YOUR_TYPE ? <YourCard /> : ...`).
5. **Add swipe logic** if the semantics differ (e.g. both directions = done).

### Adding a new field to AddPanel

Find the relevant tab's state block (Question / Task / Schedule) in `AddPanel.jsx`
and add a new `useState` + a new form field. Include the value in the `body`
object inside `handleSubmit`, and make sure the server route accepts it.

### Changing swipe thresholds or stack appearance

Edit the constants in `client/src/config.js`. All physics values are read from
there by `DeckCard` and all stack geometry values are read by `CardStack`,
`TaskStack`, and `WarmupGate`.
