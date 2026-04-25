/**
 * useSchedule — fetches the daily schedule and finds the current/next activity.
 *
 * Returns:
 *   schedule  — full sorted array of enriched activity objects
 *   current   — activity whose window contains now (start ≤ now < start + duration_min), or null
 *   next      — first activity whose start > now, or null
 *   progress  — 0–1 float: how far through `current` we are (null if no current)
 *   loading   — true while the initial fetch is in flight
 *   error     — error message string, or null
 *
 * Auto-advances every 60 s via setInterval — no page reload needed.
 */
import { useState, useEffect } from 'react';
import { API_BASE } from '../api.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Return today's date as a YYYY-MM-DD string in local time. */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse "HH:MM" into a Date anchored to today's local date.
 * Returns null for malformed input.
 */
function parseTimeToday(hhMM) {
  if (!hhMM || typeof hhMM !== 'string') return null;
  const parts = hhMM.trim().split(':');
  if (parts.length !== 2) return null;
  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Attach startDate, coerce duration_min to int, sort ascending.
 * Rows with unparseable times are silently dropped.
 * Rows with a date set to something other than today are excluded —
 * rows with an empty/missing date are treated as recurring daily events.
 */
function enrichAndSort(raw) {
  const today = todayStr();
  return raw
    .filter(row => !row.date || row.date === today)
    .map(row => {
      const startDate = parseTimeToday(row.time);
      if (!startDate) return null;
      return { ...row, duration_min: parseInt(row.duration_min, 10) || 0, startDate };
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate - b.startDate);
}

/**
 * Walk the sorted schedule and return the current activity, the next one,
 * and (if current) how far through it we are as a [0, 1] float.
 */
function findCurrentAndNext(schedule, now) {
  let current  = null;
  let next     = null;
  const nowMs  = now.getTime();

  for (const activity of schedule) {
    const start = activity.startDate.getTime();
    const end   = start + activity.duration_min * 60_000;

    if (nowMs >= start && nowMs < end) {
      current = activity;
    } else if (nowMs < start && !next) {
      next = activity;
    }
  }

  const progress = current
    ? Math.min(1, Math.max(0,
        (nowMs - current.startDate.getTime()) / (current.duration_min * 60_000)
      ))
    : null;

  return { current, next, progress };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSchedule() {
  const [schedule,    setSchedule]    = useState([]);
  const [now,         setNow]         = useState(() => new Date());
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Fetch on mount, and again whenever refreshTick increments
  useEffect(() => {
    fetch(`${API_BASE}/api/schedule`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setSchedule(enrichAndSort(data));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [refreshTick]);

  // Tick every 60 s so current/next advances automatically
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  /** Re-fetch the schedule (call after adding a new event). */
  function refresh() { setRefreshTick(t => t + 1); }

  const { current, next, progress } = findCurrentAndNext(schedule, now);

  return { schedule, current, next, progress, loading, error, refresh };
}
