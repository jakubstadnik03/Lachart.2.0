/**
 * useWakeLock
 * ───────────
 * Keeps the screen on for the lifetime of the component (or until disabled).
 *
 * Uses the standard `navigator.wakeLock.request('screen')` API. Supported on
 * Chrome, Edge, Safari 16.4+, and Capacitor WKWebView (iOS 16.4+).
 *
 * Behaviour:
 *   • Acquires a wake lock on mount when `enabled` is true.
 *   • Re-acquires automatically after the OS releases the lock (e.g. tab
 *     switch + re-foreground, screen orientation change). The W3C spec
 *     releases wake locks on visibility change, which would otherwise
 *     leave the user with a sleeping screen the moment they switch
 *     apps and switch back mid-workout.
 *   • Releases the lock on unmount or when `enabled` flips to false.
 *
 * Usage:
 *   const wake = useWakeLock(true);
 *   wake.supported    // boolean — false on older browsers
 *   wake.active       // boolean — true when the screen-on lock is held
 */
import { useEffect, useRef, useState } from 'react';

export default function useWakeLock(enabled = true) {
  const lockRef = useRef(null);
  const [active, setActive] = useState(false);
  const [supported] = useState(() =>
    typeof navigator !== 'undefined' && 'wakeLock' in navigator
  );

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || !enabled) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          try { await lock.release(); } catch (_) {}
          return;
        }
        lockRef.current = lock;
        setActive(true);
        // Browser releases the lock on tab hide; re-request when we come back.
        lock.addEventListener('release', () => {
          lockRef.current = null;
          setActive(false);
        });
      } catch (err) {
        // Common reasons: page not visible, battery saver, etc. — silent.
        console.warn('[wakeLock] request failed:', err?.message || err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && enabled && !lockRef.current) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const cur = lockRef.current;
      lockRef.current = null;
      setActive(false);
      if (cur) {
        try { cur.release(); } catch (_) { /* swallow */ }
      }
    };
  }, [enabled, supported]);

  return { supported, active };
}
