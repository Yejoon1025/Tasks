/**
 * TaskStack — deck manager for the Tasks view.
 *
 * On load, tasks already marked 'completed' are excluded from the deck so they
 * don't re-appear.  Deferred tasks are included and can be acted on again.
 *
 * Timer state is preserved across skips via _elapsedMs on each card object.
 * On load, _elapsedMs is seeded from the server's time_spent_min so the timer
 * shows cumulative work time even across devices.
 *
 * Tasks due today cannot be deferred (left swipe snaps back); skip is always allowed.
 */
import { useState } from 'react';

import DeckCard from './cards/DeckCard.jsx';

import { CARD_TYPE, VISIBLE_CARD_COUNT, STACK_SCALE_STEP, STACK_OFFSET_PX } from '../config.js';
import { API_BASE } from '../api.js';
import '../styles/cards.css';
import '../styles/tasks.css';
import '../styles/summary.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

function isDueToday(task) {
  if (!task.due_date) return false;
  const due = new Date(task.due_date + 'T00:00:00');
  const now  = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth()    === now.getMonth()    &&
    due.getDate()     === now.getDate()
  );
}

export default function TaskStack({ tasks }) {
  const [deck, setDeck] = useState(() =>
    tasks
      // Completed tasks are done — don't show again
      .filter(t => t.result !== 'completed')
      .map(t => ({
        ...t,
        type:       CARD_TYPE.TASK,
        _version:   0,
        // Seed timer display from server-stored time so badge shows cumulative work
        _elapsedMs: Math.round((parseFloat(t.time_spent_min) || 0) * 60 * 1000),
      }))
  );
  const [currentIndex, setCurrentIndex] = useState(deck.length - 1);
  const [stats, setStats] = useState({ completed: 0, deferred: 0 });

  // ── Swipe left / right ─────────────────────────────────────────────────────
  function handleSwipe(id, direction, _type, elapsedMinutes) {
    const result = direction === 'right' ? 'completed' : 'deferred';

    setStats(s => ({
      completed: result === 'completed' ? s.completed + 1 : s.completed,
      deferred:  result === 'deferred'  ? s.deferred  + 1 : s.deferred,
    }));
    setCurrentIndex(i => i - 1);

    // Persist result + incremental time to the task row
    fetch(`${API_BASE}/api/tasks/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ result, time_spent_min: elapsedMinutes }),
    }).catch(err => console.warn('Task sync failed:', err.message));

    // Append to Results log
    fetch(`${API_BASE}/api/results`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cardId: id, cardType: 'task', direction, time_spent_min: elapsedMinutes }),
    }).catch(err => console.warn('Result sync failed:', err.message));
  }

  // ── Swipe up: re-queue ─────────────────────────────────────────────────────
  function handleSkip(id, elapsedMinutes) {
    setDeck(prev => {
      const card = prev[currentIndex];
      if (!card) return prev;
      const rest = prev.filter((_, i) => i !== currentIndex);
      const newElapsedMs = (card._elapsedMs ?? 0) + Math.round(elapsedMinutes * 60 * 1000);
      return [{ ...card, _version: card._version + 1, _elapsedMs: newElapsedMs }, ...rest];
    });

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
          <h2 className="task-done-heading">All done</h2>
          <p className="task-done-sub">
            {total > 0
              ? `${total} task${total !== 1 ? 's' : ''} reviewed`
              : 'No tasks left for now'}
          </p>
        </div>

        {total > 0 && (
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
        )}
      </div>
    );
  }

  // ── Active deck ────────────────────────────────────────────────────────────
  return (
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
            initialMs={task._elapsedMs ?? 0}
            onSwipe={handleSwipe}
            onSkip={handleSkip}
            deferDisabled={isDueToday(task)}
            stackStyle={{
              transform:     `scale(${scale}) translateY(${translateY}px)`,
              zIndex:        index,
              pointerEvents: index === currentIndex ? 'auto' : 'none',
            }}
          />
        );
      })}

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((deck.length - 1 - currentIndex) / deck.length) * 100}%` }}
        />
      </div>
      <p className="progress-text">
        {deck.length - 1 - currentIndex}&thinsp;/&thinsp;{deck.length}
      </p>
    </div>
  );
}
