/**
 * TaskCard — single-faced card for a to-do task.
 *
 * Displays: project badge, title, description, and a colour-coded due date pill.
 * No flip — the whole card is the front.  Swiping is handled by the parent DeckCard.
 */
import '../../styles/tasks.css';
import '../../styles/cards.css';

// ── Due-date helpers ───────────────────────────────────────────────────────────
function fmtDue(dateStr) {
  if (!dateStr) return null;
  // Parse as local midnight to avoid UTC-offset shifting the day
  const due  = new Date(dateStr + 'T00:00:00');
  const now  = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((due - todayMidnight) / 86_400_000);

  if (diffDays < 0)   return { label: 'Overdue',  cls: 'tc-due--overdue'  };
  if (diffDays === 0) return { label: 'Today',    cls: 'tc-due--today'    };
  if (diffDays === 1) return { label: 'Tomorrow', cls: 'tc-due--tomorrow' };
  return {
    label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cls: 'tc-due--future',
  };
}

export default function TaskCard({ question: task }) {
  const due = fmtDue(task.due_date);

  return (
    <div className="tc-wrapper">
      <div className="card-face card-front tc-front">

        {/* ── Top row: project badge + due date ───────────────────────────── */}
        <div className="tc-toprow">
          <span className="card-badge badge-project">{task.type || 'Task'}</span>
          {due && <span className={`tc-due ${due.cls}`}>{due.label}</span>}
        </div>

        {/* ── Title ────────────────────────────────────────────────────────── */}
        <p className="tc-title">{task.front}</p>

        {/* ── Description ──────────────────────────────────────────────────── */}
        {task.back && (
          <p className="tc-desc">{task.back}</p>
        )}

        {/* ── Footer: drag hint ─────────────────────────────────────────────── */}
        <div className="tc-footer">
          <span className="card-hint" style={{ marginLeft: 'auto' }}>
            Drag to complete · swipe up to skip
          </span>
        </div>

      </div>
    </div>
  );
}
