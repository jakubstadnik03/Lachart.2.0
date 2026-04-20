import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import {
  PresentationChartLineIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  FireIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ─── App palette (matches tailwind.config.js) ──────────────────────────────
const C = {
  primary:  '#767EB5',
  primaryDark: '#5E6590',
  greenos:  '#4BA87D',
  red:      '#E05347',
  text:     '#1D2C4C',
  lighter:  '#4A5E82',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('bike') || v.includes('cycl') || v.includes('ride')) return 'bike';
  if (v.includes('run')) return 'run';
  if (v.includes('swim')) return 'swim';
  return null;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtVal(val, isPace) {
  if (val == null || !Number.isFinite(val)) return '—';
  return isPace ? fmtPace(val) : `${Math.round(val)} W`;
}

// Extract LTP1 (aerobic, baseline +1.5) and LTP2 (anaerobic, ≥4.0 mmol/L)
function extractThresholds(test) {
  if (!test?.results || test.results.length < 3) return null;
  const sport = normSport(test.sport);
  const isPace = sport === 'run' || sport === 'swim';

  const pts = test.results
    .map(r => ({
      x: Number(String(r.power ?? '').replace(',', '.')),
      y: Number(String(r.lactate ?? '').replace(',', '.')),
      hr: Number(String(r.heartRate ?? '').replace(',', '.')),
    }))
    .filter(p => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);

  if (pts.length < 3) return null;
  pts.sort((a, b) => isPace ? b.x - a.x : a.x - b.x);

  const base = Number(test.baseLactate) || pts[0]?.y || 1.0;
  const lt1Target = base + 1.5;
  const lt2Target = Math.max(4.0, base + 3.0);

  const interp = (target) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((a.y - target) * (b.y - target) <= 0) {
        const t = (target - a.y) / (b.y - a.y || 1);
        const x = a.x + t * (b.x - a.x);
        const hr = (Number.isFinite(a.hr) && Number.isFinite(b.hr))
          ? Math.round(a.hr + t * (b.hr - a.hr)) : null;
        return { value: Math.round(x * 10) / 10, hr };
      }
    }
    return null;
  };

  return { ltp1: interp(lt1Target), ltp2: interp(lt2Target) ?? interp(4.0), base, isPace, sport };
}

// Linear regression slope for trend detection
function trendSlope(data, key) {
  const valid = data.filter(d => d[key] != null && Number.isFinite(d[key]));
  if (valid.length < 2) return 0;
  const n = valid.length;
  const ys = valid.map(d => d[key]);
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = valid.reduce((s, _, i) => s + (i - mx) * (ys[i] - my), 0);
  const den = valid.reduce((s, _, i) => s + (i - mx) ** 2, 0);
  return den ? num / den : 0;
}

// Strava current-performance estimate
function computeStravaPerf(sport, externalActivities, bikePowerMetrics) {
  if (!externalActivities?.length) return null;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  if (sport === 'bike') {
    const p20 = bikePowerMetrics?.personalRecords?.threshold20min
      || bikePowerMetrics?.allTime?.threshold20min;
    if (p20 && p20 > 50) return { value: Math.round(p20 * 0.95), label: '20-min FTP estimate', isPace: false };

    const rides = externalActivities.filter(a => {
      const s = (a.sport || a.type || '').toLowerCase();
      const t = new Date(a.startDate || a.date || 0).getTime();
      const dur = Number(a.movingTime || a.duration || 0);
      const pwr = Number(a.avgPower || a.averagePower || 0);
      return (s.includes('ride') || s.includes('bike') || s.includes('cycl') || s === 'virtualride')
        && t >= cutoff && dur >= 40 * 60 && pwr > 50;
    });
    if (!rides.length) return null;
    const avg = rides.reduce((s, r) => s + Number(r.avgPower || r.averagePower), 0) / rides.length;
    return { value: Math.round(avg), label: `avg power · ${rides.length} rides`, isPace: false };
  }

  if (sport === 'run') {
    const runs = externalActivities.filter(a => {
      const s = (a.sport || a.type || '').toLowerCase();
      const t = new Date(a.startDate || a.date || 0).getTime();
      const dur = Number(a.movingTime || a.duration || 0);
      return s.includes('run') && t >= cutoff && dur >= 20 * 60;
    });
    if (!runs.length) return null;
    const best = runs.reduce((acc, r) => {
      const v = Number(r.avgSpeed || r.averageSpeed || 0);
      return v > acc ? v : acc;
    }, 0);
    if (best <= 0) return null;
    const secPerKm = Math.round(1000 / best);
    return { value: Math.round(secPerKm * 1.03), label: 'est. threshold pace', isPace: true };
  }

  return null;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TrendBadge({ slope, isPace }) {
  const abs = Math.abs(slope);
  const improving = isPace ? slope < 0 : slope > 0;
  if (abs < 0.5) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400">
        <ArrowRightIcon className="w-3 h-3" /> Stable
      </span>
    );
  }
  return improving
    ? (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-greenos">
        <ArrowTrendingUpIcon className="w-3.5 h-3.5" /> Improving
      </span>
    )
    : (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: C.red }}>
        <ArrowTrendingDownIcon className="w-3.5 h-3.5" /> Declining
      </span>
    );
}

function CustomTooltip({ active, payload, label, isPace }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-lg px-3 py-2.5 text-xs min-w-[150px]">
      <div className="font-semibold text-text mb-1.5">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}</span>
          <span className="ml-auto font-bold" style={{ color: p.color }}>{fmtVal(p.value, isPace)}</span>
        </div>
      ))}
    </div>
  );
}

const REC = {
  retest: {
    Icon: ExclamationTriangleIcon,
    bg: '#FFF5F4',
    border: '#F9BDB9',
    text: C.red,
    dot: C.red,
    label: 'Retest Recommended',
  },
  soon: {
    Icon: ClockIcon,
    bg: '#FFFBEB',
    border: '#FDE68A',
    text: '#B45309',
    dot: '#F59E0B',
    label: 'Test Due Soon',
  },
  ok: {
    Icon: CheckCircleIcon,
    bg: '#F0FDF9',
    border: '#A7F3D0',
    text: C.greenos,
    dot: C.greenos,
    label: 'Threshold Still Valid',
  },
};

const SPORT_LABELS = { bike: 'Cycling', run: 'Running', swim: 'Swimming' };
const SPORT_ICONS  = { bike: '🚴', run: '🏃', swim: '🏊' };

// ─── Main component ──────────────────────────────────────────────────────────

export default function ThresholdHistory({
  tests = [],
  onSelectTestId,
  externalActivities = [],
  bikePowerMetrics = null,
  onClose,
}) {
  const sportData = useMemo(() => {
    const result = {};
    [...tests]
      .filter(t => t?.results?.length >= 3 && t?.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(test => {
        const sport = normSport(test.sport);
        if (!sport) return;
        const th = extractThresholds(test);
        if (!th) return;
        if (!result[sport]) result[sport] = { points: [], isPace: th.isPace };
        result[sport].points.push({
          date:    fmtDate(test.date),
          rawDate: new Date(test.date).getTime(),
          ltp1:    th.ltp1?.value ?? null,
          ltp2:    th.ltp2?.value ?? null,
          ltp1hr:  th.ltp1?.hr   ?? null,
          ltp2hr:  th.ltp2?.hr   ?? null,
          testId:  test._id,
        });
      });
    return result;
  }, [tests]);

  const availableSports = Object.keys(sportData).filter(s => sportData[s].points.length >= 1);

  const [activeSport, setActiveSport] = useState(() =>
    availableSports.includes('bike') ? 'bike' : availableSports[0] || 'bike'
  );

  const current  = sportData[activeSport] ?? { points: [], isPace: false };
  const isPace   = current.isPace;
  const points   = current.points;
  const lastPt   = points[points.length - 1];

  const ltp1Slope = trendSlope(points, 'ltp1');
  const ltp2Slope = trendSlope(points, 'ltp2');

  const stravaPerf = useMemo(
    () => computeStravaPerf(activeSport, externalActivities, bikePowerMetrics),
    [activeSport, externalActivities, bikePowerMetrics]
  );

  const stravaRec = useMemo(() => {
    if (!stravaPerf || !lastPt?.ltp2) return null;
    const ratio = isPace
      ? lastPt.ltp2 / stravaPerf.value   // pace: lower = faster; >1 means athlete is now faster
      : stravaPerf.value / lastPt.ltp2;  // power: >1 means current > threshold
    if (ratio >= 1.05) return {
      level: 'retest',
      detail: isPace
        ? `Current pace (${fmtPace(stravaPerf.value)}) is faster than last test LTP2 (${fmtPace(lastPt.ltp2)})`
        : `Current power (~${stravaPerf.value} W) exceeds last test LTP2 (${Math.round(lastPt.ltp2)} W)`,
    };
    if (ratio >= 1.02) return {
      level: 'soon',
      detail: isPace
        ? `Current pace (${fmtPace(stravaPerf.value)}) approaching LTP2 (${fmtPace(lastPt.ltp2)})`
        : `Current power (~${stravaPerf.value} W) approaching LTP2 (${Math.round(lastPt.ltp2)} W)`,
    };
    return {
      level: 'ok',
      detail: isPace
        ? `Fitness below LTP2 (${fmtPace(lastPt.ltp2)}) — no retest needed yet`
        : `Fitness below LTP2 (${Math.round(lastPt.ltp2)} W) — no retest needed yet`,
    };
  }, [stravaPerf, lastPt, isPace]);

  // Y-axis bounds
  const allVals = points.flatMap(p => [p.ltp1, p.ltp2].filter(v => v != null));
  if (stravaPerf?.value) allVals.push(stravaPerf.value);
  const yMin = allVals.length ? Math.min(...allVals) : 0;
  const yMax = allVals.length ? Math.max(...allVals) : 100;
  const pad  = (yMax - yMin) * 0.2 || 15;
  const yDomain = [Math.max(0, yMin - pad), yMax + pad];

  if (availableSports.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: `${C.primary}15` }}>
            <PresentationChartLineIcon className="w-4.5 h-4.5" style={{ color: C.primary, width: 18, height: 18 }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: C.text }}>Threshold Progression</h2>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">LT1 · LT2 history over time</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
        {/* Sport pills */}
        <div className="flex gap-1">
          {availableSports.map(sp => (
            <button
              key={sp}
              onClick={() => setActiveSport(sp)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={activeSport === sp
                ? { background: C.primary, color: '#fff', boxShadow: `0 2px 8px ${C.primary}40` }
                : { background: '#F3F4F6', color: C.lighter }
              }
            >
              {SPORT_ICONS[sp]} {SPORT_LABELS[sp]}
            </button>
          ))}
        </div>

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            title="Hide threshold history"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
            style={{ color: '#9CA3AF' }}
          >
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        )}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-400 px-4">
          Add at least one test with 3+ steps to see threshold history.
        </div>
      ) : (
        <div className="px-4 pb-4 space-y-3">

          {/* ── Latest threshold cards ── */}
          <div className="grid grid-cols-2 gap-2">
            {/* LT1 / Aerobic */}
            <div className="rounded-2xl px-3 py-2.5" style={{ background: `${C.greenos}12`, border: `1px solid ${C.greenos}25` }}>
              <div className="flex items-start justify-between gap-1">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.greenos }}>
                    LT1 · Aerobic
                  </div>
                  <div className="text-lg font-black leading-none" style={{ color: C.greenos }}>
                    {fmtVal(lastPt?.ltp1, isPace)}
                  </div>
                  {lastPt?.ltp1hr && (
                    <div className="text-[10px] mt-0.5" style={{ color: `${C.greenos}99` }}>
                      ♥ {lastPt.ltp1hr} bpm
                    </div>
                  )}
                </div>
                <TrendBadge slope={ltp1Slope} isPace={isPace} />
              </div>
            </div>

            {/* LT2 / Anaerobic */}
            <div className="rounded-2xl px-3 py-2.5" style={{ background: `${C.red}10`, border: `1px solid ${C.red}20` }}>
              <div className="flex items-start justify-between gap-1">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.red }}>
                    LT2 · Anaerobic
                  </div>
                  <div className="text-lg font-black leading-none" style={{ color: C.red }}>
                    {fmtVal(lastPt?.ltp2, isPace)}
                  </div>
                  {lastPt?.ltp2hr && (
                    <div className="text-[10px] mt-0.5" style={{ color: `${C.red}99` }}>
                      ♥ {lastPt.ltp2hr} bpm
                    </div>
                  )}
                </div>
                <TrendBadge slope={ltp2Slope} isPace={isPace} />
              </div>
            </div>
          </div>

          {/* ── Chart ── */}
          {points.length >= 2 ? (
            <div className="h-48 -mx-1 pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lt1grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.greenos} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={C.greenos} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lt2grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.red} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => isPace ? fmtPace(v) : `${v}W`}
                    width={isPace ? 60 : 40}
                  />
                  <Tooltip content={<CustomTooltip isPace={isPace} />} />

                  {/* Strava current-level reference */}
                  {stravaPerf?.value && (
                    <ReferenceLine
                      y={stravaPerf.value}
                      stroke={C.primary}
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      label={{
                        value: 'Current (Strava)',
                        position: 'insideTopRight',
                        fontSize: 9,
                        fill: C.primary,
                        fontWeight: 600,
                      }}
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="ltp1"
                    name="LT1 (Aerobic)"
                    stroke={C.greenos}
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#fff', stroke: C.greenos, strokeWidth: 2.5 }}
                    activeDot={{ r: 7, fill: C.greenos, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="ltp2"
                    name="LT2 (Anaerobic)"
                    stroke={C.red}
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#fff', stroke: C.red, strokeWidth: 2.5 }}
                    activeDot={{ r: 7, fill: C.red, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />

                  <Legend
                    wrapperStyle={{ fontSize: 10, paddingTop: 6, color: C.lighter }}
                    iconType="circle"
                    iconSize={7}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 text-center py-3">
              Add a second test to display the progression chart.
            </p>
          )}

          {/* ── Clickable test history chips ── */}
          {onSelectTestId && points.length >= 2 && (
            <div className="flex gap-1.5 flex-wrap pt-0.5">
              {points.map((pt, i) => (
                <button
                  key={pt.testId}
                  onClick={() => onSelectTestId(pt.testId)}
                  className="group flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-medium transition-all"
                  style={{ borderColor: '#E5E7EB', color: C.lighter, background: '#F9FAFB' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = C.primary + '60';
                    e.currentTarget.style.background  = C.primary + '0D';
                    e.currentTarget.style.color        = C.primary;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#E5E7EB';
                    e.currentTarget.style.background  = '#F9FAFB';
                    e.currentTarget.style.color        = C.lighter;
                  }}
                  title={`Test ${i + 1}: LT1 ${fmtVal(pt.ltp1, isPace)} / LT2 ${fmtVal(pt.ltp2, isPace)}`}
                >
                  <span className="font-semibold">{pt.date}</span>
                  {pt.ltp2 && (
                    <span className="opacity-60">{fmtVal(pt.ltp2, isPace)}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Strava-based recommendation banner ── */}
          {stravaRec && (() => {
            const r = REC[stravaRec.level];
            const { Icon } = r;
            return (
              <div
                className="flex items-start gap-3 rounded-2xl border px-3.5 py-3"
                style={{ background: r.bg, borderColor: r.border }}
              >
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                     style={{ background: `${r.dot}20` }}>
                  <Icon style={{ width: 15, height: 15, color: r.text }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold" style={{ color: r.text }}>{r.label}</div>
                  <div className="text-[10px] mt-0.5 leading-snug" style={{ color: `${r.text}B0` }}>
                    {stravaRec.detail}
                  </div>
                </div>
                <FireIcon style={{ width: 14, height: 14, color: r.text, opacity: 0.5, flexShrink: 0, marginTop: 2 }} />
              </div>
            );
          })()}

          {/* Strava source note when no retest rec */}
          {stravaPerf && !stravaRec && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 pt-0.5">
              <div className="w-4 h-4 rounded-md flex items-center justify-center"
                   style={{ background: `${C.primary}15` }}>
                <FireIcon style={{ width: 10, height: 10, color: C.primary }} />
              </div>
              <span>Strava · {stravaPerf.label} · ~{fmtVal(stravaPerf.value, stravaPerf.isPace)}</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
