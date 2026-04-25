/**
 * Summary — session-complete screen shown when all cards have been swiped.
 *
 * Props:
 *   stats   — { correct, incorrect, completed, deferred } counts
 *   onReset — callback to restart the session
 */
import '../styles/summary.css';

const TILES = [
  { key: 'correct',   label: 'Correct',   cls: 'tile-correct'  },
  { key: 'incorrect', label: 'Incorrect', cls: 'tile-missed'   },
  { key: 'completed', label: 'Completed', cls: 'tile-done'     },
  { key: 'deferred',  label: 'Deferred',  cls: 'tile-deferred' },
];

export default function Summary({ stats, onReset }) {
  const total = stats.correct + stats.incorrect + stats.completed + stats.deferred;

  return (
    <div className="summary-screen">
      <div>
        <h2 className="summary-heading">Session complete</h2>
        <p className="summary-subheading">{total} card{total !== 1 ? 's' : ''} reviewed</p>
      </div>

      <div className="summary-grid">
        {TILES.map(({ key, label, cls }) => (
          <div key={key} className={`summary-tile ${cls}`}>
            <span className="summary-tile-number">{stats[key]}</span>
            <span className="summary-tile-label">{label}</span>
          </div>
        ))}
      </div>

      <button className="restart-btn" onClick={onReset}>
        Start over
      </button>
    </div>
  );
}
