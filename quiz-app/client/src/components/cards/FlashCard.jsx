/**
 * FlashCard — renders a two-sided flip card for question/answer pairs.
 *
 * Front: question + deck tag
 * Back:  answer text
 * Flip:  tap/click anywhere on the card
 */
import { useState } from 'react';
import '../../styles/cards.css';

export default function FlashCard({ question }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="card-inner-wrapper" onClick={() => setFlipped(f => !f)}>
      <div className={`card-flip ${flipped ? 'is-flipped' : ''}`}>

        {/* ── Front face ─────────────────────────────────────────────────── */}
        <div className="card-face card-front">
          <span className="card-badge badge-flash">Flashcard</span>
          <p className="card-deck-tag">{question.deck}</p>
          <p className="card-body">{question.front}</p>
          <span className="card-hint">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Tap to flip
          </span>
        </div>

        {/* ── Back face ──────────────────────────────────────────────────── */}
        <div className="card-face card-back">
          <span className="card-badge badge-answer">Answer</span>
          <p className="card-body is-answer">{question.back}</p>
          <span className="card-hint">Drag to record your result</span>
        </div>

      </div>
    </div>
  );
}
