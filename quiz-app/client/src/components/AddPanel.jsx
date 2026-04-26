/**
 * AddPanel — bottom-sheet form for adding a flashcard, task, or schedule event.
 *
 * Props:
 *   defaultTab  — 'question' | 'task' | 'schedule'  (which tab opens first)
 *   onClose()   — called when the scrim is tapped or after a successful submit
 *   onAdded(type, item) — called on success so the caller can update local state:
 *       type='question' → item is the new question object
 *       type='task'     → item is the new task object
 *       type='schedule' → item is null (caller should re-fetch via refreshSchedule)
 *
 * All sheets now share the same column names: front, back, type.
 *   front = question / task title / schedule title
 *   back  = answer / task description  (questions and tasks only)
 *   type  = deck / project / category
 */
import { useState } from 'react';
import { API_BASE } from '../api.js';
import '../styles/add-panel.css';

const TABS = ['question', 'task', 'schedule'];
const TAB_LABEL = { question: 'Flashcard', task: 'Task', schedule: 'Schedule' };

export default function AddPanel({ defaultTab = 'question', onClose, onAdded }) {
  const [tab, setTab] = useState(defaultTab);

  // ── Question (flashcard) state ───────────────────────────────────────────
  const [qFront, setQFront] = useState('');
  const [qBack,  setQBack]  = useState('');
  const [qType,  setQType]  = useState('');   // deck name

  // ── Task state ───────────────────────────────────────────────────────────
  const [tFront, setTFront] = useState('');   // title
  const [tBack,  setTBack]  = useState('');   // description
  const [tType,  setTType]  = useState('');   // project
  const [tDue,   setTDue]   = useState('');

  // ── Schedule state ───────────────────────────────────────────────────────
  const [sTime,  setSTime]  = useState('');
  const [sFront, setSFront] = useState('');   // activity name
  const [sDur,   setSDur]   = useState('');
  const [sType,  setSType]  = useState('');   // category
  // Default to today; leave blank = recurring daily
  const [sDate,  setSDate]  = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  // ── Submission state ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      let url, body;

      if (tab === 'question') {
        url  = `${API_BASE}/api/questions`;
        body = { front: qFront.trim(), back: qBack.trim(), type: qType.trim() };
      } else if (tab === 'task') {
        url  = `${API_BASE}/api/tasks`;
        body = { front: tFront.trim(), back: tBack.trim(), type: tType.trim(), due_date: tDue };
      } else {
        url  = `${API_BASE}/api/schedule`;
        body = { time: sTime, front: sFront.trim(), duration_min: Number(sDur) || 30, type: sType.trim(), date: sDate };
      }

      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Re-fetch so the new card arrives with a proper _sheetRow from the server.
      // CardStack/TaskStack will pick it up via their prop-change useEffect.
      onAdded?.(tab);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Scrim — tap to dismiss */}
      <div className="add-scrim" onClick={onClose} />

      <div className="add-panel" onClick={e => e.stopPropagation()}>
        <div className="add-panel-handle" />

        {/* ── Tab bar ───────────────────────────────────────────────── */}
        <div className="add-panel-tabs">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              className={`add-panel-tab${tab === t ? ' add-panel-tab--active' : ''}`}
              onClick={() => { setTab(t); setError(''); }}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {/* ── Form ──────────────────────────────────────────────────── */}
        <form className="add-form" onSubmit={handleSubmit}>

          {/* ── Flashcard fields ────────────────────────────────────── */}
          {tab === 'question' && (
            <>
              <div className="add-field">
                <label>Question</label>
                <textarea value={qFront} onChange={e => setQFront(e.target.value)}
                  placeholder="What is…?" required />
              </div>
              <div className="add-field">
                <label>Answer</label>
                <textarea value={qBack} onChange={e => setQBack(e.target.value)}
                  placeholder="The answer is…" />
              </div>
              <div className="add-field">
                <label>Deck</label>
                <input value={qType} onChange={e => setQType(e.target.value)}
                  placeholder="e.g. Biology" required />
              </div>
            </>
          )}

          {/* ── Task fields ─────────────────────────────────────────── */}
          {tab === 'task' && (
            <>
              <div className="add-field">
                <label>Title</label>
                <input value={tFront} onChange={e => setTFront(e.target.value)}
                  placeholder="Task title…" required />
              </div>
              <div className="add-field">
                <label>Description</label>
                <textarea value={tBack} onChange={e => setTBack(e.target.value)}
                  placeholder="Optional details…" />
              </div>
              <div className="add-field">
                <label>Project</label>
                <input value={tType} onChange={e => setTType(e.target.value)}
                  placeholder="e.g. Work" />
              </div>
              <div className="add-field">
                <label>Due Date</label>
                <input type="date" value={tDue} onChange={e => setTDue(e.target.value)} />
              </div>
            </>
          )}

          {/* ── Schedule fields ──────────────────────────────────────── */}
          {tab === 'schedule' && (
            <>
              <div className="add-field">
                <label>Date — leave blank to repeat daily</label>
                <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} />
              </div>
              <div className="add-field">
                <label>Time</label>
                <input type="time" value={sTime} onChange={e => setSTime(e.target.value)} required />
              </div>
              <div className="add-field">
                <label>Activity</label>
                <input value={sFront} onChange={e => setSFront(e.target.value)}
                  placeholder="Activity name…" required />
              </div>
              <div className="add-field">
                <label>Duration (minutes)</label>
                <input type="number" min="1" value={sDur} onChange={e => setSDur(e.target.value)}
                  placeholder="30" />
              </div>
              <div className="add-field">
                <label>Category</label>
                <input value={sType} onChange={e => setSType(e.target.value)}
                  placeholder="e.g. Focus" />
              </div>
            </>
          )}

          {error && <p className="add-error">{error}</p>}

          <button className="add-submit-btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : `Add ${TAB_LABEL[tab]}`}
          </button>

        </form>
      </div>
    </>
  );
}
