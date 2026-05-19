/**
 * HealthKitSyncToaster
 * ────────────────────
 * Tiny invisible component that bridges native HealthKit sync events
 * (dispatched from initCapacitorShell.js → healthKitSync.maybeSyncOnAppOpen)
 * into the React NotificationContext so the user sees a visible toast
 * every time data flows in from Apple Health.
 *
 * Why this matters: App Store Review Guideline 2.5.1 requires HealthKit
 * data access be "clearly identified in the app's user interface". Our
 * previous behaviour pulled workouts silently every 24h — even though
 * the Settings card was clearly labeled, the actual data pull happened
 * with zero on-screen feedback, which Apple reviewers flagged in the
 * May 2026 review (Submission 6d7103fa). Toast-on-sync makes the
 * HealthKit-as-source attribution unmistakable for every imported
 * workout.
 *
 * Renders nothing; lives at app root inside NotificationProvider.
 */
import { useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';

export default function HealthKitSyncToaster() {
  const { addNotification } = useNotification();

  useEffect(() => {
    const onSynced = (event) => {
      const detail = event?.detail || {};
      if (detail.kind === 'imported' && detail.imported > 0) {
        const n = detail.imported;
        addNotification(
          `Imported ${n} workout${n === 1 ? '' : 's'} from Apple Health`,
          'success',
        );
      } else if (detail.kind === 'error') {
        // Best-effort. Errors are usually transient (e.g. iOS deauthorised
        // a category mid-session), and we don't want to spam the user on
        // every app foreground — only show if the error message has actual
        // signal in it.
        const msg = detail.error;
        if (msg && !/throttled|empty-or-denied/i.test(msg)) {
          addNotification(`Apple Health sync error: ${msg}`, 'warning');
        }
      }
    };
    window.addEventListener('healthkit:synced', onSynced);
    return () => window.removeEventListener('healthkit:synced', onSynced);
  }, [addNotification]);

  return null;
}
