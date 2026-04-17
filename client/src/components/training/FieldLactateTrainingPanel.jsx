import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getIntegrationStatus, getPendingLactateActivities } from '../../services/api';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Strava activities missing lap-level lactate — embedded on Training.
 * @param {{ integrationAthleteId: string | null, user: object }} props
 */
export default function FieldLactateTrainingPanel({ integrationAthleteId, user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stravaConnected, setStravaConnected] = useState(null);
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(14);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, pending] = await Promise.all([
        getIntegrationStatus({ timeout: 15000 }),
        getPendingLactateActivities(integrationAthleteId, { days: 14 }),
      ]);
      setStravaConnected(Boolean(status && status.stravaConnected));
      setRows(Array.isArray(pending && pending.activities) ? pending.activities : []);
      setDays(typeof pending.days === 'number' ? pending.days : 14);
    } catch (e) {
      setError((e && e.response && e.response.data && e.response.data.error) || e.message || 'Could not load data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [integrationAthleteId]);

  useEffect(() => {
    load();
  }, [load]);

  const calendarHref =
    user &&
    ['coach', 'tester', 'testing'].includes(String(user.role || '').toLowerCase()) &&
    integrationAthleteId &&
    String(integrationAthleteId) !== String(user._id)
      ? `/training-calendar/${integrationAthleteId}`
      : '/training-calendar';

  return (
    <div
      id="field-lactate"
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm scroll-mt-24 mb-6"
    >
      <h2 className="text-lg font-bold text-slate-900">Field lactate (Strava)</h2>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
        Add blood lactate readings per <strong>lap</strong> — press <strong>lap</strong> on your watch at each sample.
        Open the activity in the calendar and enter mmol/L for each lap.
      </p>

      {stravaConnected === false && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Strava is not connected.{' '}
          <Link to="/settings" className="font-semibold text-amber-900 underline">
            Settings → integrations
          </Link>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          Refresh
        </button>
        <Link
          to={calendarHref}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-95"
        >
          Training calendar
        </Link>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {error && !loading && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-4 text-sm text-slate-600">
          Nothing to complete in the last <strong>{days} days</strong> — or laps are not loaded yet (open the activity in
          the calendar).
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 max-h-[min(40vh,22rem)] overflow-y-auto">
          {rows.map((a) => (
            <li
              key={String(a._id)}
              className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{a.name}</p>
                <p className="text-xs text-slate-500">
                  {formatWhen(a.startDate)} · {a.sport || 'Sport'}{' '}
                  {a.lapCount > 0 ? (
                    <>
                      · {a.lapCount} lap{a.lapCount === 1 ? '' : 's'}
                      {a.missingLactateCount != null ? ` · missing ${a.missingLactateCount}` : null}
                    </>
                  ) : (
                    <>· laps not loaded</>
                  )}
                </p>
              </div>
              <Link
                to={a.openPath || `/training-calendar/strava-${a.stravaId}`}
                className="shrink-0 rounded-lg border border-primary/40 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-primary hover:bg-indigo-100"
              >
                Add lactate
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
