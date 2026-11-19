import { CalendarDaysIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useRetest } from '../../hooks/useRetest';
import { retestIntervalChoices, retestDueAt } from '../../utils/retestPlan';

/**
 * "When will you test again?" — the opt-in half of the retest loop (web).
 *
 * ── Why a card and not a prompt after saving ──────────────────────────────────
 * Repeat testing is the strongest behavioural predictor of paying in the data
 * (2 tests → 15.7 % ever paid, 3+ → 37.3 %, against 9.0 % for a single test),
 * and the rarest thing people do: on 2026-11-18, 301 of 741 real accounts held
 * exactly one test and 240 of those were more than six weeks past it.
 *
 * A prompt that only fired on save would reach none of those 240 — their test
 * is already saved. A card on the test they are looking at reaches them the
 * next time they open the app, which is the only way this helps the backlog
 * rather than only future tests. It also keeps clear of the tracker-connect
 * sheet, which already owns the moment straight after a save.
 *
 * Nothing here nags: scheduling is opt-in, "Not now" is final, and the
 * reminders it arms are in-app and push only. The emailed version of this idea
 * has run for months and is spent — 326 recipients, 4.3 % retested, one plan
 * started. See client/src/utils/retestPlan.js.
 *
 * The phone has its own rendering in NativeTestingPage (inline styles there,
 * Tailwind here); both drive the same useRetest hook, so the rules cannot drift.
 *
 * Props:
 *   test        – the test doc ({ _id, date, sport, retest })
 *   newerTestAt – date of the athlete's most recent later test, or null
 *   onChanged   – called with the updated `retest` subdoc after a write
 *   onAddTest   – optional: open the add-test flow from the "due" state
 *   canEdit     – false renders nothing (e.g. a coach viewing read-only)
 */
export default function RetestCard({
  test,
  newerTestAt = null,
  onChanged,
  onAddTest,
  canEdit = true,
  className = '',
}) {
  const {
    status, days, retest, busy, error, picking, setPicking,
    schedule, dismiss, clear, hidden,
  } = useRetest(test, newerTestAt, onChanged);

  if (hidden || !canEdit) return null;

  const fmt = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
  };

  // ── Scheduled: a quiet countdown, with a way out ───────────────────────────
  if (status === 'scheduled' && !picking) {
    return (
      <div className={`rounded-2xl border border-gray-100 bg-gray-50 p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <CalendarDaysIcon className="h-5 w-5 flex-none text-gray-400 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">Retest planned for {fmt(retest.dueAt)}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {days === 0 ? 'Today' : days === 1 ? 'In 1 day' : `In ${days} days`}
              {' · '}we will remind you in the app
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              <button type="button" className="font-medium text-blue-600 hover:underline disabled:opacity-50"
                onClick={() => setPicking(true)} disabled={busy}>Change</button>
              <button type="button" className="text-gray-500 hover:underline disabled:opacity-50"
                onClick={clear} disabled={busy}>Remove</button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Due: the moment the whole loop exists for ──────────────────────────────
  if (status === 'due' && !picking) {
    const overdue = typeof days === 'number' && days < 0;
    return (
      <div className={`rounded-2xl border border-blue-200 bg-blue-50 p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <ArrowPathIcon className="h-5 w-5 flex-none text-blue-500 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {overdue ? 'Your retest is due' : 'Today is your retest'}
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              Save it and LaChart will show both curves side by side — what moved, and where.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              {onAddTest && (
                <button type="button"
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={onAddTest} disabled={busy}>Add test</button>
              )}
              <button type="button" className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                onClick={() => setPicking(true)} disabled={busy}>Push it back</button>
              <button type="button" className="text-xs text-gray-500 hover:underline disabled:opacity-50"
                onClick={dismiss} disabled={busy}>Not now</button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── None / overdue / actively picking: offer the intervals ─────────────────
  // 'overdue' lands here rather than in a state of its own on purpose: a plan
  // set two months ago and never acted on is not worth a reminder, but it is
  // worth offering again, once, without reproach.
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <CalendarDaysIcon className="h-5 w-5 flex-none text-gray-400 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">When will you test again?</p>
          <p className="mt-0.5 text-xs text-gray-500">
            A threshold only tells you something once it moves. Pick a date and we will
            remind you in the app — no emails.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {retestIntervalChoices().map((d) => {
              const due = retestDueAt(test.date, d);
              return (
                <button key={d} type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                  title={due ? `Due ${fmt(due)}` : undefined}
                  onClick={() => schedule(d)} disabled={busy}>
                  {d / 7} weeks
                </button>
              );
            })}
            {status !== 'overdue' && (
              <button type="button" className="px-1.5 py-1.5 text-xs text-gray-500 hover:underline disabled:opacity-50"
                onClick={dismiss} disabled={busy}>Not now</button>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
