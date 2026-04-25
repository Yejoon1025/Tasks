/**
 * useSession — tracks swipe results for the current study session.
 *
 * Tracks done (right swipe) and deferred (left swipe) card IDs.
 * Persists to localStorage so progress survives a page refresh.
 * Call resetSession() to clear and start fresh.
 */
import { useState, useCallback } from 'react';
import { SESSION_STORAGE_KEY } from '../config.js';

// ── Helpers ────────────────────────────────────────────────────────────────
const EMPTY_SESSION = () => ({ done: [], deferred: [] });

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return EMPTY_SESSION();
    const parsed = JSON.parse(raw);
    // Migrate old sessions that used correct/incorrect keys
    if (parsed.correct !== undefined) {
      return { done: parsed.correct ?? [], deferred: parsed.incorrect ?? [] };
    }
    return parsed;
  } catch {
    return EMPTY_SESSION();
  }
}

function persistSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useSession() {
  const [session, setSession] = useState(loadSession);

  /**
   * Record a swipe result for a flashcard.
   * @param {string}          id        - question id
   * @param {'left'|'right'}  direction - right = done, left = deferred
   */
  const recordSwipe = useCallback((id, direction) => {
    setSession(prev => {
      const key  = direction === 'right' ? 'done' : 'deferred';
      const next = { ...prev, [key]: [...prev[key], id] };
      persistSession(next);
      return next;
    });
  }, []);

  /** Clear all session data and restart. */
  const resetSession = useCallback(() => {
    const fresh = EMPTY_SESSION();
    persistSession(fresh);
    setSession(fresh);
  }, []);

  const sessionStats = {
    done:     session.done.length,
    deferred: session.deferred.length,
  };

  return { session, recordSwipe, resetSession, sessionStats };
}
