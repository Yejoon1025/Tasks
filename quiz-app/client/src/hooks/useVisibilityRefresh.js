/**
 * useVisibilityRefresh — fires a callback whenever the page becomes visible.
 *
 * Used for cross-device sync: when the user switches back to the tab (or
 * unlocks their phone) the callback re-fetches data so changes made on
 * another device appear without a manual reload.
 *
 * The callback is stored in a ref so the effect never needs to re-register —
 * the latest version of the function is always called without stale closures.
 */
import { useEffect, useRef } from 'react';

export function useVisibilityRefresh(callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback; // always current, no re-registration needed

  useEffect(() => {
    function handle() {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []); // empty deps — intentional, callback kept fresh via ref
}
