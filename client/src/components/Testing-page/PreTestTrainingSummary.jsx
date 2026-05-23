import React, { useState, useEffect, useRef } from 'react';
import { getMonthlyPowerAnalysis } from '../../services/api';

const ZONE_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F97316', '#F43F5E'];

function fmtDur(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function monthKeysBefore(testDate, count = 2) {
  const d = testDate ? new Date(testDate) : new Date();
  const keys = [];
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const mo = d.getMonth() - i; // may go negative — Date handles it
    const ref = new Date(y, mo, 1);
    keys.push(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function pickZoneTimes(month, sport) {
  if (!month) return null;
  const src =
    sport === 'bike' ? (month.zones || month.bikeHrZones) :
    sport === 'run'  ? (month.runningHrZones || month.runningZoneTimes) :
    sport === 'swim' ? month.swimmingZoneTimes :
    month.hrZones;
  if (!src) return null;
  const out = {};
  for (let z = 1; z <= 5; z++) {
    const b = src[z] ?? src[String(z)];
    out[`z${z}`] = Number(b?.time) || 0;
  }
  return out;
}

function sportTime(month, sport) {
  if (!month) return 0;
  if (sport === 'bike') return Number(month.bikeTime) || 0;
  if (sport === 'run')  return Number(month.runningTime) || 0;
  if (sport === 'swim') return Number(month.swimmingTime) || 0;
  return (Number(month.bikeTime) || 0) + (Number(month.runningTime) || 0) + (Number(month.swimmingTime) || 0);
}

function sportSessions(month, sport) {
  if (!month) return 0;
  if (sport === 'bike') return Number(month.bikeTrainings) || 0;
  if (sport === 'run')  return Number(month.runningTrainings) || 0;
  if (sport === 'swim') return Number(month.swimmingTrainings) || 0;
  return (
    (Number(month.bikeTrainings) || 0) +
    (Number(month.runningTrainings) || 0) +
    (Number(month.swimmingTrainings) || 0)
  );
}

/**
 * PreTestTrainingSummary — shows 4–8 weeks of training context before a test.
 *
 * Props:
 *   athleteId  — athlete's user ID (or null for the logged-in user)
 *   testDate   — ISO date string of the test; determines which months to show
 *   sport      — 'bike' | 'run' | 'swim' (from the test)
 *   onData     — optional callback: called with the summary object once loaded
 *                (used by the parent to include it in the PDF export)
 */
export default function PreTestTrainingSummary({ athleteId = null, testDate = null, sport = 'bike', onData }) {
  const [monthsData, setMonthsData]     = useState({});
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const fetchedKeys = useRef(new Set());

  const monthKeys = monthKeysBefore(testDate, 2); // current + previous month

  useEffect(() => {
    const missing = monthKeys.filter(k => !fetchedKeys.current.has(k));
    if (missing.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(missing.map(k =>
      getMonthlyPowerAnalysis(athleteId || null, k).catch(() => null)
    )).then(results => {
      if (cancelled) return;
      setMonthsData(prev => {
        const next = { ...prev };
        missing.forEach((k, i) => {
          fetchedKeys.current.add(k);
          const raw   = results[i];
          const entry = Array.isArray(raw) ? raw.find(m => m.monthKey === k) : raw;
          next[k] = entry || null;
        });
        return next;
      });
    }).catch(() => {
      if (!cancelled) setError('Could not load training data.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, testDate, sport]);

  // Aggregate across both months
  const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let totalTime = 0;
  let totalSessions = 0;

  for (const k of monthKeys) {
    const m = monthsData[k];
    if (!m) continue;
    totalTime     += sportTime(m, sport);
    totalSessions += sportSessions(m, sport);
    const zt = pickZoneTimes(m, sport);
    if (zt) {
      for (let z = 1; z <= 5; z++) totals[`z${z}`] += zt[`z${z}`] || 0;
    }
  }

  const totalZoneSecs = Object.values(totals).reduce((s, v) => s + v, 0);
  const hasZones      = totalZoneSecs > 0;
  const hasAny        = totalTime > 0 || totalSessions > 0 || hasZones;

  // Fire onData once we have results
  useEffect(() => {
    if (loading || !onData) return;
    onData({
      months:        monthKeys,
      totalTime,
      totalSessions,
      zones:         { ...totals },
      totalZoneSecs,
    });
    // We intentionally do not list totals/monthKeys as deps to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, monthsData]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 animate-pulse">
        <div className="h-3 w-40 bg-gray-200 rounded mb-3" />
        <div className="flex gap-2">
          {[1,2,3,4].map(i => <div key={i} className="h-8 flex-1 bg-gray-200 rounded" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-500">
        {error}
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-400 text-center">
        No training data found for the 8 weeks before this test.
      </div>
    );
  }

  const maxZone = Math.max(...Object.values(totals), 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Pre-test training · 8 weeks
      </p>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex flex-col items-center bg-blue-50 rounded-lg px-3 py-2 min-w-[72px]">
          <span className="text-base font-bold text-blue-700">{fmtDur(totalTime)}</span>
          <span className="text-[10px] text-blue-500 mt-0.5">Total time</span>
        </div>
        <div className="flex flex-col items-center bg-green-50 rounded-lg px-3 py-2 min-w-[72px]">
          <span className="text-base font-bold text-green-700">{totalSessions}</span>
          <span className="text-[10px] text-green-500 mt-0.5">Sessions</span>
        </div>
        {hasZones && (
          <div className="flex flex-col items-center bg-amber-50 rounded-lg px-3 py-2 min-w-[72px]">
            <span className="text-base font-bold text-amber-700">
              {Math.round((totals.z1 + totals.z2) / totalZoneSecs * 100)}%
            </span>
            <span className="text-[10px] text-amber-600 mt-0.5">Z1+Z2 share</span>
          </div>
        )}
        {hasZones && (
          <div className="flex flex-col items-center bg-red-50 rounded-lg px-3 py-2 min-w-[72px]">
            <span className="text-base font-bold text-red-700">
              {Math.round((totals.z4 + totals.z5) / totalZoneSecs * 100)}%
            </span>
            <span className="text-[10px] text-red-500 mt-0.5">High intensity</span>
          </div>
        )}
      </div>

      {/* Zone distribution bars */}
      {hasZones && (
        <div className="space-y-1.5">
          {[1,2,3,4,5].map(z => {
            const key  = `z${z}`;
            const secs = totals[key];
            const pct  = Math.round(secs / totalZoneSecs * 100);
            const barW = Math.round(secs / maxZone * 100);
            return (
              <div key={z} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-gray-500 w-6 shrink-0">Z{z}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barW}%`, backgroundColor: ZONE_COLORS[z - 1] }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">{pct}%</span>
                <span className="text-[10px] text-gray-300 w-10 text-right shrink-0 hidden sm:block">
                  {fmtDur(secs)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Build a plain object suitable for including in the PDF.
 * Call this after the onData callback fires.
 */
export function buildPreTestSummaryForPdf(summary) {
  if (!summary) return null;
  const { totalTime, totalSessions, zones, totalZoneSecs } = summary;
  if (!totalTime && !totalSessions) return null;

  const zonePcts = {};
  const zoneDurs = {};
  for (let z = 1; z <= 5; z++) {
    const secs = zones?.[`z${z}`] || 0;
    zonePcts[`z${z}`] = totalZoneSecs > 0 ? Math.round(secs / totalZoneSecs * 100) : 0;
    zoneDurs[`z${z}`] = secs;
  }

  return {
    totalTimeSecs:  totalTime,
    totalSessions,
    totalZoneSecs,
    zonePcts,
    zoneDurs,
    aerobicPct:     (zonePcts.z1 || 0) + (zonePcts.z2 || 0),
    highIntensityPct: (zonePcts.z4 || 0) + (zonePcts.z5 || 0),
  };
}
