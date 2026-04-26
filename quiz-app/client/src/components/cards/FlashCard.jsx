/**
 * FlashCard — renders a two-sided flip card for question/answer pairs.
 *
 * Front: question text + deck badge
 * Back:  answer text (only shown if non-empty)
 * Flip:  double-tap anywhere on the card.  If back is empty the card never flips.
 */
import { useState, useRef } from 'react';
import '../../styles/cards.css';

const DOUBLE_TAP_MS = 300;   // max gap between two taps to count as double-tap

export default function FlashCard({ question }) {
  const [flipped,     setFlipped]     = useState(false);
  const lastTapRef = useRef(0);

  const hasBack = question.back && question.back.trim() !== '';

  function handleTap(e) {
    // Let the tap bubble up to DeckCard's surface handler (timer toggle).
    // Only intercept double-taps when there's a back face to show.
    if (!hasBack) return;
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      e.stopPropagation();           // don't let the flip also trigger a timer toggle
      setFlipped(f => !f);
      lastTapRef.current = 0;        // reset so a third tap doesn't flip again
    } else {
      lastTapRef.current = now;
    }
  }

  return (
    <div className="card-inner-wrapper" onClick={handleTap}>
      <div className={`card-flip ${flipped ? 'is-flipped' : ''}`}>

        {/* ── Front face ─────────────────────────────────────────────────── */}
        <div className="card-face card-front">
          <span className="card-badge badge-deck">{question.type || 'Card'}</span>
          <p className="card-body">{question.front}</p>
          {hasBack && (
            <span className="card-hint">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Double-tap to flip
            </span>
          )}
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
