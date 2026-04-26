/**
 * SchedulePanel — full-day activity list, shown when the ScheduleWidget is expanded.
 *
 * Props:
 *   schedule  — sorted enriched array from useSchedule (each item has startDate, duration_min, title, category, id)
 *   current   — the currently-active activity, or null
 */
import '../styles/schedule.css';

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function SchedulePanel({ schedule, current }) {
  const now = new Date();

  return (
    <div className="schedule-panel">
      <p className="sp-heading">Today</p>
      <ul className="sp-list">
        {schedule.map(activity => {
          const endMs   = activity.startDate.getTime() + activity.duration_min * 60_000;
          const isCurrent = activity.id === current?.id;
          const isPast    = !isCurrent && endMs < now.getTime();

          return (
            <li
              key={activity.id}
              className={`sp-item${isCurrent ? ' sp-item--current' : isPast ? ' sp-item--past' : ''}`}
            >
              <span className="sp-time">{fmtTime(activity.startDate)}</span>
              <span className="sp-title">{activity.front}</span>
              <span className="sp-meta">
                <span className="sp-duration">{fmtDuration(activity.duration_min)}</span>
                <span className="sp-category">{activity.type}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
