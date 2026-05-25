/**
 * WorkoutStatsPanel
 * ─────────────────
 * Live statistics view shown as the "Stats" swipe page during workout
 * execution. Computes all metrics from the 1Hz samples buffer.
 *
 * Metrics:
 *   • Time, Distance
 *   • Avg Power, Normalized Power, Intensity Factor
 *   • Avg HR, Avg Cadence, Avg Speed
 *   • Power zone distribution (stacked colour bar + legend)
 *   • HR zone distribution
 */
import React, { useMemo } from 'react';

// ─── Zone definitions ────────────────────────────────────────────────────────

export const POWER_ZONE_DEFS = [
  { id: 'Z1', label: 'Recovery',  color: '#60a5fa' },
  { id: 'Z2', label: 'Endurance', color: '#34d399' },
  { id: 'Z3', label: 'Tempo',     color: '#fbbf24' },
  { id: 'Z4', label: 'Threshold', color: '#f97316' },
  { id: 'Z5', label: 'VO₂max',   color: '#ef4444' },
  { id: 'Z6', label: 'Anaerobic', color: '#a78bfa' },
];

export const HR_ZONE_DEFS = [
  { id: 'Z1', label: 'Recovery',  color: '#60a5fa' },
  { id: 'Z2', label: 'Aerobic',   color: '#34d399' },
  { id: 'Z3', label: 'Tempo',     color: '#fbbf24' },
  { id: 'Z4', label: 'Threshold', color: '#f97316' },
  { id: 'Z5', label: 'VO₂max',   color: '#ef4444' },
];

// ─── Zone helpers (exported so WorkoutExecutionPage can use them too) ─────────

/** Returns 0-based zone index for live power watts (0 = Z1, 5 = Z6). */
export function getPowerZoneIdx(watts, context) {
  if (watts == null || watts <= 0) return -1;
  const { cyclingZones, ftp = 250 } = context || {};
  if (cyclingZones) {
    for (let z = 1; z <= 6; z++) {
      const zone = cyclingZones[`zone${z}`];
      if (!zone) continue;
      const min = zone.min ?? 0;
      const max = zone.max != null && isFinite(zone.max) ? zone.max : Infinity;
      if (watts >= min && watts < max) return z - 1;
    }
  }
  // Classic FTP-based 6-zone model fallback
  const f = ftp;
  if (watts < f * 0.55) return 0;
  if (watts < f * 0.75) return 1;
  if (watts < f * 0.90) return 2;
  if (watts < f * 1.05) return 3;
  if (watts < f * 1.20) return 4;
  return 5;
}

/** Returns 0-based zone index for live HR bpm (0 = Z1, 4 = Z5). */
export function getHrZoneIdx(bpm, context) {
  if (bpm == null || bpm <= 0) return -1;
  const { cyclingHrZones, maxHrCycling } = context || {};
  if (cyclingHrZones) {
    for (let z = 1; z <= 5; z++) {
      const zone = cyclingHrZones[`zone${z}`];
      if (!zone) continue;
      const min = zone.min ?? 0;
      const max = zone.max != null && isFinite(zone.max) ? zone.max : Infinity;
      if (bpm >= min && bpm < max) return z - 1;
    }
  }
  const maxHR = maxHrCycling || 190;
  const pct = bpm / maxHR;
  if (pct < 0.60) return 0;
  if (pct < 0.70) return 1;
  if (pct < 0.80) return 2;
  if (pct < 0.90) return 3;
  return 4;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSecs(s) {
  if (!s && s !== 0) return '--:--';
  const abs = Math.round(Math.abs(s));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const ss = abs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, unit, color }) {
  return (
    <div className="bg-white/[0.05] rounded-xl px-3 py-2.5 border border-white/10">
      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>
          {value}
        </span>
        {unit && <span className="text-xs text-gray-500 font-semibold">{unit}</span>}
      </div>
    </div>
  );
}

function ZoneBar({ label, zoneDefs, counts, total }) {
  if (!total) return null;
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/10 p-3 space-y-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      {/* Stacked colour bar */}
      <div className="flex h-3.5 rounded-full overflow-hidden gap-px">
        {zoneDefs.map((z, i) => {
          const pct = (counts[i] / total) * 100;
          if (pct < 0.3) return null;
          return (
            <div
              key={z.id}
              style={{ width: `${pct}%`, background: z.color, minWidth: 2 }}
              title={`${z.label}: ${fmtSecs(counts[i])} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      {/* Legend — only show zones with ≥1 % */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {zoneDefs.map((z, i) => {
          const pct = (counts[i] / total) * 100;
          if (pct < 1) return null;
          return (
            <div key={z.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: z.color }} />
              <span className="text-[10px] text-gray-400">
                {z.id}{' '}
                <span className="font-bold tabular-nums" style={{ color: z.color }}>
                  {fmtSecs(counts[i])}
                </span>
                <span className="text-gray-600 ml-0.5">({pct.toFixed(0)}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function WorkoutStatsPanel({ samplesRef, context, totalElapsed, tick }) {
  const stats = useMemo(() => {
    const samples = samplesRef?.current || [];
    if (!samples.length) return null;

    const validPower    = samples.filter(s => s.power    != null && s.power    > 0);
    const validHr       = samples.filter(s => s.hr       != null && s.hr       > 0);
    const validCadence  = samples.filter(s => s.cadence  != null && s.cadence  > 0);
    const validSpeed    = samples.filter(s => s.speed    != null && s.speed    > 0);

    const sum = (arr, key) => arr.reduce((a, s) => a + s[key], 0);

    const avgPower   = validPower.length   ? Math.round(sum(validPower,   'power')   / validPower.length)   : null;
    const avgHr      = validHr.length      ? Math.round(sum(validHr,      'hr')      / validHr.length)      : null;
    const avgCadence = validCadence.length ? Math.round(sum(validCadence, 'cadence') / validCadence.length) : null;
    const avgSpeedKmh = validSpeed.length  ? sum(validSpeed, 'speed') / validSpeed.length                  : null;

    // Distance (km): speed km/h × 1 s × (1/3600 h/s)
    const distanceKm = validSpeed.reduce((acc, s) => acc + s.speed / 3600, 0);

    // Normalized Power (30 s rolling mean^4 → mean → ^0.25)
    let np = null;
    if (validPower.length >= 30) {
      const powerArr = samples.map(s => s.power ?? 0);
      const rolling = [];
      for (let i = 29; i < powerArr.length; i++) {
        let windowSum = 0;
        for (let j = i - 29; j <= i; j++) windowSum += powerArr[j];
        rolling.push(windowSum / 30);
      }
      const mean4 = rolling.reduce((a, v) => a + Math.pow(v, 4), 0) / rolling.length;
      np = Math.round(Math.pow(mean4, 0.25));
    }

    const ftp = context?.ftp || 250;
    const IF  = np ? (np / ftp).toFixed(2) : null;
    const TSS = (np && totalElapsed)
      ? Math.round((totalElapsed / 3600) * (np / ftp) ** 2 * 100)
      : null;

    // Power zone distribution (seconds per zone)
    const powerZoneCounts = new Array(POWER_ZONE_DEFS.length).fill(0);
    validPower.forEach(s => {
      const zi = getPowerZoneIdx(s.power, context);
      if (zi >= 0 && zi < POWER_ZONE_DEFS.length) powerZoneCounts[zi]++;
    });

    // HR zone distribution
    const hrZoneCounts = new Array(HR_ZONE_DEFS.length).fill(0);
    validHr.forEach(s => {
      const zi = getHrZoneIdx(s.hr, context);
      if (zi >= 0 && zi < HR_ZONE_DEFS.length) hrZoneCounts[zi]++;
    });

    return {
      avgPower, avgHr, avgCadence, avgSpeedKmh, distanceKm,
      np, IF, TSS,
      powerZoneCounts, totalPowerSamples: validPower.length,
      hrZoneCounts,    totalHrSamples:    validHr.length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, context]);

  if (!stats) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
        <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" /><path d="m7 16 4-8 4 4 4-6" />
        </svg>
        <p className="text-sm">Start recording to see statistics</p>
      </div>
    );
  }

  const {
    avgPower, avgHr, avgCadence, avgSpeedKmh, distanceKm,
    np, IF, TSS,
    powerZoneCounts, totalPowerSamples,
    hrZoneCounts, totalHrSamples,
  } = stats;

  const distDisplay = distanceKm >= 1
    ? { val: distanceKm.toFixed(2), unit: 'km' }
    : { val: Math.round(distanceKm * 1000).toString(), unit: 'm' };

  return (
    <div
      className="h-full overflow-y-auto px-3 py-3 space-y-2.5"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* ── Key metrics grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Time"        value={fmtSecs(totalElapsed)} unit=""     color="#a78bfa" />
        <StatCard label="Distance"    value={distDisplay.val}       unit={distDisplay.unit} color="#34d399" />
        <StatCard label="Avg Power"   value={avgPower  ?? '—'}      unit={avgPower  ? 'W'   : ''} color="#a78bfa" />
        <StatCard label="Norm Power"  value={np        ?? '—'}      unit={np        ? 'W'   : ''} color="#fbbf24" />
        <StatCard label="Avg HR"      value={avgHr     ?? '—'}      unit={avgHr     ? 'bpm' : ''} color="#fb7185" />
        <StatCard label="Avg Cadence" value={avgCadence ?? '—'}     unit={avgCadence ? 'rpm' : ''} color="#38bdf8" />
        {avgSpeedKmh != null && (
          <StatCard label="Avg Speed" value={avgSpeedKmh.toFixed(1)} unit="km/h" color="#34d399" />
        )}
        {IF && (
          <StatCard label="Int. Factor" value={IF}  unit="IF"  color="#f97316" />
        )}
        {TSS != null && (
          <StatCard label="TSS (est.)" value={TSS} unit="pts" color="#e879f9" />
        )}
      </div>

      {/* ── Power zone distribution ──────────────────────────────── */}
      <ZoneBar
        label="Power Zones"
        zoneDefs={POWER_ZONE_DEFS}
        counts={powerZoneCounts}
        total={totalPowerSamples}
      />

      {/* ── HR zone distribution ─────────────────────────────────── */}
      <ZoneBar
        label="HR Zones"
        zoneDefs={HR_ZONE_DEFS}
        counts={hrZoneCounts}
        total={totalHrSamples}
      />
    </div>
  );
}
