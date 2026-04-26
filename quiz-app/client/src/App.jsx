/**
 * App — root component.
 *
 * On first visit each day, the user must swipe through all pending daily
 * warm-up tasks (WarmupGate) before seeing the main app.
 * On every page load the app always fetches the warmup state from the server
 * so that completions on one device are immediately visible on any other
 * device. localStorage is only written after the gate clears — it is never
 * used to skip the server check.
 *
 * Two decks — Study (flashcards + open-ended questions) and Tasks (to-do items).
 * Switch between them by swiping the header left/right or tapping the deck tabs.
 * Each deck slides in from the direction of the swipe.
 *
 * The schedule widget sits above both decks and is always visible.
 *
 * Refresh: triple-click the card count in the header to re-fetch questions and
 * tasks from the server. New cards are merged into the running deck without
 * disturbing the current card.
 */
import { useState, useEffect, useRef } from 'react';
import { useDrag } from '@use-gesture/react';

import CardStack        from './components/CardStack.jsx';
import TaskStack        from './components/TaskStack.jsx';
import WarmupGate       from './components/WarmupGate.jsx';
import ScheduleWidget   from './components/ScheduleWidget.jsx';
import SchedulePanel    from './components/SchedulePanel.jsx';
import AddPanel         from './components/AddPanel.jsx';
import { useSchedule }  from './hooks/useSchedule.js';
import { WARMUP_CLEARED_PREFIX } from './config.js';
import { API_BASE } from './api.js';

import './styles/global.css';

// Deck definitions — order = visual left-to-right
const DECKS = ['study', 'tasks'];

/** YYYY-MM-DD in local time — used to key the daily gate. */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function App() {
  // ── Warmup gate ────────────────────────────────────────────────────────────
  const todayKey = WARMUP_CLEARED_PREFIX + todayStr();
  // Always start uncleared — we check the server on every mount so that
  // completions on another device are reflected immediately on reload.
  const [gateCleared,   setGateCleared]   = useState(false);
  const [pendingWarmup, setPendingWarmup] = useState([]);
  const [warmupChecked, setWarmupChecked] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/warmup`)
      .then(r => r.json())
      .then(data => {
        const today   = todayStr();
        const pending = data.filter(t => t.last_completed !== today);
        if (pending.length === 0) {
          localStorage.setItem(todayKey, '1');
          setGateCleared(true);
        } else {
          setPendingWarmup(pending);
        }
        setWarmupChecked(true);
      })
      .catch(() => {
        // On network failure, let the user through rather than blocking
        // indefinitely. LocalStorage is not trusted for gate state anymore —
        // we always verify with the server when reachable.
        setGateCleared(true);
        setWarmupChecked(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGateComplete() {
    localStorage.setItem(todayKey, '1');
    setGateCleared(true);
  }

  // ── Main app state ─────────────────────────────────────────────────────────
  const [questions,  setQuestions]  = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const [addOpen, setAddOpen] = useState(false);

  const { schedule, current, next, progress, refresh: refreshSchedule } = useSchedule();
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // ── Deck navigation ────────────────────────────────────────────────────────
  const [deckIndex, setDeckIndex] = useState(0);
  const [slideKey,  setSlideKey]  = useState(0);
  const [slideDir,  setSlideDir]  = useState('right');

  function switchTo(newIndex) {
    if (newIndex === deckIndex || scheduleOpen) return;
    if (newIndex < 0 || newIndex >= DECKS.length) return;
    setSlideDir(newIndex > deckIndex ? 'right' : 'left');
    setDeckIndex(newIndex);
    setSlideKey(k => k + 1);
  }

  // ── Header swipe gesture ───────────────────────────────────────────────────
  const headerBind = useDrag(
    ({ active, movement: [mx], velocity: [vx] }) => {
      if (active) return;
      const isSwipe = Math.abs(mx) > 50 || Math.abs(vx) > 0.4;
      if (!isSwipe) return;
      switchTo(mx < 0 ? deckIndex + 1 : deckIndex - 1);
    },
    { filterTaps: true },
  );

  // ── Initial data fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/questions`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data  => { setQuestions(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/tasks`)
      .then(r => { if (!r.ok) return []; return r.json(); })
      .then(data => setTasks(data))
      .catch(() => {});
  }, []);

  // ── Manual refresh (triple-click the count label) ──────────────────────────
  // refreshRef lets event handlers always call the latest version without
  // needing to close over stale state.
  const refreshRef = useRef(null);
  refreshRef.current = function refreshMainData() {
    fetch(`${API_BASE}/api/questions`)
      .then(r => r.json()).then(setQuestions).catch(() => {});
    fetch(`${API_BASE}/api/tasks`)
      .then(r => r.json()).then(setTasks).catch(() => {});
  };

  // Triple-click detection on the count label
  const tripleClickRef = useRef({ count: 0, timer: null });
  function handleCountClick() {
    tripleClickRef.current.count += 1;
    clearTimeout(tripleClickRef.current.timer);
    tripleClickRef.current.timer = setTimeout(() => {
      tripleClickRef.current.count = 0;
    }, 600);
    if (tripleClickRef.current.count >= 3) {
      tripleClickRef.current.count = 0;
      refreshRef.current?.();
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  // After adding any card/task, re-fetch from the server so new items arrive
  // with proper _sheetRow values and flow through CardStack/TaskStack's reactivity.
  function handleAdded(type) {
    if (type === 'schedule') {
      refreshSchedule();
    } else {
      refreshRef.current?.();
    }
  }

  // ── Gate: waiting for warmup check ────────────────────────────────────────
  if (!warmupChecked) return (
    <div className="app-shell">
      <div className="app-main">
        <div className="loading-state">
          <div className="spinner" />
          <span>Loading…</span>
        </div>
      </div>
    </div>
  );

  // ── Gate: warmup sequence ──────────────────────────────────────────────────
  if (!gateCleared) {
    return <WarmupGate tasks={pendingWarmup} onComplete={handleGateComplete} />;
  }

  // ── Main app: loading ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="app-shell">
      <div className="app-main">
        <div className="loading-state">
          <div className="spinner" />
          <span>Loading cards…</span>
        </div>
      </div>
    </div>
  );

  // ── Main app: error ────────────────────────────────────────────────────────
  if (error) return (
    <div className="app-shell">
      <div className="app-main">
        <div className="error-state">
          <span>Could not load cards</span>
          <code className="error-code">{error}</code>
          <span className="error-hint">Is the server running on port 3001?</span>
        </div>
      </div>
    </div>
  );

  // Show only uncompleted tasks in the header count
  const activeTasks = tasks.filter(t => t.result !== 'completed');
  const countLabel = deckIndex === 0
    ? `${questions.length} cards`
    : `${activeTasks.length} tasks`;

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">

      <header className="app-header" {...headerBind()}>
        <div className="deck-tabs">
          <button
            className={`deck-tab${deckIndex === 0 ? ' deck-tab--active' : ''}`}
            onClick={() => switchTo(0)}
          >
            Study
          </button>
          <button
            className={`deck-tab${deckIndex === 1 ? ' deck-tab--active' : ''}`}
            onClick={() => switchTo(1)}
          >
            Tasks
          </button>
        </div>
        {/* Triple-click to refresh data from the server */}
        <span className="app-count" onClick={handleCountClick}>{countLabel}</span>
        <button
          className="add-btn"
          onClick={() => setAddOpen(true)}
          aria-label="Add item"
        >+</button>
      </header>

      <main className={`app-main${scheduleOpen ? ' app-main--schedule' : ''}`}>

        <ScheduleWidget
          current={current}
          next={next}
          progress={progress}
          expanded={scheduleOpen}
          onToggle={() => setScheduleOpen(o => !o)}
        />

        {scheduleOpen
          ? <SchedulePanel schedule={schedule} current={current} />
          : (
            <div key={slideKey} className={`deck-slide--from-${slideDir}`}>
              {deckIndex === 0
                ? (
                  <CardStack
                    questions={questions}
                  />
                ) : (
                  <TaskStack
                    tasks={tasks}
                  />
                )
              }
            </div>
          )
        }
      </main>

      {addOpen && (
        <AddPanel
          defaultTab={deckIndex === 1 ? 'task' : 'question'}
          onClose={() => setAddOpen(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
