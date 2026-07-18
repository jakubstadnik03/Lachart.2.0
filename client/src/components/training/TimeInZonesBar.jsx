/**
 * TimeInZonesBar — compact 5-zone breakdown for a single activity.
 *
 * Reads the user's *configured* zones from their profile (powerZones,
 * heartRateZones, paceZones / runningZones, …) when they exist, so the
 * breakdown matches what Coach setup in Settings rather than a generic
 * % of FTP / LT2 split. Falls back to band-based splits when the user
 * has nothing configured for the sport.
 *
 * Metric picker: Power / HR / Pace. The default tries Power for bike,
 * HR for run/swim, but the user can toggle to any metric for which the
 * activity has data AND the profile has zones (or a sensible fallback).
 */

import React, { useMemo, useState, useEffect } from 'react';

const ZONE_DEFS = [
  { id: 'Z1', label: 'Recovery',  color: '#60a5fa' },
  { id: 'Z2', label: 'Endurance', color: '#34d399' },
  { id: 'Z3', label: 'Tempo',     color: '#fbbf24' },
  { id: 'Z4', label: 'Threshold', color: '#f97316' },
  { id: 'Z5', label: 'VO₂max',    color: '#ef4444' },
];

// Fallback bands when the user hasn't configured zones yet.
const HR_BANDS_OF_LT2    = [0.81, 0.89, 0.96, 1.02];
const POWER_BANDS_OF_FTP = [0.55, 0.75, 0.90, 1.05];
// Pace bands as fraction of LT2 pace (sec/km). Faster = lower seconds, so
// the bands are < 1.0 for "harder than LT2" and > 1.0 for "easier".
const PACE_BANDS_OF_LT2  = [1.30, 1.15, 1.05, 0.97]; // Z1>1.30, Z2>1.15, …

// ── Record getters ─────────────────────────────────────────────────────────
function pickValue(rec, keys) {
  for (const k of keys) {
    const v = rec?.[k];
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function recordHr(r)    { return pickValue(r, ['heartRate', 'heart_rate', 'hr']); }
function recordPower(r) { return pickValue(r, ['power', 'watts']); }
function recordSpeed(r) { return pickValue(r, ['speed', 'velocity', 'enhancedSpeed']); }
function recordSec(r, prev) {
  if (!r) return 1;
  if (prev?.timestamp && r.timestamp) {
    const dt = (new Date(r.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (dt > 0 && dt < 30) return dt;
  }
  return 1;
}

// ── Sport normalisation ────────────────────────────────────────────────────
function sportKey(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycl') || s.includes('virtual')) return 'cycling';
  if (s.includes('swim')) return 'swimming';
  return 'running'; // includes run, walk, hike, trail
}

// Read configured zones for a given sport + metric. Returns an array of
// numbers — the 4 upper bounds dividing 5 zones — or null when zones aren't
// configured for that combo.
function readUserZones(authUser, sport, metric) {
  if (!authUser) return null;
  const key = sportKey(sport);
  const root = metric === 'power' ? authUser.powerZones
             : metric === 'hr'    ? authUser.heartRateZones
             :                      (authUser.paceZones || authUser.powerZones); // pace stored on powerZones for run/swim
  const z = root?.[key];
  if (!z) return null;
  const bands = [];
  for (let i = 1; i <= 4; i++) {
    const zone = z[`zone${i}`];
    if (!zone) return null;
    // For pace zones the user typically stores `max` as the upper bound
    // (slower threshold). For power/HR `max` is the upper-watts bound.
    const max = Number(zone.max);
    if (!Number.isFinite(max)) return null;
    bands.push(max);
  }
  return bands;
}

// Read the reference threshold (LT2 / FTP) the user has configured. Used in
// the header and in the band-fallback path.
function readUserReference(authUser, sport, metric) {
  if (!authUser) return null;
  const key = sportKey(sport);
  if (metric === 'power') {
    const lt2 = Number(authUser?.powerZones?.[key]?.lt2);
    return Number.isFinite(lt2) && lt2 > 0 ? lt2 : null;
  }
  if (metric === 'hr') {
    const lt2 = Number(
      authUser?.heartRateZones?.[key]?.lt2 ??
      authUser?.heartRateZones?.[key]?.lt2Hr ??
      authUser?.powerZones?.[key]?.lt2Hr
    );
    return Number.isFinite(lt2) && lt2 > 0 ? lt2 : null;
  }
  // pace stored as LT2 sec/km on the same powerZones object for run/swim
  const lt2 = Number(authUser?.powerZones?.[key]?.lt2);
  return Number.isFinite(lt2) && lt2 > 0 ? lt2 : null;
}

function estimateMaxHr(records) {
  const vals = records.map(recordHr).filter(v => v != null);
  if (vals.length < 30) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.98)];
}

// 0-based zone index, where bands has 4 thresholds → 5 zones. For pace mode
// the comparison is inverted (lower seconds = harder = higher zone).
function zoneIndex(value, bands, invert) {
  if (invert) {
    // Faster (lower seconds) wins higher zone
    for (let i = bands.length - 1; i >= 0; i--) {
      if (value <= bands[i]) return i + 1 > 4 ? 4 : (4 - i);
    }
    return 0;
  }
  for (let i = 0; i < bands.length; i++) {
    if (value < bands[i]) return i;
  }
  return bands.length;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TimeInZonesBar({ records, sport, authUser }) {
  // Detect which metrics are usable in this activity
  const available = useMemo(() => {
    if (!Array.isArray(records) || records.length < 10) return [];
    const flags = { power: false, hr: false, pace: false };
    for (const r of records) {
      if (!flags.power && recordPower(r) != null) flags.power = true;
      if (!flags.hr    && recordHr(r)    != null) flags.hr = true;
      if (!flags.pace  && recordSpeed(r) != null) flags.pace = true;
      if (flags.power && flags.hr && flags.pace) break;
    }
    const isBike = sportKey(sport) === 'cycling';
    // Order: most relevant first per sport
    const order = isBike ? ['power', 'hr', 'pace'] : ['pace', 'hr', 'power'];
    return order.filter(m => flags[m]);
  }, [records, sport]);

  const defaultMetric = available[0] || 'hr';
  const [metric, setMetric] = useState(defaultMetric);

  // Reset metric if the activity changes and the current pick isn't available
  useEffect(() => {
    if (!available.includes(metric) && available.length > 0) {
      setMetric(available[0]);
    }
  }, [available, metric]);

  const result = useMemo(() => {
    if (!Array.isArray(records) || records.length < 10) return null;

    // Prefer user-configured zones; fall back to band-derived from LT2.
    let bands = readUserZones(authUser, sport, metric);
    let reference = readUserReference(authUser, sport, metric);
    let usedProfileZones = !!bands;

    if (!bands) {
      // Band fallback path
      if (metric === 'power') {
        if (!(reference > 0)) return null;
        bands = POWER_BANDS_OF_FTP.map(b => b * reference);
      } else if (metric === 'hr') {
        const ref = reference > 0 ? reference : estimateMaxHr(records);
        if (!(ref > 0)) return null;
        const factor = reference > 0 ? 1 : 0.92;
        bands = HR_BANDS_OF_LT2.map(b => b * ref * factor);
        reference = ref;
      } else if (metric === 'pace') {
        if (!(reference > 0)) return null;
        bands = PACE_BANDS_OF_LT2.map(b => b * reference);
      }
    }
    if (!bands) return null;

    const invert = metric === 'pace';
    const isSwim = sportKey(sport) === 'swimming';
    const getSpeedAsPace = (r) => {
      const speed = recordSpeed(r); // m/s
      if (speed == null) return null;
      // Swim → sec/100m. Run → sec/km.
      return isSwim ? 100 / speed : 1000 / speed;
    };

    const zoneSecs = new Array(5).fill(0);
    let prev = null;
    for (const r of records) {
      const dt = recordSec(r, prev);
      prev = r;
      const v = metric === 'power' ? recordPower(r)
              : metric === 'hr'    ? recordHr(r)
              :                      getSpeedAsPace(r);
      if (v == null) continue;
      const idx = Math.min(4, Math.max(0, zoneIndex(v, bands, invert)));
      zoneSecs[idx] += dt;
    }
    const totalSec = zoneSecs.reduce((a, b) => a + b, 0);
    if (totalSec < 30) return null;

    return {
      metric,
      reference,
      usedProfileZones,
      zoneSecs,
      totalSec,
    };
  }, [records, sport, authUser, metric]);

  if (!result) {
    // Render nothing if no metric works, BUT keep the toggle visible when at
    // least one metric is computable so the user can flip to it.
    if (available.length === 0) return null;
  }

  const { reference, usedProfileZones, zoneSecs = [], totalSec = 0 } = result || {};

  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const fmtPace = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const refLabel = (() => {
    if (!reference) return null;
    if (metric === 'power') return `FTP ${Math.round(reference)} W`;
    if (metric === 'hr')    return `LT2 HR ${Math.round(reference)} bpm`;
    const unit = sportKey(sport) === 'swimming' ? '/100m' : '/km';
    return `LT2 ${fmtPace(reference)}${unit}`;
  })();

  const METRIC_LABELS = { power: 'Power', hr: 'HR', pace: 'Pace' };

  return (
    <div className="px-4 py-3 border-b border-gray-50">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Time in Zones</div>
        <div className="flex items-center gap-2">
          {refLabel && (
            <div className="text-[9px] font-semibold text-gray-400 tabular-nums">
              {refLabel}
              {!usedProfileZones && <span className="text-amber-500 ml-1">· est.</span>}
            </div>
          )}
          {/* Metric toggle — only renders when ≥2 metrics are computable. */}
          {available.length > 1 && (
            <div className="inline-flex p-0.5 rounded-md bg-gray-100">
              {available.map(m => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded transition-colors ${metric === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!result ? (
        <div className="text-[10px] text-gray-400 italic py-2">
          No {METRIC_LABELS[metric].toLowerCase()} zones configured — set them in Profile to see the breakdown.
        </div>
      ) : (
      <>
      {/* Stacked bar */}
      <div className="flex w-full h-6 rounded-md overflow-hidden bg-gray-100">
        {zoneSecs.map((sec, i) => {
          const pct = totalSec > 0 ? (sec / totalSec) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={i}
              title={`${ZONE_DEFS[i].id} · ${ZONE_DEFS[i].label} · ${fmtTime(sec)} (${pct.toFixed(0)}%)`}
              style={{
                width: `${pct}%`,
                backgroundColor: ZONE_DEFS[i].color,
                transition: 'width .4s cubic-bezier(.22,1,.36,1)',
              }}
              className="h-full flex items-center justify-center"
            >
              {pct >= 10 && (
                <span className="text-[9px] font-bold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,.25)' }}>
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-1 mt-2">
        {ZONE_DEFS.map((z, i) => {
          const sec = zoneSecs[i];
          const pct = totalSec > 0 ? (sec / totalSec) * 100 : 0;
          return (
            <div key={z.id} className="flex flex-col items-center text-center">
              <div className="flex items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: z.color }} />
                <span className="text-[9px] font-bold text-gray-500 tabular-nums">{z.id}</span>
              </div>
              <span className="text-[9.5px] font-semibold text-gray-700 tabular-nums leading-tight mt-0.5">
                {sec > 0 ? fmtTime(sec) : '—'}
              </span>
              <span className="text-[8.5px] text-gray-400 tabular-nums">
                {sec > 0 ? `${pct.toFixed(0)}%` : ''}
              </span>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
