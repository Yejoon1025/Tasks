/**
 * ScheduleWidget — compact bar showing the current or next scheduled activity.
 *
 * Clicking the widget toggles the full-day SchedulePanel open/closed.
 *
 * Props:
 *   current   — enriched activity object or null (from useSchedule)
 *   next      — enriched activity object or null (from useSchedule)
 *   progress  — 0–1 float (only relevant when current != null)
 *   expanded  — bool: whether the full schedule panel is open
 *   onToggle  — callback to open/close the panel
 */
import '../styles/schedule.css';

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Chevron({ expanded }) {
  return (
    <svg
      className={`sw-chevron${expanded ? ' sw-chevron--up' : ''}`}
      width="14" height="14" viewBox="0 0 14 14"
      fill="none" aria-hidden="true"
    >
      <path d="M3 5l4 4 4-4"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ScheduleWidget({ current, next, progress, expanded, onToggle }) {
  const isEmpty = !current && !next;

  return (
    <div
      className={`schedule-widget${
        isEmpty        ? ' schedule-widget--empty'    :
        current        ? ' schedule-widget--now'      :
                         ' schedule-widget--next'
      }${expanded ? ' schedule-widget--expanded' : ''}`}
      onClick={onToggle}
      role="button"
      aria-expanded={expanded}
    >
      {isEmpty ? (
        <>
          <span className="sw-empty-text">No upcoming events</span>
          <Chevron expanded={expanded} />
        </>
      ) : (
        <>
          {/* Status badge */}
          <span className={`sw-badge sw-badge--${current ? 'now' : 'next'}`}>
            {current ? 'NOW' : 'NEXT'}
          </span>

          {/* Time + title */}
          <div className="sw-body">
            <span className="sw-time">{fmtTime((current ?? next).startDate)}</span>
            <span className="sw-title">{(current ?? next).front}</span>
          </div>

          {/* Type pill */}
          <span className="sw-category">{(current ?? next).type}</span>

          {/* Expand/collapse chevron */}
          <Chevron expanded={expanded} />

          {/* Progress bar — only when an activity is ongoing */}
          {current && progress != null && (
            <div className="sw-progress-track">
              <div className="sw-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
