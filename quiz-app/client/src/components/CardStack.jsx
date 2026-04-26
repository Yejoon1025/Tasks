/**
 * CardStack — manages the deck of flashcards and progress tracking.
 *
 * Each card in the deck carries _elapsedMs — the total milliseconds already
 * logged to the server for that card.  DeckCard uses this as a display offset
 * (so the badge shows cumulative time) but computeMinutes() only returns the
 * NEW incremental delta, which is what we send to the server to accumulate.
 *
 * On skip: _elapsedMs is updated so the next DeckCard instance for that card
 * starts the badge from where the user left off — even after a page reload,
 * the server-stored time_spent_min is used to re-seed _elapsedMs.
 */
import { useState } from 'react';

import DeckCard from './cards/DeckCard.jsx';
import Summary  from './Summary.jsx';

import { VISIBLE_CARD_COUNT, STACK_SCALE_STEP, STACK_OFFSET_PX } from '../config.js';
import { API_BASE } from '../api.js';
import '../styles/cards.css';

export default function CardStack({ questions, onSwipe, sessionStats }) {
  // Enrich each question with _version (for remount) and _elapsedMs (for timer seeding)
  const [deck, setDeck] = useState(() =>
    questions.map(q => ({
      ...q,
      _version:   0,
      _elapsedMs: Math.round((parseFloat(q.time_spent_min) || 0) * 60 * 1000),
    }))
  );
  const [currentIndex, setCurrentIndex] = useState(deck.length - 1);

  // ── Swipe left / right ─────────────────────────────────────────────────────
  // elapsedMinutes: incremental time from THIS DeckCard instance (not including prior sessions)
  function handleSwipe(id, direction, _type, elapsedMinutes) {
    onSwipe(id, direction);
    setCurrentIndex(i => i - 1);

    const result = direction === 'right' ? 'done' : 'deferred';

    // Persist result + incremental time to the question row
    fetch(`${API_BASE}/api/questions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ minutes: elapsedMinutes, result }),
    }).catch(err => console.warn('Question sync failed:', err.message));

    // Append to the Results log
    fetch(`${API_BASE}/api/results`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cardId: id, cardType: 'flashcard', direction, time_spent_min: elapsedMinutes }),
    }).catch(err => console.warn('Result sync failed:', err.message));
  }

  // ── Swipe up: re-queue at the back ─────────────────────────────────────────
  function handleSkip(id, elapsedMinutes) {
    setDeck(prev => {
      const card = prev[currentIndex];
      if (!card) return prev;
      const rest = prev.filter((_, i) => i !== currentIndex);
      // Accumulate the new incremental ms onto _elapsedMs so the re-mounted
      // DeckCard badge continues from where the user left off
      const newElapsedMs = (card._elapsedMs ?? 0) + Math.round(elapsedMinutes * 60 * 1000);
      return [{ ...card, _version: card._version + 1, _elapsedMs: newElapsedMs }, ...rest];
    });

    // Persist incremental time (no result on skip — card is re-queued)
    if (elapsedMinutes > 0) {
      fetch(`${API_BASE}/api/questions/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ minutes: elapsedMinutes }),
      }).catch(err => console.warn('Time sync failed:', err.message));
    }
  }

  // ── Deck exhausted ─────────────────────────────────────────────────────────
  if (currentIndex < 0) {
    return <Summary stats={sessionStats} />;
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
