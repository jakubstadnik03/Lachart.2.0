import React, { useEffect, useState, useCallback } from 'react';
import { getSimilarWorkouts } from '../../services/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts';
import { ArrowTopRightOnSquareIcon, ArrowDownTrayIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const SPORT_EMOJI = (sport = '') => {
  const s = sport.toLowerCase();
  if (s.includes('run')) return '🏃';
  if (s.includes('swim')) return '🏊';
  if (s.includes('walk')) return '🚶';
  if (s.includes('row')) return '🚣';
  if (s.includes('ski')) return '⛷️';
  return '🚴';
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
  } catch { return '—'; }
};

const fmtDuration = (secs) => {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** CSV export helper */
function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? '';
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-1.5 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-medium text-gray-800">{p.value != null ? p.value : '—'}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * SimilarWorkoutsPanel
 *
 * Props:
 *   training       — current FIT training object (needs _id, sport, timestamp)
 *   onSelectWorkout — (id) => void — navigate to that workout
 *   isMobile       — boolean
 */
export default function SimilarWorkoutsPanel({ training, onSelectWorkout, isMobile = false }) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const [showAll, setShowAll] = useState(false);
  const [activeMetrics, setActiveMetrics] = useState({ power: true, hr: true, lactate: true });

  const load = useCallback(async () => {
    if (!training?._id) return;
    setState({ loading: true, data: null, error: null });
    try {
      const res = await getSimilarWorkouts(training._id);
      setState({ loading: false, data: res, error: null });
    } catch (err) {
      const msg = err?.response?.data?.reason === 'no_pattern'
        ? 'No interval pattern detected in this workout.'
        : err?.response?.data?.error || 'Could not load similar workouts.';
      setState({ loading: false, data: null, error: msg });
    }
  }, [training?._id]);

  useEffect(() => { load(); }, [load]);

  const similar = state.data?.similar || [];
  // Include current workout in trend
  const currentEntry = training ? {
    _id: training._id,
    title: training.titleManual || training.titleAuto || training.originalFileName || 'This workout',
    timestamp: training.timestamp || training.date || training.uploadDate,
    avgPower: training.laps?.length
      ? Math.round(training.laps.reduce((s, l) => s + (l.avgPower || l.avg_power || l.average_watts || 0), 0) / training.laps.length)
      : null,
    avgHR: training.laps?.length
      ? Math.round(training.laps.reduce((s, l) => s + (l.avgHeartRate || l.avg_heart_rate || l.average_heartrate || 0), 0) / training.laps.length)
      : null,
    avgLactate: (() => {
      const ll = (training.laps || []).filter(l => l.lactate > 0);
      return ll.length ? Math.round(ll.reduce((s, l) => s + l.lactate, 0) / ll.length * 10) / 10 : null;
    })(),
    isCurrent: true,
  } : null;

  const allEntries = [
    ...similar,
    ...(currentEntry ? [currentEntry] : []),
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Chart data
  const chartData = allEntries.map(e => ({
    date: fmtDate(e.timestamp),
    Power: e.avgPower || null,
    HR: e.avgHR || null,
    Lactate: e.avgLactate || null,
    isCurrent: !!e.isCurrent,
    _id: e._id,
  }));

  const hasPower = chartData.some(d => d.Power);
  const hasHR = chartData.some(d => d.HR);
  const hasLactate = chartData.some(d => d.Lactate);

  const displayList = showAll ? similar : similar.slice(0, 5);

  const handleExportCSV = () => {
    const rows = allEntries.map(e => ({
      date: fmtDate(e.timestamp),
      title: e.title,
      similarity_pct: e.isCurrent ? '—' : e.similarity,
      avg_power_w: e.avgPower ?? '',
      avg_hr_bpm: e.avgHR ?? '',
      avg_lactate_mmol: e.avgLactate ?? '',
      duration: e.totalDuration ? fmtDuration(e.totalDuration) : '',
      intervals: e.intervalCount ?? '',
    }));
    exportCSV(rows, `similar_workouts_${training?._id || 'export'}.csv`);
  };

  const toggleMetric = (key) => setActiveMetrics(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Loading ──
  if (state.loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Finding similar workouts…</span>
        </div>
      </div>
    );
  }

  // ── Error or no pattern ──
  if (state.error) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mt-4">
        <p className="text-xs text-gray-400">{state.error}</p>
      </div>
    );
  }

  if (!state.data) return null;

  // ── No similar found ──
  if (similar.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mt-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Similar workouts</h3>
        <p className="text-xs text-gray-400">No similar workouts found yet. As you log more interval sessions, matches will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl mt-4 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between ${isMobile ? 'px-4 py-3' : 'px-5 py-4'} border-b border-gray-100`}>
        <div>
          <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-bold text-gray-900`}>
            Similar workouts
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded-full">
              {similar.length}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {state.data.currentWorkout?.intervalCount
              ? `${state.data.currentWorkout.intervalCount}-interval sessions`
              : 'Auto-matched by interval structure'}
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      {/* Trend chart */}
      {allEntries.length >= 2 && (hasPower || hasHR || hasLactate) && (
        <div className={`${isMobile ? 'px-3 py-3' : 'px-5 py-4'} border-b border-gray-100`}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Show:</span>
            {hasPower && (
              <button
                onClick={() => toggleMetric('power')}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${activeMetrics.power ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                Power (W)
              </button>
            )}
            {hasHR && (
              <button
                onClick={() => toggleMetric('hr')}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${activeMetrics.hr ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                HR (bpm)
              </button>
            )}
            {hasLactate && (
              <button
                onClick={() => toggleMetric('lactate')}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${activeMetrics.lactate ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                Lactate (mmol/L)
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip content={<CustomTooltip />} />
              {hasPower && activeMetrics.power && (
                <Line
                  type="monotone" dataKey="Power" name="Power (W)"
                  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }}
                  connectNulls activeDot={{ r: 5 }}
                />
              )}
              {hasHR && activeMetrics.hr && (
                <Line
                  type="monotone" dataKey="HR" name="HR (bpm)"
                  stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }}
                  connectNulls activeDot={{ r: 5 }}
                />
              )}
              {hasLactate && activeMetrics.lactate && (
                <Line
                  type="monotone" dataKey="Lactate" name="Lactate (mmol/L)"
                  stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }}
                  connectNulls activeDot={{ r: 5 }}
                />
              )}
              {/* Highlight current workout */}
              {chartData.map((d, i) =>
                d.isCurrent && d.Power && activeMetrics.power ? (
                  <ReferenceDot key={`cur-${i}`} x={d.date} y={d.Power} r={6} fill="#3b82f6" stroke="white" strokeWidth={2} />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 text-center mt-1">Trend across {allEntries.length} sessions · highlighted = this workout</p>
        </div>
      )}

      {/* Workout list */}
      <div className={`divide-y divide-gray-50 ${isMobile ? '' : ''}`}>
        {displayList.map((w) => (
          <div
            key={w._id}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group"
            onClick={() => onSelectWorkout?.(w._id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-base shrink-0">{SPORT_EMOJI(w.sport)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{w.title}</p>
                <p className="text-xs text-gray-400">{fmtDate(w.timestamp)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Key metrics */}
              <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                {w.avgPower && (
                  <span className="flex items-center gap-0.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    {w.avgPower}W
                  </span>
                )}
                {w.avgHR && (
                  <span className="flex items-center gap-0.5">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                    {w.avgHR}bpm
                  </span>
                )}
                {w.avgLactate && (
                  <span className="flex items-center gap-0.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    {w.avgLactate}mmol
                  </span>
                )}
              </div>
              {/* Similarity badge */}
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                w.similarity >= 90 ? 'bg-green-100 text-green-700' :
                w.similarity >= 75 ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {w.similarity}%
              </span>
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary transition-colors" />
            </div>
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {similar.length > 5 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-500 hover:text-primary border-t border-gray-100 hover:bg-gray-50 transition-colors"
        >
          {showAll ? (
            <><ChevronUpIcon className="w-3.5 h-3.5" />Show less</>
          ) : (
            <><ChevronDownIcon className="w-3.5 h-3.5" />Show {similar.length - 5} more</>
          )}
        </button>
      )}
    </div>
  );
}
