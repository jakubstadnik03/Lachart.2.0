/**
 * Choosing who gets the estimated-curve email, and seeing what theirs says.
 *
 * The scheduler drains this campaign on its own, but only once someone has
 * decided it should. Before that decision there is no way to look at it: a
 * generic preview shows a made-up athlete, and the whole question an admin has
 * is whether the numbers it would quote to *real* people are ones they would
 * stand behind.
 *
 * So every row carries its own estimate — sport, LT1, LT2, where LT2 came from
 * and how confident the app is — and the preview pane renders that person's
 * actual email. The send buttons act on the person in the pane, or on whatever
 * is ticked.
 *
 * People the scheduler would skip are listed rather than hidden, with the
 * reason. An admin deciding whether to switch a campaign on needs to see the
 * shape of the whole list, including the parts of it the campaign will not
 * touch.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  fetchPredictedCurveCandidates,
  fetchPredictedCurvePreview,
  fetchPredictedCurveStatus,
  sendPredictedCurveBatch,
  sendPredictedCurveTest,
  sendPredictedCurveToUser,
} from '../../services/api';

const CONFIDENCE_STYLE = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-sky-100 text-sky-700',
  low: 'bg-amber-100 text-amber-700',
};

const BLOCKED_LABEL = {
  has_test: 'has a test',
  opted_out: 'opted out',
  estimate_too_weak: 'estimate too weak',
  account_too_new: 'account too new',
};

const FILTERS = [
  { id: 'sendable', label: 'Ready to send' },
  { id: 'all', label: 'Everyone with an estimate' },
  { id: 'blocked', label: 'Skipped by the campaign' },
  { id: 'sent', label: 'Already sent' },
];

function lastSeen(v) {
  if (!v) return { label: 'unknown', stale: false };
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  if (days <= 0) return { label: 'today', stale: false };
  if (days === 1) return { label: 'yesterday', stale: false };
  if (days < 30) return { label: `${days}d ago`, stale: false };
  if (days < 365) return { label: `${Math.floor(days / 30)}mo ago`, stale: true };
  return { label: `${Math.floor(days / 365)}y ago`, stale: true };
}

export default function PredictedCurvePanel({ addNotification }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ stats: null, people: [] });
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState('sendable');
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [checkedIds, setCheckedIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [candidates, st] = await Promise.all([
        fetchPredictedCurveCandidates(120),
        fetchPredictedCurveStatus().catch(() => null),
      ]);
      setData(candidates);
      setStatus(st);
    } catch (e) {
      addNotification?.(e?.response?.data?.error || 'Failed to load candidates', 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => {
    const all = data.people || [];
    if (filter === 'all') return all;
    if (filter === 'sent') return all.filter((p) => p.alreadySentAt);
    if (filter === 'blocked') return all.filter((p) => p.blockedReason && !p.alreadySentAt);
    return all.filter((p) => !p.blockedReason && !p.alreadySentAt);
  }, [data.people, filter]);

  // Only rows the campaign would actually accept can be queued. Anything else
  // is a deliberate one-off, and belongs to the button in the preview pane.
  const selectableIds = useMemo(
    () => people.filter((p) => !p.blockedReason && !p.alreadySentAt && !p.optedOut).map((p) => p.userId),
    [people],
  );
  const allChecked = selectableIds.length > 0 && selectableIds.every((id) => checkedIds.has(id));

  const toggleChecked = (id) => setCheckedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openPreview = async (person) => {
    setSelected(person);
    setPreview(null);
    setPreviewLoading(true);
    try {
      setPreview(await fetchPredictedCurvePreview(person.userId));
    } catch (e) {
      addNotification?.(e?.response?.data?.error || 'Failed to render preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendTest = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const r = await sendPredictedCurveTest(selected.userId);
      addNotification?.(r.sent ? `Test sent to ${r.to}` : `Not sent: ${r.reason}`, r.sent ? 'success' : 'warning');
    } catch (e) {
      addNotification?.(e?.response?.data?.reason || 'Test send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const sendReal = async () => {
    if (!selected) return;
    const warn = selected.blockedReason
      ? `\n\nHEADS UP — the campaign would skip them: ${BLOCKED_LABEL[selected.blockedReason] || selected.blockedReason}.`
      : '';
    const ok = window.confirm(
      `Send the estimated ${selected.sport} curve to ${selected.name || 'this person'} <${selected.email}>?\n\n`
      + `It will quote LT1 ${selected.lt1Display} and LT2 ${selected.lt2Display} (${selected.confidence} confidence).\n`
      + 'This is a real email to a real customer, and they also get a notification.'
      + warn,
    );
    if (!ok) return;
    setSending(true);
    try {
      const r = await sendPredictedCurveToUser(selected.userId);
      if (r.sent) {
        addNotification?.(`Sent to ${r.to}`, 'success');
        setSelected((s) => (s ? { ...s, alreadySentAt: new Date().toISOString() } : s));
        await load();
      } else {
        addNotification?.(`Not sent: ${r.reason}`, 'warning');
      }
    } catch (e) {
      addNotification?.(e?.response?.data?.reason || 'Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const sendBatch = async () => {
    const ids = selectableIds.filter((id) => checkedIds.has(id));
    if (!ids.length) return;
    const ok = window.confirm(
      `Send to ${ids.length} recipient${ids.length === 1 ? '' : 's'}?\n\n`
      + 'These are real emails to real customers, each with their own estimated curve, '
      + 'and each also gets an in-app notification. They go out a couple of seconds apart.',
    );
    if (!ok) return;
    setSending(true);
    try {
      const r = await sendPredictedCurveBatch(ids);
      addNotification?.(`Sent ${r.sent} of ${r.attempted}`, r.sent ? 'success' : 'warning');
      setCheckedIds(new Set());
      await load();
    } catch (e) {
      addNotification?.(e?.response?.data?.error || 'Batch send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const stats = data.stats;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            Estimated lactate curve
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mt-1 max-w-2xl">
            For athletes with training but no test. Each row carries that person&apos;s own estimate —
            open one to see the exact email they would get, with their numbers in it.
            {status && (
              <>
                {' '}The background campaign is{' '}
                <strong className={status.enabled ? 'text-emerald-700' : 'text-gray-700'}>
                  {status.enabled ? 'on' : 'off'}
                </strong>
                {status.enabled ? ` (max ${status.dailyCap}/day).` : ' — sending here is manual and immediate.'}
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="self-start px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Ready to send', value: stats.sendable, hint: 'estimate strong enough, never written to' },
            { label: 'Already sent', value: stats.alreadySent, hint: 'one each, ever' },
            { label: 'Estimate too weak', value: stats.tooWeak, hint: 'skipped rather than hedged' },
            { label: 'Scanned', value: stats.scanned, hint: `${stats.withEstimate} had an estimate at all` },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <div className="text-xs text-gray-600">{s.label}</div>
              <div className="text-2xl font-bold text-gray-900 mt-0.5">{s.value ?? '—'}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{s.hint}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => { setFilter(f.id); setCheckedIds(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f.id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {selectableIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="rounded border-gray-300" checked={allChecked}
              onChange={() => setCheckedIds(allChecked ? new Set() : new Set(selectableIds))} />
            Select all {selectableIds.length} ready
          </label>
          <span className="text-sm text-gray-500">
            {checkedIds.size} selected{checkedIds.size > 25 ? ' — 25 will be sent per click' : ''}
          </span>
          <button type="button" onClick={sendBatch} disabled={sending || checkedIds.size === 0}
            className="ml-auto px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {sending ? 'Sending…' : `Send to ${Math.min(checkedIds.size, 25)}`}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
            {people.length} {people.length === 1 ? 'person' : 'people'} · most recently active first
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100">
            {loading && <div className="px-4 py-6 text-sm text-gray-500">Estimating…</div>}
            {!loading && people.map((p) => {
              const seen = lastSeen(p.lastLogin);
              const queueable = !p.blockedReason && !p.alreadySentAt && !p.optedOut;
              return (
                <div key={p.userId}
                  className={`flex items-start gap-2 px-4 py-3 hover:bg-gray-50 transition ${
                    selected?.userId === p.userId ? 'bg-indigo-50' : ''}`}>
                  <input type="checkbox" className="mt-1 rounded border-gray-300 shrink-0"
                    checked={checkedIds.has(p.userId)} disabled={!queueable}
                    onChange={() => toggleChecked(p.userId)}
                    onClick={(e) => e.stopPropagation()} />
                  <button onClick={() => openPreview(p)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{p.name || '(no name)'}</div>
                        <div className="text-xs text-gray-500 truncate">{p.email}</div>
                        <div className={`text-[11px] mt-0.5 ${seen.stale ? 'text-amber-600' : 'text-gray-400'}`}>
                          Last seen: {seen.label}
                          {p.activityCount ? ` · ${p.activityCount} ${p.sport === 'bike' ? 'rides' : 'runs'}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-bold tracking-wide text-gray-400">
                            {p.sport}
                          </span>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">{p.lt2Display}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 tabular-nums">
                          LT1 {p.lt1Display}{p.lt2Hr ? ` · ${Math.round(p.lt2Hr)} bpm` : ''}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            CONFIDENCE_STYLE[p.confidence] || CONFIDENCE_STYLE.low}`}>
                            {p.confidence}
                          </span>
                          {p.alreadySentAt && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">sent</span>
                          )}
                          {p.blockedReason && !p.alreadySentAt && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              {BLOCKED_LABEL[p.blockedReason] || p.blockedReason}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
            {!loading && people.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">Nobody in this group.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-700 truncate">
              {selected ? `To: ${selected.email}` : 'Select someone to preview'}
            </span>
            {selected && (
              <div className="flex gap-2 shrink-0">
                <button onClick={sendTest} disabled={sending}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Send test to me
                </button>
                <button onClick={sendReal} disabled={sending || selected.optedOut}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {selected.alreadySentAt ? 'Send again' : 'Send to athlete'}
                </button>
              </div>
            )}
          </div>

          {selected && (
            <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500 space-y-0.5">
              {preview?.subject && (
                <div className="truncate"><strong className="text-gray-700">Subject:</strong> {preview.subject}</div>
              )}
              <div>
                <strong className="text-gray-700">Their numbers:</strong> LT1 {selected.lt1Display}
                {selected.lt1Derived ? ' (derived)' : ''} · LT2 {selected.lt2Display}
                {selected.hrIsPopulation ? ' · HR from %HRmax' : ''}
                {selected.source ? ` · from ${selected.source}` : ''}
              </div>
              {selected.optedOut && (
                <div className="text-amber-600">This person has opted out — sending is blocked.</div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-[420px] bg-gray-50">
            {previewLoading && <div className="p-6 text-gray-500 text-sm">Rendering…</div>}
            {preview?.html && !previewLoading && (
              // srcDoc + sandbox: render the real email without letting it
              // touch the admin page.
              <iframe title="Predicted curve email preview" srcDoc={preview.html} sandbox=""
                className="w-full h-[520px] border-0 bg-white" />
            )}
            {preview && !preview.html && !previewLoading && (
              <div className="p-6 text-sm text-gray-500">
                No estimate could be built for this person, so there is no email to show.
              </div>
            )}
            {!preview && !previewLoading && (
              <div className="p-6 text-gray-400 text-sm">
                Pick someone on the left to see the exact email they would receive, with their own
                thresholds and curve in it.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
