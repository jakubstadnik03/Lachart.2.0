/**
 * NativeBenchmarkCard — mobile-optimised Community Benchmark for the native
 * testing page. Same data source as the desktop PopulationInsights
 * (/test/population-stats — real lactate tests, one per athlete per sport)
 * but rendered as compact hand-drawn SVG histograms instead of recharts, to
 * match the native page style and keep the chunk light.
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { GlassCard, SectionTitle } from './shared/Tiles';

const C = {
  primary: '#767EB5',
  red: '#E05347',
  green: '#4BA87D',
  blue: '#599FD0',
  text: '#1D2C4C',
  lighter: '#4A5E82',
  grey: '#9CA3AF',
};

function fmtPace(sec, suffix) {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}${suffix}`;
}

// Empirical percentile via quartile-based piecewise interpolation (same as web)
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

/** rank = share of athletes you beat (pace/ratio invert: lower value = better) */
function rankLabel(rank) {
  if (rank == null) return null;
  if (rank >= 90) return { label: `Top ${Math.max(1, 100 - rank)}%`, color: C.green };
  if (rank >= 70) return { label: `Top ${100 - rank}%`, color: C.blue };
  return { label: `Better than ${rank}%`, color: rank >= 40 ? C.primary : C.lighter };
}

// ─── Compact histogram block ─────────────────────────────────────────────────

function MetricBlock({ title, stat, refVal, fmt, lowerIsBetter = false }) {
  if (!stat || !stat.count) return null;
  const dist = stat.distribution || [];
  const maxBin = Math.max(...dist, 1);
  const span = stat.max - stat.min || 1;
  const hasRef = refVal != null && Number.isFinite(refVal);
  const pct = hasRef ? empiricalPercentile(refVal, stat) : null;
  const rank = pct == null ? null : (lowerIsBetter ? 100 - pct : pct);
  const badge = rankLabel(rank);
  const refX = hasRef
    ? Math.min(99, Math.max(1, ((refVal - stat.min) / span) * 100))
    : null;

  const H = 44;
  const barW = 100 / dist.length;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {hasRef && (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>{fmt(refVal)}</span>
          )}
          {badge && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: badge.color,
              background: `${badge.color}16`, padding: '2px 7px', borderRadius: 999,
            }}>
              {badge.label}
            </span>
          )}
        </span>
      </div>

      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: H, display: 'block' }}
      >
        {dist.map((v, i) => {
          const h = (v / maxBin) * (H - 4);
          return (
            <rect
              key={i}
              x={i * barW + 0.4}
              y={H - h}
              width={barW - 0.8}
              height={Math.max(h, 0.5)}
              rx={0.8}
              fill={C.primary}
              opacity={0.55}
            />
          );
        })}
        {refX != null && (
          <line x1={refX} y1={0} x2={refX} y2={H} stroke={C.red} strokeWidth={1.2} strokeDasharray="3 2" />
        )}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: C.grey }}>
        <span>{fmt(stat.min)}</span>
        <span style={{ color: C.primary, fontWeight: 600 }}>med {fmt(stat.median)}</span>
        <span>{fmt(stat.max)}</span>
      </div>
    </div>
  );
}

// ─── Main card ───────────────────────────────────────────────────────────────

export default function NativeBenchmarkCard({ athleteId, sport, user }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const isSelf = !athleteId || String(athleteId) === String(user?._id || user?.id || '');
  const [gender, setGender] = useState(
    isSelf && ['male', 'female'].includes(user?.gender) ? user.gender : 'all'
  );

  const load = useCallback(async () => {
    if (!athleteId || !['bike', 'run', 'swim'].includes(sport)) return;
    setLoading(true);
    try {
      const res = await api.get('/test/population-stats', {
        params: { gender, sport, athleteId },
      });
      setStats(res.data);
    } catch (e) {
      console.error('Benchmark load error:', e);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [athleteId, sport, gender]);

  useEffect(() => { load(); }, [load]);

  if (!['bike', 'run', 'swim'].includes(sport)) return null;

  const s = stats?.[sport];
  const insufficient = s?.insufficient === true;
  const n = s?.sampleSize
    ?? (s ? Math.max(s.lt1?.count || 0, s.lt2?.count || 0) : 0);
  const av = stats?.athlete;
  const isPaceSport = sport !== 'bike';
  const paceSuffix = sport === 'swim' ? '/100m' : '/km';
  const sportLabel = sport === 'bike' ? 'Cycling' : sport === 'run' ? 'Running' : 'Swimming';

  // Bike prefers W/kg when the population has it; falls back to absolute W.
  const useWkg = sport === 'bike' && s?.lt2Wkg?.count > 0;
  const fmtVal = isPaceSport
    ? (v) => fmtPace(v, paceSuffix)
    : useWkg
      ? (v) => `${Number(v).toFixed(2)} W/kg`
      : (v) => `${Math.round(v)} W`;

  return (
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <SectionTitle>Community Benchmark</SectionTitle>
        {/* Gender segment */}
        <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
          {[['all', 'All'], ['male', '♂'], ['female', '♀']].map(([g, label]) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              style={{
                padding: '4px 10px', fontSize: 10.5, fontWeight: 700, border: 'none',
                background: gender === g ? C.primary : '#F9FAFB',
                color: gender === g ? '#fff' : C.lighter,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.grey, marginBottom: 10 }}>
        {loading
          ? 'Loading…'
          : n > 0
            ? `${sportLabel} · most recent lactate test of ${n} athletes`
            : `${sportLabel} · real lactate tests from the LaChart community`}
      </div>

      {loading && (
        <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 11, color: C.lighter }}>
          Loading community data…
        </div>
      )}

      {!loading && insufficient && (
        <div style={{ padding: '10px 0 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Not enough athletes yet</div>
          <div style={{ fontSize: 10.5, color: C.grey, marginTop: 3 }}>
            {n} {sportLabel.toLowerCase()} athlete{n === 1 ? '' : 's'} so far — benchmarks unlock
            at {stats?.minSampleSize || 10}. Try the "All" filter or check back soon.
          </div>
        </div>
      )}

      {!loading && !insufficient && (!s || n === 0) && (
        <div style={{ padding: '10px 0 4px', textAlign: 'center', fontSize: 11, color: C.grey }}>
          Community data is loading — check back soon.
        </div>
      )}

      {!loading && !insufficient && s && n > 0 && (
        <div>
          <MetricBlock
            title={`LT2 · Anaerobic threshold${useWkg ? ' (W/kg)' : ''}`}
            stat={useWkg ? s.lt2Wkg : s.lt2}
            refVal={useWkg ? av?.lt2Wkg : av?.lt2}
            fmt={fmtVal}
            lowerIsBetter={isPaceSport}
          />
          <MetricBlock
            title={`LT1 · Aerobic threshold${useWkg ? ' (W/kg)' : ''}`}
            stat={useWkg ? s.lt1Wkg : s.lt1}
            refVal={useWkg ? av?.lt1Wkg : av?.lt1}
            fmt={fmtVal}
            lowerIsBetter={isPaceSport}
          />
          <MetricBlock
            title="LT1 / LT2 intensity ratio"
            stat={s.lt1Lt2Ratio}
            refVal={av?.ratio}
            fmt={(v) => `${(v * 100).toFixed(0)}%`}
          />
          {!av && (
            <div style={{ fontSize: 9.5, color: C.grey, textAlign: 'center', marginTop: 2 }}>
              Save a lactate test with 4+ stages to see your position.
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
