import React, { useState, useEffect, useRef } from 'react';
import { getMonthlyPowerAnalysis } from '../../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F97316', '#F43F5E'];

const ZONE_META = [
  { name: 'Recovery',  short: 'Z1', desc: 'Very easy — active recovery, fat oxidation' },
  { name: 'Aerobic',   short: 'Z2', desc: 'Base endurance — builds aerobic engine' },
  { name: 'Tempo',     short: 'Z3', desc: 'Moderate — improves aerobic threshold' },
  { name: 'Threshold', short: 'Z4', desc: 'Hard — raises lactate threshold directly' },
  { name: 'VO₂max',   short: 'Z5', desc: 'Max effort — increases VO₂max capacity' },
];

const SPORT_LABELS = { bike: 'Cycling', run: 'Running', swim: 'Swimming' };
const SPORT_COLORS = { bike: 'text-blue-600', run: 'text-orange-500', swim: 'text-cyan-600' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDur(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Returns month keys ending with the month that contains testDate (3 ≈ 8+ weeks). */
function monthKeysBefore(testDate, count = 3) {
  const d = testDate ? new Date(testDate) : new Date();
  const keys = [];
  for (let i = 0; i < count; i++) {
    const ref = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Pick zone times for a sport from a monthly data object.
 * Priority: primary metric per sport (power > HR for bike, pace > HR for run/swim)
 */
function pickZoneTimes(month, sport) {
  if (!month) return null;

  // Primary sources (most meaningful per sport)
  const primarySrc =
    sport === 'bike' ? month.zones :                // power zones
    sport === 'run'  ? month.runningZoneTimes :     // pace zones
    sport === 'swim' ? month.swimmingZoneTimes :    // pace zones (100m)
    null;

  // HR fallback sources
  const hrSrc =
    sport === 'bike' ? (month.bikeHrZones || month.hrZones) :
    sport === 'run'  ? (month.runningHrZones || month.hrZones) :
    sport === 'swim' ? (month.hrZones) :
    month.hrZones;

  const readZones = (src) => {
    if (!src) return null;
    const out = {};
    for (let z = 1; z <= 5; z++) {
      const b = src[z] ?? src[String(z)];
      out[`z${z}`] = Number(b?.time) || 0;
    }
    return Object.values(out).some(v => v > 0) ? out : null;
  };

  return readZones(primarySrc) || readZones(hrSrc);
}

/** Aggregate time + sessions + zone times for one sport across months. */
function aggregateSport(months, sport) {
  let totalTime = 0, totalSessions = 0;
  const zoneTotals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  for (const m of months) {
    if (!m) continue;
    totalTime += Number(
      sport === 'bike' ? m.bikeTime :
      sport === 'run'  ? m.runningTime :
      sport === 'swim' ? m.swimmingTime : 0
    ) || 0;
    totalSessions += Number(
      sport === 'bike' ? m.bikeTrainings :
      sport === 'run'  ? m.runningTrainings :
      sport === 'swim' ? m.swimmingTrainings : 0
    ) || 0;
    const zt = pickZoneTimes(m, sport);
    if (zt) {
      for (let z = 1; z <= 5; z++) zoneTotals[`z${z}`] += zt[`z${z}`] || 0;
    }
  }

  const totalZoneSecs = Object.values(zoneTotals).reduce((s, v) => s + v, 0);
  const pcts = {};
  for (let z = 1; z <= 5; z++) {
    pcts[`z${z}`] = totalZoneSecs > 0 ? (zoneTotals[`z${z}`] / totalZoneSecs) * 100 : 0;
  }

  return { totalTime, totalSessions, zoneTotals, totalZoneSecs, pcts, hasZones: totalZoneSecs > 0 };
}

/** Classify training distribution. */
function getTrainingLabel(pcts) {
  const z12 = (pcts.z1 || 0) + (pcts.z2 || 0);
  const z45 = (pcts.z4 || 0) + (pcts.z5 || 0);
  if (z12 >= 75 && z45 >= 10) return { label: 'Polarized',       cls: 'text-indigo-700 bg-indigo-50 border-indigo-100' };
  if ((pcts.z2 || 0) >= 55)   return { label: 'Zone 2 Focus',    cls: 'text-green-700 bg-green-50 border-green-100' };
  if (z12 >= 80)               return { label: 'Aerobic Base',    cls: 'text-blue-700 bg-blue-50 border-blue-100' };
  if ((pcts.z3 || 0) + (pcts.z4 || 0) >= 45)
                               return { label: 'Threshold Block', cls: 'text-orange-700 bg-orange-50 border-orange-100' };
  const { z1: p1, z2: p2, z3: p3 } = pcts;
  if (p1 > p2 && p2 > p3 && p3 > 0)
                               return { label: 'Pyramidal',       cls: 'text-amber-700 bg-amber-50 border-amber-100' };
  return null;
}

/** One-sentence interpretation of the zone distribution before a test. */
function getContextSentence(pcts, sport) {
  const z12 = (pcts.z1 || 0) + (pcts.z2 || 0);
  const z45 = (pcts.z4 || 0) + (pcts.z5 || 0);
  const sportName = SPORT_LABELS[sport] || 'training';

  if (z12 >= 85)
    return `Excellent aerobic base — ${Math.round(z12)}% of ${sportName} in Z1–Z2 means fresh legs and reliable lactate readings.`;
  if (z12 >= 70 && z45 < 15)
    return `Good aerobic preparation — ${Math.round(z12)}% Z1–Z2 with minimal intensity before the test.`;
  if (z12 >= 60 && z45 >= 15)
    return `Mixed load — significant high-intensity work (${Math.round(z45)}% Z4–Z5) may slightly raise baseline lactate.`;
  if (z45 >= 25)
    return `High-intensity block — ${Math.round(z45)}% Z4–Z5 work may increase resting lactate; allow 48h recovery before testing.`;
  if (z12 < 50)
    return `Low aerobic volume — increasing Z1–Z2 training improves test repeatability and LT1 accuracy.`;
  return `${Math.round(z12)}% aerobic base (Z1–Z2) in the 8 weeks before this test.`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ZoneBars({ zoneTotals, totalZoneSecs, pcts, showDescriptions }) {
  // eslint-disable-next-line no-unused-vars
  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="space-y-2">
      {ZONE_META.map((zm, idx) => {
        const z = idx + 1;
        const key = `z${z}`;
        const pct = pcts[key] || 0;
        const secs = zoneTotals[key] || 0;
        return (
          <div key={z}>
            <div className="flex items-center gap-2">
              {/* Label */}
              <div className="w-[90px] shrink-0">
                <div className="text-[11px] font-semibold text-gray-700 leading-tight">
                  {zm.short} · {zm.name}
                </div>
                {showDescriptions && (
                  <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{zm.desc}</div>
                )}
              </div>

              {/* Bar */}
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[idx] }}
                />
              </div>

              {/* Stats */}
              <div className="w-[52px] text-right shrink-0">
                <div className="text-[11px] font-semibold text-gray-800 leading-tight">
                  {Math.round(pct)}%
                </div>
                <div className="text-[10px] text-gray-400 leading-tight">{fmtDur(secs)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SportSection({ sport, data, isMain, showDescriptions }) {
  const label = SPORT_LABELS[sport] || sport;
  const colorCls = SPORT_COLORS[sport] || 'text-gray-600';
  const { totalTime, totalSessions, zoneTotals, totalZoneSecs, pcts, hasZones } = data;
  const trainingLabel = hasZones ? getTrainingLabel(pcts) : null;
  const z12 = (pcts.z1 || 0) + (pcts.z2 || 0);
  const z45 = (pcts.z4 || 0) + (pcts.z5 || 0);

  return (
    <div>
      {/* Sport header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`text-xs font-bold ${colorCls}`}>{label}</span>
        {trainingLabel && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${trainingLabel.cls}`}>
            {trainingLabel.label}
          </span>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Chip label={fmtDur(totalTime)} sub="Total time" color="blue" />
        <Chip label={String(totalSessions)} sub="Sessions" color="green" />
        {hasZones && <Chip label={`${Math.round(z12)}%`} sub="Z1+Z2" color="emerald" />}
        {hasZones && z45 > 3 && <Chip label={`${Math.round(z45)}%`} sub="Z4+Z5" color="red" />}
      </div>

      {/* Zone bars */}
      {hasZones ? (
        <ZoneBars
          zoneTotals={zoneTotals}
          totalZoneSecs={totalZoneSecs}
          pcts={pcts}
          showDescriptions={showDescriptions}
        />
      ) : (
        <div className="text-xs text-gray-400 italic py-1">No zone data available for this period.</div>
      )}

      {/* Context sentence — only for the main sport */}
      {isMain && hasZones && (
        <div className="mt-3 text-[11px] text-gray-500 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">
          {getContextSentence(pcts, sport)}
        </div>
      )}
    </div>
  );
}

function Chip({ label, sub, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-700',
    green:   'bg-green-50 text-green-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red:     'bg-red-50 text-red-700',
    amber:   'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`flex flex-col items-center rounded-lg px-2.5 py-1.5 min-w-[54px] ${colors[color] || colors.blue}`}>
      <span className="text-sm font-bold leading-tight">{label}</span>
      <span className="text-[9px] leading-tight opacity-80">{sub}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * PreTestTrainingSummary — 8-week training context before a lactate test.
 *
 * Props:
 *   athleteId  — athlete ID (null = logged-in user)
 *   testDate   — ISO date string of the test
 *   sport      — 'bike' | 'run' | 'swim' (test sport)
 *   onData     — optional callback with summary data (used by PDF export)
 */
export default function PreTestTrainingSummary({ athleteId = null, testDate = null, sport = 'bike', onData }) {
  const [monthsData, setMonthsData]   = useState({});
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const fetchedKeys = useRef(new Set());

  const monthKeys = monthKeysBefore(testDate, 3); // 3 months ≈ 8+ weeks before test

  // Reset cached keys + data whenever the athlete or test changes so the next
  // effect always fetches fresh data for the new athlete.  Must be declared
  // before the fetch effect so it runs first in the same commit.
  useEffect(() => {
    fetchedKeys.current = new Set();
    setMonthsData({});
    setError(null);
  }, [athleteId, testDate]);

  useEffect(() => {
    const missing = monthKeys.filter(k => !fetchedKeys.current.has(k));
    if (missing.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      missing.map(k => getMonthlyPowerAnalysis(athleteId || null, k).catch(() => null))
    ).then(results => {
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

  // All loaded months as an array
  const months = monthKeys.map(k => monthsData[k] ?? null);

  // Aggregate data per sport
  const mainData = aggregateSport(months, sport);
  const otherSports = ['bike', 'run', 'swim']
    .filter(s => s !== sport)
    .map(s => ({ sport: s, data: aggregateSport(months, s) }))
    .filter(({ data }) => data.totalTime > 0 || data.totalSessions > 0);

  const hasAny = mainData.totalTime > 0 || mainData.totalSessions > 0 || otherSports.length > 0;

  // Fire onData callback
  useEffect(() => {
    if (loading || !onData) return;
    const { zoneTotals: zones, totalZoneSecs, totalTime, totalSessions } = mainData;
    const zonePcts = {};
    const zoneDurs = {};
    for (let z = 1; z <= 5; z++) {
      zonePcts[`z${z}`] = totalZoneSecs > 0 ? Math.round((zones[`z${z}`] || 0) / totalZoneSecs * 100) : 0;
      zoneDurs[`z${z}`] = zones[`z${z}`] || 0;
    }
    onData({
      months: monthKeys,
      totalTime,
      totalSessions,
      zones,
      totalZoneSecs,
      zonePcts,
      zoneDurs,
      aerobicPct: (zonePcts.z1 || 0) + (zonePcts.z2 || 0),
      highIntensityPct: (zonePcts.z4 || 0) + (zonePcts.z5 || 0),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, monthsData]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 animate-pulse">
        <div className="h-3 w-44 bg-gray-200 rounded mb-3" />
        <div className="flex gap-2 mb-3">
          {[1,2,3].map(i => <div key={i} className="h-10 w-16 bg-gray-200 rounded-lg" />)}
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div className="w-[90px] h-3 bg-gray-200 rounded" />
            <div className="flex-1 h-4 bg-gray-200 rounded-full" />
            <div className="w-12 h-3 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-500">{error}</div>
    );
  }

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-400 text-center">
        No training data found for the 8 weeks before this test.
        <div className="mt-1 text-[10px] text-gray-300">
          Upload FIT files or connect Strava to see pre-test training context.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Pre-test training · 8 weeks
        </p>
        <button
          onClick={() => setShowDescriptions(v => !v)}
          className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showDescriptions ? 'Hide descriptions' : 'What are zones?'}
        </button>
      </div>

      {/* Zone descriptions tooltip */}
      {showDescriptions && (
        <div className="mb-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-[10px] text-blue-800 space-y-1">
          {ZONE_META.map((zm, i) => (
            <div key={i} className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: ZONE_COLORS[i] }}>{zm.short}</span>
              <span><span className="font-semibold">{zm.name}</span> — {zm.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sports layout: side-by-side on lg when cross-training exists */}
      <div className={otherSports.length > 0 ? 'grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3' : ''}>
        {/* Main sport */}
        <div>
          <SportSection
            sport={sport}
            data={mainData}
            isMain
            showDescriptions={showDescriptions}
          />
        </div>

        {/* Secondary sports (cross-training) */}
        {otherSports.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Cross-training
            </div>
            <div className="space-y-3">
              {otherSports.map(({ sport: s, data }) => (
                <SportSection
                  key={s}
                  sport={s}
                  data={data}
                  isMain={false}
                  showDescriptions={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PDF helper (unchanged API) ───────────────────────────────────────────────

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
    totalTimeSecs: totalTime,
    totalSessions,
    totalZoneSecs,
    zonePcts,
    zoneDurs,
    aerobicPct:      (zonePcts.z1 || 0) + (zonePcts.z2 || 0),
    highIntensityPct:(zonePcts.z4 || 0) + (zonePcts.z5 || 0),
  };
}
