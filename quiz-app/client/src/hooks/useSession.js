/**
 * useSession — tracks swipe results for the current study session.
 *
 * Persists to localStorage so progress survives a page refresh.
 * Call resetSession() to clear and start fresh.
 */
import { useState, useCallback } from 'react';
import { SESSION_STORAGE_KEY } from '../config.js';

// ── Helpers ────────────────────────────────────────────────────────────────
const EMPTY_SESSION = () => ({ correct: [], incorrect: [], completed: [], deferred: [] });

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : EMPTY_SESSION();
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
   * Record a swipe result for a card.
   * @param {string} id        - question id
   * @param {'left'|'right'} direction
   * @param {'flashcard'|'open-ended'} type
   */
  const recordSwipe = useCallback((id, direction, type) => {
    setSession(prev => {
      const next = { ...prev };

      if (type === 'flashcard') {
        next[direction === 'right' ? 'correct' : 'incorrect'] = [...prev[direction === 'right' ? 'correct' : 'incorrect'], id];
      } else {
        next[direction === 'right' ? 'completed' : 'deferred'] = [...prev[direction === 'right' ? 'completed' : 'deferred'], id];
      }

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
    correct:   session.correct.length,
    incorrect: session.incorrect.length,
    completed: session.completed.length,
    deferred:  session.deferred.length,
  };

  return { session, recordSwipe, resetSession, sessionStats };
}
