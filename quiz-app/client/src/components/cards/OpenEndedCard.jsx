/**
 * OpenEndedCard — flip card with a freeform notes textarea on the back.
 *
 * Front:  prompt + deck tag  (tap anywhere to flip to back)
 * Back:   full-bleed textarea + floating top-bar with deck tag & back button
 *         (tap the top-bar to flip back to front)
 *
 * Notes auto-save to localStorage on every keystroke.
 * Swiping is unlocked as soon as the card flips to the back.
 */
import { useState, useRef } from 'react';
import { NOTE_STORAGE_PREFIX } from '../../config.js';
import { API_BASE } from '../../api.js';
import '../../styles/cards.css';

export default function OpenEndedCard({ question, onReady }) {
  const storageKey = `${NOTE_STORAGE_PREFIX}${question.id}`;

  const [flipped, setFlipped] = useState(false);
  const [note,    setNote]    = useState(() => localStorage.getItem(storageKey) ?? '');
  const debounceRef           = useRef(null);

  function flipToBack() {
    setFlipped(true);
    onReady?.(); // unlock swiping the moment the back is shown
  }

  function flipToFront() {
    setFlipped(false);
  }

  function handleNoteChange(e) {
    const value = e.target.value;
    setNote(value);
    localStorage.setItem(storageKey, value); // auto-save every keystroke (primary store)

    // Debounced sync to Google Sheets — fires 1 s after the last keystroke
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/api/questions/${question.id}/notes`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: value }),
      }).catch(err => console.warn('Notes sync failed:', err.message));
    }, 1000);
  }

  return (
    <div className="card-inner-wrapper">
      <div className={`card-flip ${flipped ? 'is-flipped' : ''}`}>

        {/* ── Front face — tap to flip ──────────────────────────────────── */}
        <div className="card-face card-front" onClick={flipToBack}>
          <span className="card-badge badge-open">Open Ended</span>
          <p className="card-deck-tag">{question.deck}</p>
          <p className="card-body">{question.front}</p>
          <span className="card-hint">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 9.5V2.5M6 2.5L3 5.5M6 2.5L9 5.5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Tap to respond
          </span>
        </div>

        {/* ── Back face — flush textarea + floating top-bar ─────────────── */}
        <div className="card-face card-back open-back">

          {/* Floating header — tap to go back to question */}
          <div className="note-topbar" onClick={flipToFront}>
            <span className="note-topbar-back">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M7.5 2.5L4.5 6l3 3.5"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Question
            </span>
            <span className="note-topbar-deck">{question.deck}</span>
          </div>

          {/* Full-bleed textarea */}
          <textarea
            className="note-area"
            placeholder="Type your thoughts…"
            value={note}
            onChange={handleNoteChange}
            onClick={e => e.stopPropagation()}
          />

        </div>

      </div>
    </div>
  );
}
