import React, { useCallback, useEffect, useState } from 'react';
import {
  getAdminCancellations,
  getSubscriptionReconcile,
  applySubscriptionReconcile,
} from '../../services/api';

const REASON_LABELS = {
  never_set_up: 'Never got it set up',
  missing_feature: 'Something was missing',
  too_expensive: 'Too expensive',
  using_something_else: 'Using something else',
  off_season: 'Off season',
  other: 'Something else',
  skipped: 'Did not answer',
};

/** `skipped` is not a reason — it is how many were asked and said nothing. */
const ANSWERED_ORDER = [
  'never_set_up', 'missing_feature', 'too_expensive',
  'using_something_else', 'off_season', 'other',
];

const WINDOWS = [30, 90, 180, 365];

/**
 * Why subscribers left, and a way to reconcile the local rows against Stripe.
 *
 * Both of these existed only as admin endpoints, which meant nobody was ever
 * going to look at them. The answer rate is on the card next to the breakdown
 * on purpose: a split of three replies out of twenty-two says something very
 * different from a split of twenty, and reading the first as if it were the
 * second is the whole trap.
 */
export default function CancellationsCard({ addNotification }) {
  const [days, setDays] = useState(180);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [reconcile, setReconcile] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminCancellations(days));
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not load cancellations');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const runReconcileReport = async () => {
    setReconLoading(true);
    try {
      const r = await getSubscriptionReconcile(false);
      setReconcile(r);
    } catch (e) {
      addNotification?.(e?.response?.data?.error || e?.message || 'Reconcile failed', 'error');
    } finally {
      setReconLoading(false);
    }
  };

  const applyReconcile = async () => {
    setApplying(true);
    try {
      const r = await applySubscriptionReconcile(false);
      setReconcile(r);
      addNotification?.('Stripe answers written back', 'success');
      load();
    } catch (e) {
      addNotification?.(e?.response?.data?.error || e?.message || 'Apply failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  const byReason = data?.byReason || {};
  const answered = Number(data?.answered) || 0;
  const leaving = Number(data?.leaving) || 0;
  const maxCount = Math.max(1, ...ANSWERED_ORDER.map((k) => Number(byReason[k]) || 0));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Why subscribers left</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Asked in the cancel dialog. Optional, so not everyone answers.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                days === w ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xl font-bold text-gray-900 tabular-nums">{leaving}</p>
              <p className="text-xs text-gray-500">On their way out</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xl font-bold text-gray-900 tabular-nums">{answered}</p>
              <p className="text-xs text-gray-500">Told us why</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xl font-bold text-gray-900 tabular-nums">{data.answerRate ?? 0}%</p>
              <p className="text-xs text-gray-500">Answer rate</p>
            </div>
          </div>

          {answered === 0 ? (
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              Nobody has answered yet. The question only reaches people who cancel from
              now on — everyone who left before it shipped counts as “did not answer”.
            </p>
          ) : (
            <div className="space-y-2 mb-5">
              {ANSWERED_ORDER.map((key) => {
                const n = Number(byReason[key]) || 0;
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-gray-700">{REASON_LABELS[key]}</span>
                      <span className="text-gray-500 tabular-nums">{n}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gray-800"
                        style={{ width: `${(n / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400 pt-1">
                {byReason.skipped || 0} cancelled without answering.
              </p>
            </div>
          )}

          {Array.isArray(data.notes) && data.notes.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                What they wrote
              </p>
              <div className="space-y-2 max-h-72 overflow-auto">
                {data.notes.map((n, i) => (
                  <div key={`${n.at}-${i}`} className="p-3 rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-800 whitespace-pre-line">{n.note}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {[REASON_LABELS[n.reason] || n.reason, n.plan, n.email,
                        n.at ? new Date(n.at).toLocaleDateString() : null]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="border-t border-gray-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Reconcile with Stripe</p>
            <p className="text-xs text-gray-500">
              Local rows drift when a webhook does not land. Report first, then write.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runReconcileReport}
              disabled={reconLoading || applying}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {reconLoading ? 'Checking…' : 'Report'}
            </button>
            <button
              type="button"
              onClick={applyReconcile}
              disabled={applying || reconLoading || !reconcile}
              title={reconcile ? '' : 'Run the report first'}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-black disabled:opacity-40"
            >
              {applying ? 'Writing…' : 'Apply'}
            </button>
          </div>
        </div>
        {reconcile && (
          <pre className="mt-3 p-3 rounded-lg bg-gray-900 text-gray-100 text-[11px] leading-relaxed overflow-auto max-h-64">
            {JSON.stringify(reconcile, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
