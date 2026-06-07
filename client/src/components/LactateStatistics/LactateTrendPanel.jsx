/**
 * LactateTrendPanel
 * ─────────────────
 * Lactate-progression analytics for an athlete:
 *   1. Pace/power-to-lactate trend per intensity bin (scatter + trend line)
 *   2. Session drift / clearance / anomaly per training
 *
 * Interactive:
 *   • Sport switcher (All / Bike / Run / Swim) filters both tabs.
 *   • Click a scatter dot → popover with that point's details + open the training.
 *   • Click a training row → opens that training.
 *
 * Usage:
 *   <LactateTrendPanel athleteId="abc123" days={120} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import useElementWidth from '../../hooks/useElementWidth';

// ─── helpers ─────────────────────────────────────────────────────────────────

function canonicalSport(s) {
  const k = String(s || '').toLowerCase();
  if (k.includes('bik') || k.includes('cycl') || k === 'mtb') return 'bike';
  if (k.includes('run') || k === 'walk' || k === 'hike') return 'run';
  if (k.includes('swim')) return 'swim';
  return 'other';
}
const SPORT_META = {
  all:  { label: 'Vše',  icon: '◎' },
  bike: { label: 'Kolo', icon: '🚴' },
  run:  { label: 'Běh',  icon: '🏃' },
  swim: { label: 'Plav', icon: '🏊' },
  other:{ label: 'Jiné', icon: '•' },
};
const SPORT_ORDER = ['bike', 'run', 'swim', 'other'];

/** Build the route that opens a given source training. */
function trainingHref({ source, id }) {
  if (!id) return null;
  if (source === 'fit') return `/training-calendar/fit-${id}`;
  return `/training-calendar/${id}`;
}

function fmtIntensity(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  if (unit === 'watts') return `${Math.round(v)} W`;
  if (unit === 'secPerKm') {
    const m = Math.floor(v / 60), s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  }
  return String(Math.round(v));
}

/** Client-side linear regression so a sport-filtered subset gets its own trend. */
function regress(points) {
  if (!points || points.length < 2) return { slope: 0, r2: 0, label: 'stable' };
  const t0 = new Date(points[0].date).getTime();
  const xs = points.map((p) => (new Date(p.date).getTime() - t0) / 86400000); // days
  const ys = points.map((p) => p.lactate);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const slope = sxx ? sxy / sxx : 0;
  const r2 = (sxx && syy) ? (sxy * sxy) / (sxx * syy) : 0;
  let label = 'stable';
  if (slope < -0.005) label = 'improving';
  else if (slope > 0.005) label = 'declining';
  return { slope, r2, label };
}

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

function BinScatter({ binKey, points, unit, onPointClick }) {
  const [wrapRef, w] = useElementWidth(280);
  if (!points || points.length < 2) return null;

  const W = w > 0 ? w : 280, H = 96, PAD_L = 30, PAD_R = 10, PAD_T = 8, PAD_B = 18;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const pts = [...points].sort((a, b) => new Date(a.date) - new Date(b.date));
  const dates = pts.map((p) => new Date(p.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;

  const lactates = pts.map((p) => p.lactate);
  const minLa = Math.max(0, Math.min(...lactates) - 0.3);
  const maxLa = Math.max(...lactates) + 0.3;
  const laRange = maxLa - minLa || 1;

  const xOf = (ms) => PAD_L + ((ms - minDate) / dateRange) * innerW;
  const yOf = (la) => PAD_T + innerH - ((la - minLa) / laRange) * innerH;

  const { slope, r2, label } = regress(pts);
  const trendColor = label === 'improving' ? '#10b981' : label === 'declining' ? '#ef4444' : '#94a3b8';
  const dayRange = dateRange / 86400000;
  const meanLa = lactates.reduce((s, v) => s + v, 0) / lactates.length;
  const y1 = yOf(meanLa - (slope * dayRange) / 2);
  const y2 = yOf(meanLa + (slope * dayRange) / 2);

  const fmt = (ms) => new Date(ms).toLocaleDateString('cs', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-gray-700 truncate max-w-[160px]">{binKey}</span>
        <div className="flex items-center gap-1.5">
          <Badge label={label} />
          <span className="text-[9px] text-gray-400">{pts.length} pts · R²{r2.toFixed(2)}</span>
        </div>
      </div>

      <div ref={wrapRef} style={{ width: '100%' }}>
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
            <text key={i} x={PAD_L - 4} y={yOf(v) + 3}
              fontSize="7" fill="#9ca3af" textAnchor="end">
              {v.toFixed(1)}
            </text>
          ))}
          {/* Trend line */}
          {pts.length >= 3 && r2 > 0.05 && (
            <line x1={PAD_L} y1={y1} x2={PAD_L + innerW} y2={y2}
              stroke={trendColor} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
          )}
          {/* Points — bigger transparent hit area so taps land easily */}
          {pts.map((p, i) => (
            <g key={i} style={{ cursor: 'pointer' }} onClick={(e) => onPointClick && onPointClick({ ...p, unit }, e)}>
              <circle cx={xOf(dates[i])} cy={yOf(p.lactate)} r="10" fill="transparent" />
              <circle cx={xOf(dates[i])} cy={yOf(p.lactate)} r="3.5"
                fill={trendColor} opacity="0.9" stroke="#fff" strokeWidth="1" />
            </g>
          ))}
          {/* X date labels */}
          <text x={PAD_L} y={H - 3} fontSize="7" fill="#9ca3af">{fmt(minDate)}</text>
          <text x={W - PAD_R} y={H - 3} fontSize="7" fill="#9ca3af" textAnchor="end">{fmt(maxDate)}</text>
        </svg>
      </div>
    </div>
  );
}

// ─── Session drift row (clickable → opens the training) ──────────────────────

function SessionRow({ session, onOpen }) {
  const { date, sport, avgLactate, drift, clearance, anomaly } = session;
  const driftLabel = drift?.label;
  const clearLabel = clearance?.label;
  const href = onOpen ? trainingHref({ source: session.source, id: session.id }) : null;

  return (
    <button
      type="button"
      onClick={() => href && onOpen(href)}
      disabled={!href}
      className={`w-full flex items-center gap-2 py-2 border-b border-gray-100 last:border-0 text-[11px] text-left transition-colors ${
        href ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
      }`}
    >
      <span className="text-gray-500 shrink-0 w-20">{date}</span>
      <span className="text-gray-400 shrink-0 capitalize w-14 truncate">{SPORT_META[canonicalSport(sport)].label}</span>
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
      {href && <span className={`text-gray-300 ${anomaly?.isAnomaly ? 'ml-1.5' : 'ml-auto'}`}>›</span>}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LactateTrendPanel({ athleteId, days = 120 }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDays, setActiveDays] = useState(days);
  const [activeTab, setActiveTab] = useState('trend'); // 'trend' | 'sessions'
  const [sport, setSport] = useState('all');           // 'all' | 'bike' | 'run' | 'swim' | 'other'
  const [sel, setSel] = useState(null);                // { point, x, y } — dot popover

  useEffect(() => {
    if (!athleteId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSel(null);

    api.get(`/api/lactate-analytics/${athleteId}`, { params: { days: activeDays } })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.error || e.message || 'Failed to load');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [athleteId, activeDays]);

  // Which sports actually have data (so we only show relevant chips).
  const availableSports = useMemo(() => {
    const set = new Set();
    (data?.sessionAnalyses || []).forEach((s) => set.add(canonicalSport(s.sport)));
    Object.values(data?.trend || {}).forEach((b) =>
      (b.points || []).forEach((p) => set.add(canonicalSport(p.sport))));
    return SPORT_ORDER.filter((s) => set.has(s));
  }, [data]);

  // Reset to "all" if the chosen sport disappears (e.g. after changing the window).
  useEffect(() => {
    if (sport !== 'all' && !availableSports.includes(sport)) setSport('all');
  }, [availableSports, sport]);

  const matchesSport = (s) => sport === 'all' || canonicalSport(s) === sport;

  // Trend bins, with each bin's points filtered to the selected sport.
  const sortedBins = useMemo(() => {
    if (!data?.trend) return [];
    return Object.entries(data.trend)
      .map(([bin, b]) => {
        const pts = (b.points || []).filter((p) => matchesSport(p.sport));
        return [bin, { ...b, points: pts, count: pts.length }];
      })
      .filter(([, b]) => b.points.length >= 2)
      .sort((a, b) => b[1].count - a[1].count);
  }, [data, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const sessions = useMemo(
    () => (data?.sessionAnalyses || []).filter((s) => matchesSport(s.sport)),
    [data, sport], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const anomalyCount = useMemo(() => sessions.filter((s) => s.anomaly?.isAnomaly).length, [sessions]);

  const openTraining = (href) => { if (href) { setSel(null); navigate(href); } };

  const onPointClick = (point, e) => {
    setSel({
      point,
      x: Math.min(e.clientX, (typeof window !== 'undefined' ? window.innerWidth : 400) - 220),
      y: e.clientY,
    });
  };

  if (!athleteId) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Lactate progression</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            Trend laktátu při stejné intenzitě, drift v trénincích a detekce anomálií.
          </p>
        </div>
        {/* Days selector */}
        <div className="flex gap-1 shrink-0">
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

      {/* Sport switcher */}
      {!loading && !error && availableSports.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {['all', ...availableSports].map((s) => (
            <button
              key={s}
              onClick={() => { setSport(s); setSel(null); }}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                sport === s
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{SPORT_META[s].icon}</span>{SPORT_META[s].label}
            </button>
          ))}
        </div>
      )}

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
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Tréninky</div>
              <div className="text-base font-bold text-gray-900 mt-1">{sessions.length}</div>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Intensity bins</div>
              <div className="text-base font-bold text-gray-900 mt-1">{sortedBins.length}</div>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Anomálie</div>
              <div className={`text-base font-bold mt-1 ${anomalyCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {anomalyCount}
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
                Nedostatek dat pro výpočet trendů{sport !== 'all' ? ' pro tento sport' : ''} — zaznamenej laktát alespoň ve 2 trénincích při podobné intenzitě.
              </div>
            ) : (
              <>
                <p className="text-[10px] text-gray-400 mb-2">Klikni na tečku pro detail a otevření tréninku.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sortedBins.map(([bin, binData]) => (
                    <BinScatter key={bin} binKey={bin} points={binData.points} unit={binData.unit} onPointClick={onPointClick} />
                  ))}
                </div>
              </>
            )
          )}

          {/* Tab: sessions list */}
          {activeTab === 'sessions' && (
            sessions.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">Žádné tréninky s laktátem.</div>
            ) : (
              <div>
                {anomalyCount > 0 && (
                  <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-700 font-medium">
                    ⚠ {anomalyCount} trénink{anomalyCount > 1 ? 'y' : ''} s neobvykle vysokým laktátem pro danou intenzitu.
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
                    <SessionRow key={s.id || s.date} session={s} onOpen={openTraining} />
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

      {/* Dot popover — details for a clicked scatter point + open the training */}
      {sel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSel(null)} />
          <div
            className="fixed z-50 w-52 bg-white rounded-xl shadow-xl border border-gray-200 p-3 text-[11px]"
            style={{ left: Math.max(8, sel.x), top: sel.y + 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-gray-900">{sel.point.date}</span>
              <span className="text-gray-400 capitalize">{SPORT_META[canonicalSport(sel.point.sport)].label}</span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl font-black tabular-nums text-gray-900">{sel.point.lactate}</span>
              <span className="text-gray-400">mmol/L</span>
            </div>
            {fmtIntensity(sel.point.intensity, sel.point.unit) && (
              <div className="text-gray-500 mb-2">při {fmtIntensity(sel.point.intensity, sel.point.unit)}</div>
            )}
            {trainingHref({ source: sel.point.source, id: sel.point.sessionId }) ? (
              <button
                onClick={() => openTraining(trainingHref({ source: sel.point.source, id: sel.point.sessionId }))}
                className="w-full text-center text-[11px] font-semibold text-white bg-primary rounded-lg py-1.5 hover:opacity-90"
              >
                Otevřít trénink ›
              </button>
            ) : (
              <div className="text-[10px] text-gray-400 text-center">Trénink nelze otevřít</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
