/**
 * LactateTrendPanel
 * ─────────────────
 * Shows four lactate-progression analyses for an athlete:
 *   1. Pace/power-to-lactate trend per intensity bin (scatter + trend line)
 *   2. Session drift overview (accumulating / stable / clearing badges)
 *   3. Anomaly flags (sessions where lactate was unusually high)
 *   4. Clearance index per session
 *
 * Usage:
 *   <LactateTrendPanel athleteId="abc123" days={120} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

// ─── tiny helpers ────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  const colors = {
    improving:   'bg-emerald-100 text-emerald-700',
    stable:      'bg-gray-100 text-gray-600',
    declining:   'bg-rose-100 text-rose-700',
    accumulating:'bg-amber-100 text-amber-700',
    clearing:    'bg-sky-100 text-sky-700',
    excellent:   'bg-emerald-100 text-emerald-700',
    good:        'bg-teal-100 text-teal-700',
    moderate:    'bg-amber-100 text-amber-700',
    poor:        'bg-rose-100 text-rose-700',
    insufficient_data: 'bg-gray-100 text-gray-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none ${colors[label] || 'bg-gray-100 text-gray-500'}`}>
      {color || label}
    </span>
  );
}

// ─── Scatter + trend line for one intensity bin ──────────────────────────────

function BinScatter({ binKey, data }) {
  const { points, slope, r2, label, count } = data;
  if (!points || points.length === 0) return null;

  const W = 280, H = 80, PAD_L = 28, PAD_R = 8, PAD_T = 6, PAD_B = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const dates = points.map((p) => new Date(p.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;

  const lactates = points.map((p) => p.lactate);
  const minLa = Math.max(0, Math.min(...lactates) - 0.3);
  const maxLa = Math.max(...lactates) + 0.3;
  const laRange = maxLa - minLa || 1;

  const xOf = (dateMs) => PAD_L + ((dateMs - minDate) / dateRange) * innerW;
  const yOf = (la) => PAD_T + innerH - ((la - minLa) / laRange) * innerH;

  // Trend line endpoints
  const trendColor = label === 'improving' ? '#10b981' : label === 'declining' ? '#ef4444' : '#94a3b8';
  const x1 = PAD_L;
  const x2 = PAD_L + innerW;
  // slope is in mmol/day; convert back to ms for the regression
  const dayRange = dateRange / (1000 * 60 * 60 * 24);
  // intercept: mean lactate at midpoint
  const meanLa = lactates.reduce((s, v) => s + v, 0) / lactates.length;
  const y1 = yOf(meanLa - (slope * dayRange) / 2);
  const y2 = yOf(meanLa + (slope * dayRange) / 2);

  // Date labels
  const fmt = (ms) => new Date(ms).toLocaleDateString('cs', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-gray-700 truncate max-w-[160px]">{binKey}</span>
        <div className="flex items-center gap-1.5">
          <Badge label={label} />
          <span className="text-[9px] text-gray-400">{count} pts · R²{r2.toFixed(2)}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Gridlines */}
        {[0, 0.5, 1].map((f, i) => (
          <line key={i}
            x1={PAD_L} x2={W - PAD_R}
            y1={PAD_T + f * innerH} y2={PAD_T + f * innerH}
            stroke="#e5e7eb" strokeWidth={0.5}
          />
        ))}
        {/* Y labels */}
        {[minLa, (minLa + maxLa) / 2, maxLa].map((v, i) => (
          <text key={i} x={PAD_L - 2} y={yOf(v) + 3}
            fontSize="6" fill="#9ca3af" textAnchor="end">
            {v.toFixed(1)}
          </text>
        ))}
        {/* Trend line */}
        {count >= 3 && r2 > 0.05 && (
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={trendColor} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        )}
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i}
            cx={xOf(new Date(p.date).getTime())}
            cy={yOf(p.lactate)}
            r="3"
            fill={trendColor}
            opacity="0.85"
          >
            <title>{p.date}: {p.lactate} mmol/L</title>
          </circle>
        ))}
        {/* X date labels */}
        <text x={PAD_L} y={H - 2} fontSize="6.5" fill="#9ca3af">{fmt(minDate)}</text>
        <text x={W - PAD_R} y={H - 2} fontSize="6.5" fill="#9ca3af" textAnchor="end">{fmt(maxDate)}</text>
      </svg>
    </div>
  );
}

// ─── Session drift row ────────────────────────────────────────────────────────

function SessionRow({ session }) {
  const { date, sport, avgLactate, drift, clearance, anomaly } = session;
  const driftLabel = drift?.label;
  const clearLabel = clearance?.label;

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0 text-[11px]">
      <span className="text-gray-500 shrink-0 w-20">{date}</span>
      <span className="text-gray-400 shrink-0 capitalize w-14 truncate">{sport}</span>
      <span className="font-semibold tabular-nums text-gray-800 w-12">
        {avgLactate != null ? `${avgLactate} mmol` : '—'}
      </span>
      {driftLabel && driftLabel !== 'insufficient_data' && (
        <Badge label={driftLabel} color={
          driftLabel === 'accumulating' ? '↑ drift'
          : driftLabel === 'clearing' ? '↓ clear'
          : '→ stable'
        } />
      )}
      {clearLabel && clearLabel !== 'insufficient_data' && (
        <Badge label={clearLabel} color={`clearance: ${clearLabel}`} />
      )}
      {anomaly?.isAnomaly && (
        <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
          ⚠ z={anomaly.zScore}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LactateTrendPanel({ athleteId, days = 120 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDays, setActiveDays] = useState(days);
  const [activeTab, setActiveTab] = useState('trend'); // 'trend' | 'sessions'

  useEffect(() => {
    if (!athleteId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get(`/api/lactate-analytics/${athleteId}`, { params: { days: activeDays } })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.error || e.message || 'Failed to load');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [athleteId, activeDays]);

  // Sort trend bins by count descending (most data first)
  const sortedBins = useMemo(() => {
    if (!data?.trend) return [];
    return Object.entries(data.trend)
      .sort((a, b) => b[1].count - a[1].count);
  }, [data]);

  const anomalies = data?.anomalies || [];
  const sessions = data?.sessionAnalyses || [];

  if (!athleteId) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Lactate progression</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            Trend laktátu při stejné intenzitě, drift v trénincích a detekce anomálií.
          </p>
        </div>
        {/* Days selector */}
        <div className="flex gap-1">
          {[60, 120, 180].map((d) => (
            <button
              key={d}
              onClick={() => setActiveDays(d)}
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                activeDays === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-32 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Sessions</div>
              <div className="text-base font-bold text-gray-900 mt-1">{data.sessionCount}</div>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Intensity bins</div>
              <div className="text-base font-bold text-gray-900 mt-1">{sortedBins.length}</div>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Anomálie</div>
              <div className={`text-base font-bold mt-1 ${anomalies.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {anomalies.length}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-100 pb-1">
            {[
              { key: 'trend', label: 'Trend intenzity' },
              { key: 'sessions', label: 'Tréninky' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  activeTab === tab.key ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: intensity trend */}
          {activeTab === 'trend' && (
            sortedBins.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">
                Nedostatek dat pro výpočet trendů — zaznamenej laktát alespoň ve 2 trénincích při podobné intenzitě.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sortedBins.map(([bin, binData]) => (
                  <BinScatter key={bin} binKey={bin} data={binData} />
                ))}
              </div>
            )
          )}

          {/* Tab: sessions list */}
          {activeTab === 'sessions' && (
            sessions.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">Žádné tréninky s laktátem.</div>
            ) : (
              <div>
                {anomalies.length > 0 && (
                  <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-700 font-medium">
                    ⚠ {anomalies.length} trénink{anomalies.length > 1 ? 'y' : ''} s neobvykle vysokým laktátem pro danou intenzitu.
                    {anomalies.map((a) => (
                      <span key={a.date} className="ml-1 font-bold">{a.date}</span>
                    ))}
                  </div>
                )}
                <div className="divide-y divide-gray-50">
                  {/* Header */}
                  <div className="flex items-center gap-2 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                    <span className="w-20">Datum</span>
                    <span className="w-14">Sport</span>
                    <span className="w-12">Avg La</span>
                    <span>Drift</span>
                  </div>
                  {[...sessions].reverse().map((s) => (
                    <SessionRow key={s.id || s.date} session={s} />
                  ))}
                </div>
              </div>
            )
          )}
        </>
      )}

      {!loading && !error && data?.sessionCount === 0 && (
        <div className="text-xs text-gray-400 py-6 text-center">
          V posledních {activeDays} dnech žádná data s laktátem. Začni zaznamenávat laktát k intervalům.
        </div>
      )}
    </div>
  );
}
