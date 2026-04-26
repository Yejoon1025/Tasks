/**
 * Summary — session-complete screen shown when all flashcards have been swiped.
 *
 * Props:
 *   stats — { done, deferred } counts from useSession
 */
import '../styles/summary.css';

const TILES = [
  { key: 'done',     label: 'Done',     cls: 'tile-correct'  },
  { key: 'deferred', label: 'Deferred', cls: 'tile-deferred' },
];

export default function Summary({ stats }) {
  const total = stats.done + stats.deferred;

  return (
    <div className="summary-screen">
      <div>
        <h2 className="summary-heading">All done</h2>
        <p className="summary-subheading">
          {total} card{total !== 1 ? 's' : ''} reviewed
        </p>
      </div>

      <div className="summary-grid">
        {TILES.map(({ key, label, cls }) => (
          <div key={key} className={`summary-tile ${cls}`}>
            <span className="summary-tile-number">{stats[key]}</span>
            <span className="summary-tile-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
