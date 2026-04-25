/**
 * TaskStack — deck manager for the Tasks view.
 *
 * Cards swiped right (Complete) or left (Defer) are permanently removed.
 * Cards swiped up (Skip) are re-queued at the back of the deck.
 * Tasks due today cannot be skipped — DeckCard snaps back instead.
 *
 * Mirrors the CardStack mechanics but tracks completed/deferred totals
 * and renders a task-specific done screen.
 */
import { useState } from 'react';

import DeckCard from './cards/DeckCard.jsx';

import { CARD_TYPE, VISIBLE_CARD_COUNT, STACK_SCALE_STEP, STACK_OFFSET_PX } from '../config.js';
import { API_BASE } from '../api.js';
import '../styles/cards.css';
import '../styles/tasks.css';
import '../styles/summary.css';  // reuses .summary-grid / .summary-tile / .restart-btn

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns true when a task's due_date is today (local timezone). */
function isDueToday(task) {
  if (!task.due_date) return false;
  const due = new Date(task.due_date + 'T00:00:00');
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth()    === now.getMonth()    &&
    due.getDate()     === now.getDate()
  );
}

export default function TaskStack({ tasks, onReset }) {
  // Enrich tasks with type + _version so DeckCard can re-mount re-queued cards
  const [deck, setDeck] = useState(() =>
    tasks.map(t => ({ ...t, type: CARD_TYPE.TASK, _version: 0 }))
  );
  const [currentIndex, setCurrentIndex] = useState(deck.length - 1);
  const [stats, setStats] = useState({ completed: 0, deferred: 0 });

  // ── Swipe left / right ─────────────────────────────────────────────────────
  // elapsedMinutes comes from DeckCard's stopwatch (decimal, 1 d.p.)
  function handleSwipe(id, direction, _type, elapsedMinutes) {
    setStats(s => ({
      ...s,
      completed: direction === 'right' ? s.completed + 1 : s.completed,
      deferred:  direction === 'left'  ? s.deferred  + 1 : s.deferred,
    }));
    setCurrentIndex(i => i - 1);

    // Log result to Results sheet
    fetch(`${API_BASE}/api/results`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cardId: id, cardType: 'task', direction }),
    }).catch(err => console.warn('Result sync failed:', err.message));

    // Accumulate time spent (no status written — direction is captured in results)
    if (elapsedMinutes > 0) {
      fetch(`${API_BASE}/api/tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ time_spent_min: elapsedMinutes }),
      }).catch(err => console.warn('Task sync failed:', err.message));
    }
  }

  // ── Swipe up: re-queue at the back ─────────────────────────────────────────
  function handleSkip(id, elapsedMinutes) {
    setDeck(prev => {
      const card = prev[currentIndex];
      if (!card) return prev;
      const rest = prev.filter((_, i) => i !== currentIndex);
      return [{ ...card, _version: card._version + 1 }, ...rest];
    });
    // currentIndex stays the same — now points to the next card

    // Accumulate time spent before the skip
    if (elapsedMinutes > 0) {
      fetch(`${API_BASE}/api/tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ time_spent_min: elapsedMinutes }),
      }).catch(err => console.warn('Task time sync failed:', err.message));
    }
  }

  // ── Deck exhausted ─────────────────────────────────────────────────────────
  if (currentIndex < 0) {
    const total = stats.completed + stats.deferred;
    return (
      <div className="task-done">
        <div>
          <h2 className="task-done-heading">All caught up!</h2>
          <p className="task-done-sub">{total} task{total !== 1 ? 's' : ''} reviewed</p>
        </div>

        <div className="summary-grid">
          <div className="summary-tile tile-correct">
            <span className="summary-tile-number">{stats.completed}</span>
            <span className="summary-tile-label">Completed</span>
          </div>
          <div className="summary-tile tile-deferred">
            <span className="summary-tile-number">{stats.deferred}</span>
            <span className="summary-tile-label">Deferred</span>
          </div>
        </div>

        <button className="restart-btn" onClick={onReset}>Start over</button>
      </div>
    );
  }

  // ── Active deck ────────────────────────────────────────────────────────────
  return (
    <div className="card-stack">
      {deck.map((task, index) => {
        if (index < currentIndex - (VISIBLE_CARD_COUNT - 1)) return null;
        if (index > currentIndex) return null;

        const depth      = currentIndex - index; // 0 = top card
        const scale      = 1 - depth * STACK_SCALE_STEP;
        const translateY = depth * STACK_OFFSET_PX;

        return (
          <DeckCard
            key={`${task.id}-${task._version}`}
            question={task}
            onSwipe={handleSwipe}
            onSkip={handleSkip}
            skipDisabled={isDueToday(task)}
            stackStyle={{
              transform:     `scale(${scale}) translateY(${translateY}px)`,
              zIndex:        index,
              pointerEvents: index === currentIndex ? 'auto' : 'none',
            }}
          />
        );
      })}

      {/* ── Progress ──────────────────────────────────────────────────────── */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${((deck.length - 1 - currentIndex) / deck.length) * 100}%`,
          }}
        />
      </div>
      <p className="progress-text">
        {deck.length - 1 - currentIndex}&thinsp;/&thinsp;{deck.length}
      </p>
    </div>
  );
}
