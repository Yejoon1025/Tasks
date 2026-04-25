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
  const [qDeck,  setQDeck]  = useState('');

  // ── Task state ───────────────────────────────────────────────────────────
  const [tTitle, setTTitle] = useState('');
  const [tDesc,  setTDesc]  = useState('');
  const [tProj,  setTProj]  = useState('');
  const [tDue,   setTDue]   = useState('');

  // ── Schedule state ───────────────────────────────────────────────────────
  const [sTime,  setSTime]  = useState('');
  const [sTitle, setSTitle] = useState('');
  const [sDur,   setSDur]   = useState('');
  const [sCat,   setSCat]   = useState('');
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
        body = { front: qFront.trim(), back: qBack.trim(), deck: qDeck.trim() };
      } else if (tab === 'task') {
        url  = `${API_BASE}/api/tasks`;
        body = { title: tTitle.trim(), description: tDesc.trim(), project: tProj.trim(), due_date: tDue };
      } else {
        url  = `${API_BASE}/api/schedule`;
        body = { time: sTime, title: sTitle.trim(), duration_min: Number(sDur) || 30, category: sCat.trim(), date: sDate };
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

      const { id } = await res.json();

      // Build a local object for immediate in-app update
      let newItem = null;
      if (tab === 'question') {
        newItem = { id: String(id), front: qFront.trim(), back: qBack.trim(), deck: qDeck.trim(), time_spent_min: 0 };
      } else if (tab === 'task') {
        newItem = { id: String(id), title: tTitle.trim(), description: tDesc.trim(), project: tProj.trim(), due_date: tDue, time_spent_min: 0 };
      }
      // schedule: caller re-fetches via refresh()

      onAdded?.(tab, newItem);
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
                <input value={qDeck} onChange={e => setQDeck(e.target.value)}
                  placeholder="e.g. Biology" required />
              </div>
            </>
          )}

          {/* ── Task fields ─────────────────────────────────────────── */}
          {tab === 'task' && (
            <>
              <div className="add-field">
                <label>Title</label>
                <input value={tTitle} onChange={e => setTTitle(e.target.value)}
                  placeholder="Task title…" required />
              </div>
              <div className="add-field">
                <label>Description</label>
                <textarea value={tDesc} onChange={e => setTDesc(e.target.value)}
                  placeholder="Optional details…" />
              </div>
              <div className="add-field">
                <label>Project</label>
                <input value={tProj} onChange={e => setTProj(e.target.value)}
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
                <label>Title</label>
                <input value={sTitle} onChange={e => setSTitle(e.target.value)}
                  placeholder="Activity name…" required />
              </div>
              <div className="add-field">
                <label>Duration (minutes)</label>
                <input type="number" min="1" value={sDur} onChange={e => setSDur(e.target.value)}
                  placeholder="30" />
              </div>
              <div className="add-field">
                <label>Category</label>
                <input value={sCat} onChange={e => setSCat(e.target.value)}
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
