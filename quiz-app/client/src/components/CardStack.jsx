/**
 * CardStack — manages the deck of flashcards.
 *
 * Cards that already have a result ('done' or 'deferred') are excluded from
 * the deck on load so they don't re-appear after a page refresh.
 *
 * Each card carries _elapsedMs — the total ms already on the server —
 * which seeds the DeckCard timer display.  computeMinutes() in DeckCard
 * returns only the incremental delta so the server never double-counts.
 */
import { useState } from 'react';

import DeckCard from './cards/DeckCard.jsx';

import { VISIBLE_CARD_COUNT, STACK_SCALE_STEP, STACK_OFFSET_PX } from '../config.js';
import { API_BASE } from '../api.js';
import '../styles/cards.css';

export default function CardStack({ questions }) {
  const [deck, setDeck] = useState(() =>
    questions
      // Only show cards that haven't been acted on yet
      .filter(q => !q.result)
      .map(q => ({
        ...q,
        _version:   0,
        _elapsedMs: Math.round((parseFloat(q.time_spent_min) || 0) * 60 * 1000),
      }))
  );
  const [currentIndex, setCurrentIndex] = useState(deck.length - 1);

  // ── Swipe left / right ─────────────────────────────────────────────────────
  function handleSwipe(id, direction, _type, elapsedMinutes) {
    setCurrentIndex(i => i - 1);

    fetch(`${API_BASE}/api/questions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        minutes: elapsedMinutes,
        result:  direction === 'right' ? 'done' : 'deferred',
      }),
    }).catch(err => console.warn('Question sync failed:', err.message));
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
      fetch(`${API_BASE}/api/questions/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ minutes: elapsedMinutes }),
      }).catch(err => console.warn('Time sync failed:', err.message));
    }
  }

  // ── All done ───────────────────────────────────────────────────────────────
  if (currentIndex < 0) {
    return (
      <div className="card-stack">
        <div className="deck-placeholder">
          <span className="deck-placeholder-label">All complete</span>
        </div>
      </div>
    );
  }

  // ── Active deck ────────────────────────────────────────────────────────────
  return (
    <div className="card-stack">
      {deck.map((question, index) => {
        if (index < currentIndex - (VISIBLE_CARD_COUNT - 1)) return null;
        if (index > currentIndex) return null;

        const depth      = currentIndex - index;
        const scale      = 1 - depth * STACK_SCALE_STEP;
        const translateY = depth * STACK_OFFSET_PX;

        return (
          <DeckCard
            key={`${question.id}-${question._version}`}
            question={question}
            initialMs={question._elapsedMs ?? 0}
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
