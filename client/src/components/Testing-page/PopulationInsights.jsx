/**
 * PopulationInsights — redesigned
 * Shows distribution histograms + athlete's percentile position
 * vs all athletes in the LaChart database who have set their zones.
 *
 * Added vs old version:
 *  - Absolute W / pace charts alongside W/kg
 *  - Prominent percentile badge (empirical, not gaussian)
 *  - Redesigned to match app palette (primary, greenos, red)
 *  - Box-plot summary strip under each histogram
 *  - Collapsible "How to read" tip
 *  - Better empty / loading states
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis,
  Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import {
  UsersIcon,
  ChartBarIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';

// ─── App palette ──────────────────────────────────────────────────────────────
const C = {
  primary:  '#767EB5',
  primaryDk:'#5E6590',
  greenos:  '#4BA87D',
  red:      '#E05347',
  secondary:'#599FD0',
  text:     '#1D2C4C',
  lighter:  '#4A5E82',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPace(sec) {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtBike(v, type) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (type === 'wkg')   return `${v.toFixed(2)} W/kg`;
  if (type === 'ratio') return `${(v * 100).toFixed(1)}%`;
  return `${Math.round(v)} W`;
}

// Empirical percentile using quartile-based piecewise interpolation
function empiricalPercentile(value, stat) {
  if (value == null || !stat) return null;
  const { min, max, p25, median: med, p75 } = stat;
  if (!Number.isFinite(value) || !Number.isFinite(min)) return null;
  if (value <= min) return 1;
  if (value >= max) return 99;
  const segs = [[min, 0], [p25, 25], [med, 50], [p75, 75], [max, 100]];
  for (let i = 0; i < segs.length - 1; i++) {
    const [x0, p0] = segs[i];
    const [x1, p1] = segs[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (x1 - x0) > 0 ? (value - x0) / (x1 - x0) : 0;
      return Math.round(p0 + t * (p1 - p0));
    }
  }
  return 50;
}

function pctLabel(p) {
  if (p == null) return null;
  if (p >= 90) return { label: `Top ${100 - p}%`, color: C.greenos };
  if (p >= 70) return { label: `Top ${100 - p}%`, color: C.secondary };
  if (p >= 50) return { label: `${p}th percentile`, color: C.primary };
  return { label: `${p}th percentile`, color: C.lighter };
}

function histPoints(metric, scale = 1) {
  if (!metric?.distribution?.length) return [];
  const { min, max, distribution: dist } = metric;
  const bins = dist.length;
  const mn = Number(min), mx = Number(max);
  if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn >= mx) return [];
  const bw = (mx - mn) / bins;
  return dist.map((raw, i) => ({
    x: (mn + (i + 0.5) * bw) * scale,
    y: Number(raw) || 0,
  }));
}

// ─── Histogram card ───────────────────────────────────────────────────────────

function HistoCard({ title, subtitle, data, xLabel, xFmt, refX, refLabel, stat, scale = 1 }) {
  const pct = stat && refX != null ? empiricalPercentile(refX / scale, stat) : null;
  const badge = pctLabel(pct);
  const hasRef = refX != null && Number.isFinite(refX);

  const tickFmt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? xFmt(n) : '—';
  };

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
      {/* Card header */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2"
           style={{ background: `${C.primary}06` }}>
        <div>
          <div className="text-xs font-bold" style={{ color: C.text }}>{title}</div>
          {subtitle && <div className="text-[10px] mt-0.5" style={{ color: C.lighter }}>{subtitle}</div>}
        </div>
        {badge && hasRef && (
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${badge.color}18`, color: badge.color }}>
              {badge.label}
            </span>
            <span className="text-[10px]" style={{ color: C.lighter }}>
              You: <span className="font-semibold" style={{ color: C.red }}>{refLabel}</span>
            </span>
          </div>
        )}
        {!hasRef && (
          <span className="text-[10px] italic" style={{ color: '#9CA3AF' }}>No data</span>
        )}
      </div>

      {/* Chart */}
      <div className="px-2 pt-2 pb-1" style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 2, right: 4, left: 0, bottom: 12 }} barCategoryGap="8%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 9, fill: '#94A3B8' }}
              tickFormatter={tickFmt}
              tickLine={false}
              axisLine={false}
              label={{ value: xLabel, position: 'insideBottom', offset: -4, style: { fontSize: 9, fill: '#94A3B8' } }}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={false}
              width={28}
              tickFormatter={v => `${Math.round(v)}%`}
            />
            <Tooltip
              cursor={{ fill: `${C.primary}10` }}
              formatter={v => [`${Number(v).toFixed(1)}%`, 'Athletes']}
              labelFormatter={l => `${xLabel}: ${tickFmt(l)}`}
              contentStyle={{ fontSize: 11, borderRadius: 12, border: `1px solid #E5E7EB`, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            />
            <Bar dataKey="y" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            {hasRef && (
              <ReferenceLine
                x={refX}
                stroke={C.red}
                strokeWidth={2}
                strokeDasharray="5 3"
                label={{ value: 'You', position: 'top', fill: C.red, fontSize: 9, fontWeight: 700 }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Box-plot strip: min – p25 – median – p75 – max */}
      {stat && (
        <div className="px-4 pb-3">
          <div className="relative h-5 flex items-center">
            {/* Track */}
            <div className="absolute inset-x-0 h-1 rounded-full" style={{ background: '#E5E7EB' }} />
            {/* IQR box */}
            <div
              className="absolute h-3 rounded"
              style={{
                left: `${((stat.p25 - stat.min) / (stat.max - stat.min)) * 100}%`,
                right: `${100 - ((stat.p75 - stat.min) / (stat.max - stat.min)) * 100}%`,
                background: `${C.primary}30`,
                border: `1px solid ${C.primary}60`,
              }}
            />
            {/* Median tick */}
            <div
              className="absolute w-0.5 h-4 rounded-full"
              style={{
                left: `${((stat.median - stat.min) / (stat.max - stat.min)) * 100}%`,
                background: C.primary,
              }}
            />
            {/* "You" tick */}
            {hasRef && (
              <div
                className="absolute w-0.5 h-5 rounded-full"
                style={{
                  left: `${Math.min(99, Math.max(1, ((refX / scale - stat.min) / (stat.max - stat.min)) * 100))}%`,
                  background: C.red,
                }}
              />
            )}
          </div>
          {/* Labels */}
          <div className="flex justify-between mt-1 text-[9px]" style={{ color: '#94A3B8' }}>
            <span>{xFmt(stat.min * scale)}</span>
            <span style={{ color: C.primary }}>med {xFmt(stat.median * scale)}</span>
            <span>{xFmt(stat.max * scale)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const PopulationInsights = ({ athleteProfile, selectedSport = 'bike' }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gender, setGender] = useState('male');
  const [showTip, setShowTip] = useState(false);

  const sport = selectedSport === 'all' ? 'bike' : selectedSport;

  const load = useCallback(async () => {
    if (!athleteProfile || selectedSport === 'all') return;
    setLoading(true);
    try {
      const res = await api.get('/test/population-stats', { params: { gender, sport } });
      setStats(res.data);
    } catch (e) {
      console.error('Population stats error:', e);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [athleteProfile, gender, sport, selectedSport]);

  useEffect(() => { load(); }, [load]);

  if (selectedSport === 'all') return null;

  // Current athlete values
  const zones = athleteProfile?.powerZones?.[sport === 'bike' ? 'cycling' : 'running'];
  const weight = Number(athleteProfile?.weight || 0);
  const cv = zones?.lt1 && zones?.lt2 ? {
    lt1:     zones.lt1,
    lt2:     zones.lt2,
    ratio:   zones.lt1 / zones.lt2,
    lt1Wkg:  weight > 0 ? zones.lt1 / weight : null,
    lt2Wkg:  weight > 0 ? zones.lt2 / weight : null,
  } : null;

  const sportStats = stats?.[sport];
  const totalN = sportStats
    ? Math.max(sportStats.lt1?.count || 0, sportStats.lt2?.count || 0, sportStats.lt1Lt2Ratio?.count || 0)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap"
           style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: `${C.primary}15` }}>
            <UsersIcon style={{ width: 18, height: 18, color: C.primary }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: C.text }}>
              Population Comparison
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: C.lighter }}>
              {sport === 'bike' ? 'Cycling' : sport === 'run' ? 'Running' : 'Swimming'} ·{' '}
              {loading ? 'loading…' : totalN > 0 ? `${totalN} athletes in database` : 'data loading'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Gender toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: '#E5E7EB' }}>
            {['male', 'female'].map(g => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className="px-3 py-1.5 text-xs font-semibold capitalize transition-all"
                style={gender === g
                  ? { background: C.primary, color: '#fff' }
                  : { background: '#F9FAFB', color: C.lighter }
                }
              >
                {g === 'male' ? '♂ Men' : '♀ Women'}
              </button>
            ))}
          </div>

          {/* Info tip */}
          <button
            onClick={() => setShowTip(v => !v)}
            title="How to read"
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-gray-100"
            style={{ color: showTip ? C.primary : '#9CA3AF' }}
          >
            {showTip
              ? <XMarkIcon style={{ width: 15, height: 15 }} />
              : <InformationCircleIcon style={{ width: 16, height: 16 }} />
            }
          </button>
        </div>
      </div>

      {/* ── How to read tip ───────────────────────────────────────────────── */}
      {showTip && (
        <div className="px-4 py-3 text-xs leading-relaxed" style={{ background: `${C.primary}08`, borderBottom: '1px solid #E5E7EB', color: C.lighter }}>
          <span className="font-semibold" style={{ color: C.text }}>How to read: </span>
          Each bar is a range of values split into 20 buckets. Height = % of athletes in that bucket.
          The <span className="font-semibold" style={{ color: C.red }}>red dashed line</span> is your value.
          The <span className="font-semibold" style={{ color: C.primary }}>box strip</span> below each chart shows min – IQR – max.
          Percentile badge shows where you rank vs this gender group.
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="px-4 py-10 flex items-center justify-center gap-2 text-sm" style={{ color: C.lighter }}>
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
               style={{ borderColor: `${C.primary}30`, borderTopColor: C.primary }} />
          Loading population data…
        </div>
      )}

      {/* ── No data ───────────────────────────────────────────────────────── */}
      {!loading && (!sportStats || totalN === 0) && (
        <div className="px-4 py-10 text-center">
          <ChartBarIcon style={{ width: 32, height: 32, color: '#D1D5DB', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: C.text }}>Not enough data yet</p>
          <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: C.lighter }}>
            Population stats come from athletes who have set their LT1/LT2 zones in their profile.
            More data appears as the community grows.
          </p>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {!loading && sportStats && totalN > 0 && (
        <div className="p-4 space-y-4">

          {/* Missing weight warning */}
          {sport === 'bike' && !weight && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                 style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309' }}>
              <InformationCircleIcon style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
              Add your weight in the profile to see W/kg comparisons and your position on the charts.
            </div>
          )}

          {/* W/kg section — bike only */}
          {sport === 'bike' && (sportStats.lt1Wkg?.count > 0 || sportStats.lt2Wkg?.count > 0) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.lighter }}>
                Relative Power (W/kg)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sportStats.lt1Wkg?.count > 0 && (
                  <HistoCard
                    title="LT1 — Aerobic threshold"
                    subtitle="First lactate threshold · relative to bodyweight"
                    data={histPoints(sportStats.lt1Wkg)}
                    xLabel="W/kg"
                    xFmt={v => v.toFixed(2)}
                    refX={cv?.lt1Wkg ?? null}
                    refLabel={cv?.lt1Wkg ? fmtBike(cv.lt1Wkg, 'wkg') : null}
                    stat={sportStats.lt1Wkg}
                  />
                )}
                {sportStats.lt2Wkg?.count > 0 && (
                  <HistoCard
                    title="LT2 — Anaerobic threshold"
                    subtitle="MLSS / second lactate threshold · relative to bodyweight"
                    data={histPoints(sportStats.lt2Wkg)}
                    xLabel="W/kg"
                    xFmt={v => v.toFixed(2)}
                    refX={cv?.lt2Wkg ?? null}
                    refLabel={cv?.lt2Wkg ? fmtBike(cv.lt2Wkg, 'wkg') : null}
                    stat={sportStats.lt2Wkg}
                  />
                )}
              </div>
            </div>
          )}

          {/* Absolute watts — bike */}
          {sport === 'bike' && (sportStats.lt1?.count > 0 || sportStats.lt2?.count > 0) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.lighter }}>
                Absolute Power (W)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sportStats.lt1?.count > 0 && (
                  <HistoCard
                    title="LT1 — Watts"
                    subtitle="Aerobic threshold · absolute power"
                    data={histPoints(sportStats.lt1)}
                    xLabel="W"
                    xFmt={v => `${Math.round(v)}`}
                    refX={cv?.lt1 ?? null}
                    refLabel={cv?.lt1 ? `${Math.round(cv.lt1)} W` : null}
                    stat={sportStats.lt1}
                  />
                )}
                {sportStats.lt2?.count > 0 && (
                  <HistoCard
                    title="LT2 — Watts"
                    subtitle="Anaerobic threshold · absolute power"
                    data={histPoints(sportStats.lt2)}
                    xLabel="W"
                    xFmt={v => `${Math.round(v)}`}
                    refX={cv?.lt2 ?? null}
                    refLabel={cv?.lt2 ? `${Math.round(cv.lt2)} W` : null}
                    stat={sportStats.lt2}
                  />
                )}
              </div>
            </div>
          )}

          {/* Run pace charts */}
          {sport === 'run' && (sportStats.lt1?.count > 0 || sportStats.lt2?.count > 0) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.lighter }}>
                Pace (min/km)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sportStats.lt1?.count > 0 && (
                  <HistoCard
                    title="LT1 — Aerobic threshold"
                    subtitle="First lactate threshold pace"
                    data={histPoints(sportStats.lt1)}
                    xLabel="sec/km"
                    xFmt={v => fmtPace(v)}
                    refX={cv?.lt1 ?? null}
                    refLabel={cv?.lt1 ? fmtPace(cv.lt1) : null}
                    stat={sportStats.lt1}
                  />
                )}
                {sportStats.lt2?.count > 0 && (
                  <HistoCard
                    title="LT2 — Anaerobic threshold"
                    subtitle="Second lactate threshold pace"
                    data={histPoints(sportStats.lt2)}
                    xLabel="sec/km"
                    xFmt={v => fmtPace(v)}
                    refX={cv?.lt2 ?? null}
                    refLabel={cv?.lt2 ? fmtPace(cv.lt2) : null}
                    stat={sportStats.lt2}
                  />
                )}
              </div>
            </div>
          )}

          {/* LT1/LT2 ratio — both sports */}
          {sportStats.lt1Lt2Ratio?.count > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.lighter }}>
                LT1 / LT2 ratio
              </p>
              <HistoCard
                title="Aerobic / Anaerobic gap"
                subtitle="Lower % = wider gap between thresholds · more endurance capacity relative to threshold"
                data={histPoints(sportStats.lt1Lt2Ratio, 100)}
                xLabel="Ratio (%)"
                xFmt={v => `${v.toFixed(1)}%`}
                refX={cv?.ratio != null ? cv.ratio * 100 : null}
                refLabel={cv?.ratio != null ? `${(cv.ratio * 100).toFixed(1)}%` : null}
                stat={sportStats.lt1Lt2Ratio}
                scale={100}
              />
            </div>
          )}

          {/* Footer */}
          <p className="text-[10px] text-center pt-1" style={{ color: '#9CA3AF' }}>
            Based on {totalN} {gender} {sport === 'bike' ? 'cycling' : 'running'} athletes with zones set in their profile.
          </p>
        </div>
      )}
    </div>
  );
};

export default PopulationInsights;
