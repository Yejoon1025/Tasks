/**
 * CardStack — manages the deck of cards and progress tracking.
 *
 * Cards swiped left/right are recorded and removed from the active deck.
 * Cards swiped up are re-queued at the back of the deck with a bumped
 * _version so their DeckCard component remounts fresh when they return.
 *
 * Notes on open-ended cards survive re-queueing because they are stored in
 * localStorage (keyed by question.id) in OpenEndedCard, independent of
 * React component lifecycle.
 */
import { useState } from 'react';

import DeckCard from './cards/DeckCard.jsx';
import Summary  from './Summary.jsx';

import { VISIBLE_CARD_COUNT, STACK_SCALE_STEP, STACK_OFFSET_PX } from '../config.js';
import { API_BASE } from '../api.js';
import '../styles/cards.css';

export default function CardStack({ questions, onSwipe, sessionStats, onReset }) {
  // Enrich questions with _version so we can force-remount re-queued cards
  const [deck, setDeck] = useState(() =>
    questions.map(q => ({ ...q, _version: 0 }))
  );
  const [currentIndex, setCurrentIndex] = useState(deck.length - 1);

  // ── Swipe left / right ─────────────────────────────────────────────────────
  function handleSwipe(id, direction, type) {
    onSwipe(id, direction, type);
    setCurrentIndex(i => i - 1);

    // Fire-and-forget: log result to Google Sheets (silent on failure)
    fetch(`${API_BASE}/api/results`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cardId: id, cardType: type, direction }),
    }).catch(err => console.warn('Result sync failed:', err.message));
  }

  // ── Swipe up: re-queue at the back ─────────────────────────────────────────
  function handleSkip() {
    setDeck(prev => {
      const card = prev[currentIndex];
      if (!card) return prev;
      // Remove from current position, bump version, prepend to index 0
      // (index 0 = last to be shown, since we iterate from the top down)
      const rest = prev.filter((_, i) => i !== currentIndex);
      return [{ ...card, _version: card._version + 1 }, ...rest];
    });
    // currentIndex stays the same — now points to the next card in the deck
  }

  // ── Deck exhausted ─────────────────────────────────────────────────────────
  if (currentIndex < 0) {
    return <Summary stats={sessionStats} onReset={onReset} />;
  }

  // ── Active deck ────────────────────────────────────────────────────────────
  return (
    <div className="card-stack">
      {deck.map((question, index) => {
        if (index < currentIndex - (VISIBLE_CARD_COUNT - 1)) return null;
        if (index > currentIndex) return null;

        const depth     = currentIndex - index; // 0 = top card
        const scale     = 1 - depth * STACK_SCALE_STEP;
        const translateY = depth * STACK_OFFSET_PX;

        return (
          <DeckCard
            key={`${question.id}-${question._version}`}
            question={question}
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
