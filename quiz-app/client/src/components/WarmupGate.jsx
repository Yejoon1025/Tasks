/**
 * WarmupGate — daily warm-up card sequence that must be completed before
 * the main app is shown.
 *
 * - Swipe right → Done   (marks task complete on the sheet)
 * - Swipe left  → Skip   (also marks complete — just acknowledging)
 * - Swipe up    → Skip   (same)
 *
 * After every card is cleared, shows a brief done state then calls onComplete().
 *
 * Props:
 *   tasks      — array of pending warmup task objects (already filtered to today)
 *   onComplete — called once all tasks are cleared
 */
import { useState } from 'react';
import DeckCard from './cards/DeckCard.jsx';
import { CARD_TYPE, VISIBLE_CARD_COUNT, STACK_SCALE_STEP, STACK_OFFSET_PX } from '../config.js';
import { API_BASE } from '../api.js';
import '../styles/cards.css';
import '../styles/warmup.css';

/** YYYY-MM-DD in the user's local timezone — sent to the server so the stored
 *  date matches what the client compares against in the warmup gate check. */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WarmupGate({ tasks, onComplete }) {
  const [deck, setDeck] = useState(() =>
    tasks.map(t => ({ ...t, type: CARD_TYPE.WARMUP, _version: 0 }))
  );
  const [currentIndex, setCurrentIndex] = useState(tasks.length - 1);
  const [done, setDone] = useState(false);

  /**
   * Mark a task as done on the server (fire-and-forget).
   * Sends the client's local date so the server stores the correct timezone value.
   */
  function markDone(id) {
    fetch(`${API_BASE}/api/warmup/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ date: todayStr() }),
    }).catch(err => console.warn('Warmup sync failed:', err.message));
  }

  /** Left / right swipe — both directions count as done for warmup. */
  function handleSwipe(id) {
    markDone(id);
    const next = currentIndex - 1;
    if (next < 0) {
      setDone(true);
    } else {
      setCurrentIndex(next);
    }
  }

  /** Up swipe — also counts as done for warmup (no re-queue needed). */
  function handleSkip(id) {
    markDone(id);
    const next = currentIndex - 1;
    if (next < 0) {
      setDone(true);
    } else {
      setCurrentIndex(next);
    }
  }

  const total    = deck.length;
  const cleared  = total - 1 - currentIndex;

  // ── Done state ─────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="warmup-shell">
        <header className="warmup-header">
          <span className="warmup-header-title">Daily Warm-Up</span>
          <span className="warmup-header-count">{total}/{total}</span>
        </header>
        <div className="warmup-main">
          <div className="warmup-done">
            <span className="warmup-done-icon">☀️</span>
            <h2 className="warmup-done-heading">All warmed up!</h2>
            <p className="warmup-done-sub">You're ready to go.</p>
            <button className="warmup-enter-btn" onClick={onComplete}>
              Enter the app →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active swipe sequence ──────────────────────────────────────────────────
  return (
    <div className="warmup-shell">
      <header className="warmup-header">
        <span className="warmup-header-title">Daily Warm-Up</span>
        <span className="warmup-header-count">{cleared}/{total}</span>
      </header>

      <div className="warmup-main">
        <div className="card-stack">
          {deck.map((task, index) => {
            if (index < currentIndex - (VISIBLE_CARD_COUNT - 1)) return null;
            if (index > currentIndex) return null;

            const depth      = currentIndex - index;
            const scale      = 1 - depth * STACK_SCALE_STEP;
            const translateY = depth * STACK_OFFSET_PX;

            return (
              <DeckCard
                key={`${task.id}-${task._version}`}
                question={task}
                onSwipe={handleSwipe}
                onSkip={handleSkip}
                stackStyle={{
                  transform:     `scale(${scale}) translateY(${translateY}px)`,
                  zIndex:        index,
                  pointerEvents: index === currentIndex ? 'auto' : 'none',
                }}
              />
            );
          })}

          {/* Progress bar */}
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(cleared / total) * 100}%` }}
            />
          </div>
          <p className="progress-text">
            {cleared}&thinsp;/&thinsp;{total}
          </p>
        </div>
      </div>
    </div>
  );
}
