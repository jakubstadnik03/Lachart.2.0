import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getIntegrationStatus, getPendingLactateActivities } from '../../services/api';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return '—'; }
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Score how likely this activity is a field lactate test session.
 * Returns { score: number, signals: string[] }
 */
function scoreActivity(a) {
  let score = 0;
  const signals = [];
  const name = (a.name || '').toLowerCase();

  // ── Name keywords ──
  if (/lactate|lactát|lactat/.test(name)) { score += 5; signals.push('🧪 lactate in name'); }
  else if (/interval|intervaly|intervals/.test(name)) { score += 4; signals.push('🔁 intervals'); }
  else if (/tempo|threshold|lt[12]|ltp|ftp|vo2/.test(name)) { score += 3; signals.push('⚡ threshold'); }
  else if (/test|testing|quality|race|effort/.test(name)) { score += 2; signals.push('🏁 test/race'); }
  else if (/hard|fast|speed|sprint/.test(name)) { score += 1; }

  // ── Lap count ──
  if (a.lapCount >= 8) { score += 3; signals.push(`${a.lapCount} laps`); }
  else if (a.lapCount >= 5) { score += 2; signals.push(`${a.lapCount} laps`); }
  else if (a.lapCount >= 3) { score += 1; }

  // ── Regular lap durations (structured intervals) ──
  if (a.lapDurationCv != null) {
    if (a.lapDurationCv < 0.12 && a.lapCount >= 3) { score += 3; signals.push('structured intervals'); }
    else if (a.lapDurationCv < 0.25 && a.lapCount >= 3) { score += 1; }
  }

  // ── HR intensity ──
  if (a.avgHr) {
    if (a.avgHr >= 165) { score += 3; signals.push(`❤️ ${a.avgHr} bpm avg`); }
    else if (a.avgHr >= 150) { score += 2; signals.push(`❤️ ${a.avgHr} bpm avg`); }
    else if (a.avgHr >= 135) { score += 1; }
  }

  // ── Power ──
  if (a.avgWatts) {
    if (a.avgWatts >= 220) { score += 2; signals.push(`⚡ ${a.avgWatts}W`); }
    else if (a.avgWatts >= 160) { score += 1; }
  }

  return { score, signals: signals.slice(0, 3) };
}

function ConfidenceBadge({ score }) {
  if (score >= 7) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200 shrink-0">
      🧪 Likely test
    </span>
  );
  if (score >= 4) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
      ⚡ Intervals?
    </span>
  );
  return null;
}

/**
 * Compact panel showing Strava activities missing field lactate.
 * Activities are scored and sorted by likelihood of being a lactate test.
 */
export default function FieldLactateTrainingPanel({
  integrationAthleteId,
  user,
  onAddLactate,
  loadingActivityId = null,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stravaConnected, setStravaConnected] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, pending] = await Promise.all([
        getIntegrationStatus({ timeout: 15000 }),
        getPendingLactateActivities(integrationAthleteId, { days: 21 }),
      ]);
      setStravaConnected(Boolean(status && status.stravaConnected));
      setRows(Array.isArray(pending?.activities) ? pending.activities : []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [integrationAthleteId]);

  useEffect(() => { load(); }, [load]);

  // Score + sort: high-confidence first
  const scored = rows
    .map(a => ({ ...a, ...scoreActivity(a) }))
    .sort((a, b) => b.score - a.score);

  const calendarHref =
    user && ['coach', 'tester', 'testing'].includes(String(user.role || '').toLowerCase()) &&
    integrationAthleteId && String(integrationAthleteId) !== String(user._id)
      ? `/training-calendar/${integrationAthleteId}`
      : '/training-calendar';

  return (
    <div
      id="field-lactate"
      className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden scroll-mt-24"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 leading-tight">Field Lactate</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Strava activities · add blood lactate per lap</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={load}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <Link
            to={calendarHref}
            className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-semibold hover:opacity-90 transition-all"
          >
            Calendar
          </Link>
        </div>
      </div>

      {/* Body — scrollable, capped height */}
      <div className="overflow-y-auto" style={{ maxHeight: '20rem' }}>
        {stravaConnected === false && (
          <div className="m-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Strava not connected.{' '}
            <Link to="/settings" className="font-semibold underline">Settings → Integrations</Link>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        )}

        {error && !loading && (
          <p className="m-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {!loading && !error && scored.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <span className="text-2xl mb-2">✅</span>
            <p className="text-xs text-slate-500">No pending activities in last 21 days</p>
          </div>
        )}

        {!loading && !error && scored.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {scored.map((a) => {
              const isLoading = loadingActivityId != null && String(loadingActivityId) === String(a._id);
              return (
                <li key={String(a._id)} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <ConfidenceBadge score={a.score} />
                        <span className="text-xs font-semibold text-slate-900 truncate">{a.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-400">
                          {formatWhen(a.startDate)}
                          {a.sport ? ` · ${a.sport}` : ''}
                          {a.lapCount > 0 ? ` · ${a.lapCount} laps` : ''}
                          {a.movingTime ? ` · ${formatDuration(a.movingTime)}` : ''}
                        </span>
                      </div>
                      {a.signals && a.signals.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {a.signals.map((s, i) => (
                            <span key={i} className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {typeof onAddLactate === 'function' ? (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onAddLactate(a)}
                        className="shrink-0 rounded-lg border border-primary/30 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-indigo-100 disabled:opacity-60 transition-colors"
                      >
                        {isLoading ? '…' : '+ Lactate'}
                      </button>
                    ) : (
                      <Link
                        to={a.openPath || `/training-calendar/strava-${a.stravaId}`}
                        className="shrink-0 rounded-lg border border-primary/30 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-indigo-100 transition-colors"
                      >
                        + Lactate
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
