import React, { useState } from 'react';
import api from '../../services/api';

/**
 * ReclassifyActivitiesCard
 *
 * Calls the backend backfill endpoints to retro-categorise existing
 * activities. Two-step UX so the user can preview what will change before
 * committing:
 *
 *   1. "Preview" runs both endpoints with { dryRun: true } and lists the
 *      sample proposals (first ~20 of each source).
 *   2. "Apply" runs them again without dryRun and shows the final counts.
 *
 * Endpoints:
 *   - POST /api/integrations/strava/auto-classify/backfill
 *   - POST /api/fit/auto-classify/backfill
 *
 * Both endpoints look at the activity name / title (case-insensitive) and
 * set a category when the title contains an explicit keyword like VO2max,
 * LT2, threshold, … The Strava endpoint also falls back to interval and
 * dominant-zone analysis when the title is silent.
 */
export default function ReclassifyActivitiesCard() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'previewing' | 'applying' | 'done' | 'error'
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // { strava, fit }
  const [result, setResult] = useState(null);   // counts after Apply

  /** Run one backfill call. Resolves to whatever the server returned. */
  const runBackfill = async (path, body) => {
    const { data } = await api.post(path, body);
    return data;
  };

  const handlePreview = async () => {
    setStatus('previewing');
    setError(null);
    setResult(null);
    try {
      const [strava, fit] = await Promise.allSettled([
        runBackfill('/api/integrations/strava/auto-classify/backfill', { dryRun: true }),
        runBackfill('/api/fit/auto-classify/backfill', { dryRun: true }),
      ]);
      setPreview({
        strava: strava.status === 'fulfilled' ? strava.value
              : { error: strava.reason?.response?.data?.error || strava.reason?.message },
        fit:    fit.status === 'fulfilled'    ? fit.value
              : { error: fit.reason?.response?.data?.error || fit.reason?.message },
      });
      setStatus('idle');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Preview failed');
      setStatus('error');
    }
  };

  const handleApply = async () => {
    setStatus('applying');
    setError(null);
    try {
      const [strava, fit] = await Promise.allSettled([
        runBackfill('/api/integrations/strava/auto-classify/backfill', {}),
        runBackfill('/api/fit/auto-classify/backfill', {}),
      ]);
      const stravaResult = strava.status === 'fulfilled' ? strava.value : { updated: 0, processed: 0, error: strava.reason?.message };
      const fitResult    = fit.status === 'fulfilled'    ? fit.value    : { updated: 0, processed: 0, error: fit.reason?.message };
      setResult({ strava: stravaResult, fit: fitResult });
      setPreview(null);
      setStatus('done');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Re-classify failed');
      setStatus('error');
    }
  };

  const totalProposed = preview
    ? (preview.strava?.updated || 0) + (preview.fit?.updated || 0)
    : 0;
  const totalApplied = result
    ? (result.strava?.updated || 0) + (result.fit?.updated || 0)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <span className="text-xl" aria-hidden>🏷️</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900">Re-classify my activities</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Scan your existing Strava activities and FIT uploads and assign a
            category (VO₂max / LT2 / LT1 / Endurance / Hills) based on the
            workout name and interval data. Skips anything that already has
            a category.
          </p>
        </div>
      </div>

      {/* Preview results */}
      {preview && (
        <div className="mt-3 mb-3 p-3 rounded-lg bg-purple-50 border border-purple-100 text-xs">
          <div className="font-semibold text-purple-900 mb-2">
            Preview — {totalProposed} {totalProposed === 1 ? 'activity' : 'activities'} will be re-classified
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2 text-purple-800">
            <div>Strava: <strong>{preview.strava?.updated || 0}</strong> / {preview.strava?.processed || 0}</div>
            <div>FIT: <strong>{preview.fit?.updated || 0}</strong> / {preview.fit?.processed || 0}</div>
          </div>
          {/* First few samples for context */}
          {[...(preview.strava?.sample || []), ...(preview.fit?.sample || [])]
            .slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-0.5 text-purple-700">
                <span className="truncate" title={s.name}>{s.name || '(no name)'}</span>
                <span className="shrink-0 font-mono text-[10px]">→ {s.category}</span>
              </div>
            ))}
        </div>
      )}

      {/* Apply results */}
      {result && (
        <div className="mt-3 mb-3 p-3 rounded-lg bg-green-50 border border-green-100 text-xs text-green-900">
          <div className="font-semibold mb-1">
            Done — {totalApplied} {totalApplied === 1 ? 'activity' : 'activities'} re-classified
          </div>
          <div className="grid grid-cols-2 gap-2 text-green-800">
            <div>Strava: <strong>{result.strava?.updated || 0}</strong></div>
            <div>FIT: <strong>{result.fit?.updated || 0}</strong></div>
          </div>
          {(result.strava?.error || result.fit?.error) && (
            <p className="mt-2 text-red-700">
              Some calls failed — check the server logs if numbers look off.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 mb-3 text-xs text-red-600">{error}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={status === 'previewing' || status === 'applying'}
          className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {status === 'previewing' ? 'Scanning…' : 'Preview'}
        </button>
        {preview && totalProposed > 0 && (
          <button
            type="button"
            onClick={handleApply}
            disabled={status === 'applying'}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {status === 'applying' ? 'Applying…' : `Apply to ${totalProposed} ${totalProposed === 1 ? 'activity' : 'activities'}`}
          </button>
        )}
      </div>
    </div>
  );
}
