/**
 * TimeInZonesBar — compact 5-zone breakdown for a single activity.
 *
 * Renders a horizontal stacked bar + small legend showing what % of the
 * activity was spent in each HR / power zone. Designed for the Summary
 * tab of the activity detail modal — small, readable, no Chart.js.
 *
 * Picks metric automatically:
 *   • bike + power records → power zones (% of FTP-style thresholds from user)
 *   • else → HR zones (% of LT2 HR, falling back to highest sustained HR
 *            in the activity itself when user has no thresholds set up)
 *
 * Records-based seconds-per-zone (not lap averages) so threshold sessions
 * that cross zones show up correctly.
 */

import React, { useMemo } from 'react';

const ZONE_DEFS = [
  { id: 'Z1', label: 'Recovery',  color: '#60a5fa' },
  { id: 'Z2', label: 'Endurance', color: '#34d399' },
  { id: 'Z3', label: 'Tempo',     color: '#fbbf24' },
  { id: 'Z4', label: 'Threshold', color: '#f97316' },
  { id: 'Z5', label: 'VO₂max',    color: '#ef4444' },
];

// HR thresholds expressed as a fraction of LT2 HR (or max HR proxy when no
// LT2). Mirrors a standard 5-zone Coggan-ish split for endurance sports.
const HR_BANDS_OF_LT2 = [0.81, 0.89, 0.96, 1.02]; // Z1<.81, Z2<.89, Z3<.96, Z4<1.02, Z5≥1.02
// Power bands as fraction of FTP (LT2 power).
const POWER_BANDS_OF_FTP = [0.55, 0.75, 0.90, 1.05];

function pickValue(rec, keys) {
  for (const k of keys) {
    const v = rec?.[k];
    if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) return Number(v);
  }
  return null;
}

function recordHr(r) {
  return pickValue(r, ['heartRate', 'heart_rate', 'hr']);
}
function recordPower(r) {
  return pickValue(r, ['power', 'watts']);
}
function recordSec(r, prev) {
  if (!r) return 1;
  // Try delta from previous timestamp; fall back to 1 s (typical sample rate)
  if (prev?.timestamp && r.timestamp) {
    const dt = (new Date(r.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (dt > 0 && dt < 30) return dt; // ignore long gaps (pause / signal loss)
  }
  return 1;
}

// Derive a max-HR estimate when the user has no thresholds. Use the 98th
// percentile of HR samples in the activity itself — robust against a one-
// sample spike but still pinned to "this athlete's actual range".
function estimateMaxHr(records) {
  const vals = records.map(recordHr).filter(v => v != null);
  if (vals.length < 30) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.98)];
}

function zoneIndexFromBands(value, bands) {
  for (let i = 0; i < bands.length; i++) {
    if (value < bands[i]) return i;
  }
  return bands.length; // last zone
}

export default function TimeInZonesBar({ records, sport, authUser }) {
  const result = useMemo(() => {
    if (!Array.isArray(records) || records.length < 10) return null;

    const isBike = String(sport || '').toLowerCase().includes('bike') ||
                   String(sport || '').toLowerCase().includes('ride');

    // Prefer power for bike, HR for everything else
    let metric = 'hr';
    if (isBike) {
      const hasPower = records.some(r => recordPower(r) != null);
      if (hasPower) metric = 'power';
    }

    // Pull reference thresholds from the user profile when available
    const ftp = Number(authUser?.ftp || authUser?.cyclingFtp || 0);
    const lt2Hr = Number(
      authUser?.cyclingLt2Hr || authUser?.runningLt2Hr ||
      authUser?.thresholds?.cyclingLt2Hr || authUser?.thresholds?.runningLt2Hr || 0
    );

    let bands, reference;
    if (metric === 'power') {
      if (!(ftp > 0)) return null; // need FTP to break into zones
      bands = POWER_BANDS_OF_FTP.map(b => b * ftp);
      reference = ftp;
    } else {
      const refHr = lt2Hr > 0 ? lt2Hr : estimateMaxHr(records);
      if (!(refHr > 0)) return null;
      // When using max-HR proxy (no LT2 set), shift bands lower so max-HR
      // proxy ≈ LT2 + 5% gives a sensible split.
      const factor = lt2Hr > 0 ? 1 : 0.92; // 92% of estimated max ≈ LT2
      bands = HR_BANDS_OF_LT2.map(b => b * refHr * factor);
      reference = refHr;
    }

    // Bin seconds into zones
    const zoneSecs = new Array(5).fill(0);
    let prev = null;
    for (const r of records) {
      const dt = recordSec(r, prev);
      prev = r;
      const v = metric === 'power' ? recordPower(r) : recordHr(r);
      if (v == null) continue;
      const idx = Math.min(4, zoneIndexFromBands(v, bands));
      zoneSecs[idx] += dt;
    }
    const totalSec = zoneSecs.reduce((a, b) => a + b, 0);
    if (totalSec < 30) return null;

    return {
      metric,                 // 'hr' | 'power'
      reference,              // FTP or LT2 HR (or estimated)
      derivedFromActivity: metric === 'hr' && !(lt2Hr > 0),
      zoneSecs,
      totalSec,
    };
  }, [records, sport, authUser]);

  if (!result) return null;

  const { metric, reference, derivedFromActivity, zoneSecs, totalSec } = result;
  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  return (
    <div className="px-4 py-3 border-b border-gray-50">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Time in Zones</div>
        <div className="text-[9px] font-semibold text-gray-400 tabular-nums">
          {metric === 'power' ? 'FTP' : 'LT2 HR'} {Math.round(reference)}{metric === 'power' ? ' W' : ' bpm'}
          {derivedFromActivity && <span className="text-amber-500 ml-1">· est.</span>}
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex w-full h-6 rounded-md overflow-hidden bg-gray-100">
        {zoneSecs.map((sec, i) => {
          const pct = (sec / totalSec) * 100;
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
          const pct = (sec / totalSec) * 100;
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
    </div>
  );
}
