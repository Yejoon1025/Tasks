/**
 * WarmupCard — single-faced card for daily warm-up tasks.
 * Shown inside DeckCard during the WarmupGate sequence.
 */
import '../../styles/cards.css';
import '../../styles/warmup.css';

export default function WarmupCard({ question: task }) {
  return (
    <div className="wc-wrapper">
      <div className="card-face card-front wc-front">
        <span className="card-badge wc-badge">Warm-Up</span>
        <p className="wc-title">{task.front}</p>
        {task.back && (
          <p className="wc-desc">{task.back}</p>
        )}
        <span className="card-hint">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M9.5 6H2.5M9.5 6L6.5 3M9.5 6L6.5 9"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Swipe right when done
        </span>
      </div>
    </div>
  );
}
