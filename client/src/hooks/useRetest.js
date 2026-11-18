import { useCallback, useMemo, useState } from 'react';
import { setTestRetest } from '../services/api';
import { trackFeatureUsage } from '../utils/analytics';
import { retestStatus, daysUntilRetest } from '../utils/retestPlan';

/**
 * The behaviour behind the retest card, shared by the web and native renderings.
 *
 * The two pages have different style vocabularies (Tailwind on the web testing
 * page, inline styles and GlassCard on the phone), so they get their own thin
 * presentational components — but the rules about when a retest is due, and
 * what a write does, live here once. See client/src/utils/retestPlan.js for
 * why the loop exists and why it is not an email.
 *
 * @param test        the test doc ({ _id, date, sport, retest })
 * @param newerTestAt date of the athlete's most recent later test, or null —
 *                    its presence closes the plan
 * @param onChanged   called with the updated `retest` subdoc after a write
 */
export function useRetest(test, newerTestAt = null, onChanged) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(null);

  const retest = test?.retest || null;

  const status = useMemo(() => retestStatus({
    dueAt: retest?.dueAt,
    newerTestAt,
    dismissedAt: retest?.dismissedAt,
  }), [retest?.dueAt, retest?.dismissedAt, newerTestAt]);

  const days = useMemo(
    () => daysUntilRetest({ dueAt: retest?.dueAt }),
    [retest?.dueAt],
  );

  const write = useCallback(async (body, gaAction) => {
    if (busy || !test?._id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await setTestRetest(test._id, body);
      onChanged?.(res?.data?.retest || null);
      setPicking(false);
      try {
        trackFeatureUsage('retest', gaAction, { interval_days: body.intervalDays || null });
      } catch { /* analytics must never break the action */ }
    } catch (e) {
      // Say so rather than leaving a dead button. The write is tiny and
      // idempotent, so a retry is always safe.
      setError('Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, test?._id, onChanged]);

  return {
    status,
    days,
    retest,
    busy,
    error,
    picking,
    setPicking,
    schedule: useCallback((intervalDays) => write({ intervalDays }, 'schedule'), [write]),
    dismiss:  useCallback(() => write({ dismiss: true }, 'dismiss'), [write]),
    clear:    useCallback(() => write({ clear: true }, 'clear'), [write]),
    /** True when there is nothing to show: a later test closed it, or they said no. */
    hidden: status === 'done' || status === 'dismissed' || !test?._id,
  };
}

export default useRetest;
