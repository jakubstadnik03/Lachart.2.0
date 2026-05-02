import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';

const PERIODS = [
  { label: '30d', value: '30d', days: 30 },
  { label: '90d', value: '90d', days: 90 },
  { label: '6m',  value: '6m',  days: 180 },
  { label: '12m', value: '12m', days: 365 },
];

const ZONES = [
  { key: 'z1', label: 'Z1', name: 'Recovery',  color: '#60A5FA' },
  { key: 'z2', label: 'Z2', name: 'Aerobic',   color: '#34D399' },
  { key: 'z3', label: 'Z3', name: 'Tempo',     color: '#FBBF24' },
  { key: 'z4', label: 'Z4', name: 'Threshold', color: '#F97316' },
  { key: 'z5', label: 'Z5', name: 'VO2max',    color: '#F87171' },
];

// Map an intensity string to a zone key
const INTENSITY_MAP = {
  // Z1
  recovery: 'z1', 'very easy': 'z1', 'very_easy': 'z1', warmup: 'z1', cooldown: 'z1',
  // Z2
  easy: 'z2', base: 'z2', aerobic: 'z2', endurance: 'z2', long: 'z2', low: 'z2',
  moderate: 'z2', steady: 'z2', zone2: 'z2', z2: 'z2',
  // Z3
  tempo: 'z3', 'steady state': 'z3', medium: 'z3', zone3: 'z3', z3: 'z3',
  // Z4
  threshold: 'z4', hard: 'z4', lt: 'z4', lt2: 'z4', 'lactate threshold': 'z4',
  zone4: 'z4', z4: 'z4',
  // Z5 (note: do NOT map workout `type: "interval"` here — that is structural, not intensity)
  race: 'z5', sprint: 'z5', 'very hard': 'z5', very_hard: 'z5',
  max: 'z5', vo2: 'z5', vo2max: 'z5', zone5: 'z5', z5: 'z5', high: 'z5',
  anaerobic: 'z5',
  // Mixed / terrain — approximate mid zone
  hills: 'z3',
};

function intensityToZone(str) {
  if (!str) return null;
  const key = str.toLowerCase().trim();
  return INTENSITY_MAP[key] || null;
}

// Parse duration string or number → seconds
function parseDuration(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  // HH:MM:SS or MM:SS
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  // Plain number (assume minutes if < 600, seconds otherwise)
  const n = parseFloat(str);
  if (!Number.isNaN(n)) return n < 600 ? n * 60 : n;
  return 0;
}

/** Total workout length in seconds (Strava/FIT use numeric seconds; DB trainings often use duration string). */
function totalTrainingSeconds(training) {
  const fromNumeric = Number(
    training.movingTime
    ?? training.elapsedTime
    ?? training.totalElapsedTime
    ?? training.totalTimerTime
    ?? training.totalTime
    ?? 0
  );
  if (Number.isFinite(fromNumeric) && fromNumeric > 0) return fromNumeric;
  return parseDuration(training.duration || training.durationSeconds);
}

// ─── Threshold helpers ────────────────────────────────────────────────────────

/** Normalize training sport string → 'run' | 'bike' | 'swim' | null */
function normalizeSport(training) {
  const s = (training.sport || training.sport_type || training.type || '').toLowerCase();
  if (s.includes('run')) return 'run';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'bike';
  if (s.includes('swim')) return 'swim';
  return null;
}

/**
 * Estimate LT1 / LT2 from a single test's results array.
 * Returns { lt1Hr, lt2Hr, lt1Power, lt2Power } — any value may be null.
 */
function estimateTestThresholds(test) {
  // Use manual overrides first
  const ov = test.thresholdOverrides || {};
  const ovLt1Hr    = ov.LTP1_hr    != null ? Number(ov.LTP1_hr)    : null;
  const ovLt2Hr    = ov.LTP2_hr    != null ? Number(ov.LTP2_hr)    : null;
  const ovLt1Pow   = ov.LTP1       != null ? Number(ov.LTP1)       : null;
  const ovLt2Pow   = ov.LTP2       != null ? Number(ov.LTP2)       : null;

  let lt1Hr = ovLt1Hr, lt2Hr = ovLt2Hr;
  let lt1Power = ovLt1Pow, lt2Power = ovLt2Pow;

  // Auto-estimate from staged results when overrides are missing
  const stages = Array.isArray(test.results)
    ? test.results.filter(r => r.lactate != null && !Number.isNaN(Number(r.lactate)))
    : [];

  if (stages.length >= 2 && (lt2Hr == null || lt2Power == null)) {
    const minLac = Math.min(...stages.map(s => Number(s.lactate)));

    // LT2: OBLA (≥4 mmol) or 50% rise
    for (const stage of stages) {
      const lac = Number(stage.lactate);
      if (lac >= 4.0) {
        if (lt2Hr == null)    lt2Hr    = Number(stage.heartRate) || null;
        if (lt2Power == null) lt2Power = Number(stage.power) || Number(stage.interval) || null;
        break;
      }
    }
    if (lt2Hr == null && lt2Power == null) {
      for (let i = 1; i < stages.length; i++) {
        const prev = Number(stages[i - 1].lactate);
        const curr = Number(stages[i].lactate);
        if (prev > 0 && (curr - prev) / prev > 0.5) {
          if (lt2Hr == null)    lt2Hr    = Number(stages[i].heartRate) || null;
          if (lt2Power == null) lt2Power = Number(stages[i].power) || Number(stages[i].interval) || null;
          break;
        }
      }
    }

    // LT1: first stage where lactate > baseline + 1.0 mmol
    for (const stage of stages) {
      const lac = Number(stage.lactate);
      if (lac > minLac + 1.0) {
        if (lt1Hr == null)    lt1Hr    = Number(stage.heartRate) || null;
        if (lt1Power == null) lt1Power = Number(stage.power) || Number(stage.interval) || null;
        break;
      }
    }
  }

  return { lt1Hr, lt2Hr, lt1Power, lt2Power };
}

/**
 * Get LT1/LT2 thresholds for a given sport from the athlete's most recent test.
 * Returns { lt1Hr, lt2Hr, lt1Power, lt2Power } or null.
 */
function computeThresholds(tests, sport) {
  if (!Array.isArray(tests) || tests.length === 0 || !sport) return null;
  const matching = tests
    .filter(t => t.sport === sport)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (matching.length === 0) return null;
  const thresholds = estimateTestThresholds(matching[0]);
  // Need at least one HR or power reference
  if (!thresholds.lt2Hr && !thresholds.lt2Power) return null;
  return thresholds;
}

/**
 * Classify average HR (or power) into a zone key using LT thresholds.
 * Returns 'z1'–'z5' or null.
 */
function classifyByThreshold(hr, power, thresholds) {
  const { lt1Hr, lt2Hr, lt1Power, lt2Power } = thresholds;

  // Prefer HR if we have LT2 reference
  if (hr > 30 && lt2Hr > 0) {
    if (hr >= lt2Hr * 1.03) return 'z5';
    if (hr >= lt2Hr * 0.97) return 'z4';
    if (lt1Hr > 0 && hr >= lt1Hr) return 'z3';
    if (lt1Hr > 0 && hr >= lt1Hr * 0.88) return 'z2';
    return 'z1';
  }

  // Fall back to power
  if (power > 10 && lt2Power > 0) {
    if (power >= lt2Power * 1.10) return 'z5';
    if (power >= lt2Power * 0.95) return 'z4';
    if (lt1Power > 0 && power >= lt1Power) return 'z3';
    if (lt1Power > 0 && power >= lt1Power * 0.88) return 'z2';
    return 'z1';
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract zone seconds from a single training.
 * Priority:
 *   1. Structured zone fields (zones[], heartRateZones, powerZones)
 *   2. Per-interval intensity × duration from results[]
 *   3. Top-level explicit intensity × total duration
 *   4. Threshold-based: classify avg HR/power per lap (or whole workout) using LT data
 */
function extractZones(training, thresholds) {
  const empty = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  // ── 1. Structured zone fields ──────────────────────────────────────────────
  for (const zonesField of ['zones', 'timeInZone', 'timeInZones', 'zoneTimes']) {
    const zones = training?.[zonesField];
    if (Array.isArray(zones) && zones.length > 0) {
      const result = { ...empty };
      // Garmin-style arrays often use zone 0–4 → LaChart Z1–Z5
      const zeroBased = zones.some((z) => {
        const r = Number(z.zone ?? z.zoneNumber ?? z.id);
        return Number.isFinite(r) && r === 0;
      });
      zones.forEach((z) => {
        let idx = Number(z.zone ?? z.zoneNumber ?? z.id);
        if (!Number.isFinite(idx)) return;
        if (zeroBased && idx >= 0 && idx <= 4) idx += 1;
        const t = Number(z.time || z.seconds || z.duration || z.value || 0);
        if (idx >= 1 && idx <= 5) result[`z${idx}`] += t;
      });
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      if (total > 0) return result;
    }
  }

  for (const fieldName of ['heartRateZones', 'powerZones']) {
    const zoneObj = training[fieldName];
    if (zoneObj && typeof zoneObj === 'object' && !Array.isArray(zoneObj)) {
      const result = { ...empty };
      for (let i = 1; i <= 5; i++) {
        const t = Number(zoneObj[`zone${i}`] || zoneObj[`z${i}`] || zoneObj[`Zone${i}`] || zoneObj[i] || 0);
        result[`z${i}`] += t;
      }
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      if (total > 0) return result;
    }
  }

  // ── 2. Per-interval data from results[] ───────────────────────────────────
  if (Array.isArray(training.results) && training.results.length > 0) {
    const result = { ...empty };
    let attributed = 0;

    // Map intervalType → zone (LaChart training form auto-detects these)
    const INTERVAL_TYPE_ZONE = {
      warmup:   'z1',
      cooldown: 'z1',
      recovery: 'z1',
      work:     'z4', // best-effort: work intervals are threshold-range by default
    };

    training.results.forEach((interval) => {
      // Prefer explicit intensity/category; fall back to intervalType
      const zone =
        intensityToZone(interval.intensity || interval.category) ||
        INTERVAL_TYPE_ZONE[interval.intervalType] ||
        null;
      const secs = parseDuration(interval.duration || interval.durationSeconds);
      if (zone && secs > 0) {
        result[zone] += secs;
        attributed += secs;
      }
    });
    if (attributed > 0) return result;
  }

  // ── 3. Top-level explicit intensity × total duration ──────────────────────
  // NOTE: do NOT use training.category here — "threshold", "endurance" etc.
  // describe the workout TYPE, not "100% of time was spent in that zone".
  // Only use training.intensity which users set specifically to indicate zone.
  const zone = intensityToZone(training.intensity);
  const totalSecs = totalTrainingSeconds(training);
  if (zone && totalSecs > 0) {
    const result = { ...empty };
    result[zone] = totalSecs;
    return result;
  }

  // ── 4. Threshold-based fallback (Strava / FIT without zone data) ──────────
  // Uses the athlete's lactate test LT1/LT2 to classify each lap (or the whole
  // workout if no laps) by average HR or average power into a single zone.
  if (thresholds) {
    const lapResult = { ...empty };
    let lapAttributed = 0;

    if (Array.isArray(training.laps) && training.laps.length > 1) {
      training.laps.forEach((lap) => {
        const secs = Number(lap.moving_time || lap.elapsed_time || 0);
        if (secs <= 0) return;
        const avgHr  = Number(lap.average_heartrate || 0);
        const avgPwr = Number(lap.average_watts || 0);
        const lapZone = classifyByThreshold(avgHr, avgPwr, thresholds);
        if (lapZone) {
          lapResult[lapZone] += secs;
          lapAttributed += secs;
        }
      });
    }

    if (lapAttributed > 0) return lapResult;

    // No usable laps — classify whole workout by top-level averages
    const avgHr  = Number(training.averageHeartRate || training.average_heartrate || 0);
    const avgPwr = Number(
      training.weightedAveragePower || training.averagePower ||
      training.average_watts || training.normalizedPower || 0
    );
    const workoutZone = classifyByThreshold(avgHr, avgPwr, thresholds);
    const workoutSecs = totalTrainingSeconds(training);
    if (workoutZone && workoutSecs > 0) {
      const result = { ...empty };
      result[workoutZone] = workoutSecs;
      return result;
    }
  }

  return null;
}

function filterByPeriod(trainings, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return trainings.filter((t) => {
    const d = new Date(t.date || t.startDate || t.timestamp);
    return !Number.isNaN(d.getTime()) && d >= cutoff;
  });
}

function aggregateZones(trainings, tests) {
  const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let hasData = false;

  // Pre-compute per-sport thresholds (only once per aggregation)
  const thresholdCache = {};
  const getThresholds = (sport) => {
    if (sport == null) return null;
    if (!(sport in thresholdCache)) {
      thresholdCache[sport] = computeThresholds(tests, sport);
    }
    return thresholdCache[sport];
  };

  trainings.forEach((t) => {
    const sport = normalizeSport(t);
    const thresholds = getThresholds(sport);
    const z = extractZones(t, thresholds);
    if (z) {
      hasData = true;
      Object.keys(totals).forEach((k) => { totals[k] += z[k] || 0; });
    }
  });
  return { ...totals, hasData };
}

function getDistributionLabel(pcts) {
  const { z1, z2, z3, z4, z5 } = pcts;
  if (z1 + z5 >= 80) return { label: 'Polarized',       color: 'text-indigo-600 bg-indigo-50' };
  if (z2 >= 60)       return { label: 'Zone 2 Focus',    color: 'text-green-600 bg-green-50' };
  if (z1 > z2 && z2 > z3) return { label: 'Pyramidal',  color: 'text-amber-600 bg-amber-50' };
  if (z3 + z4 >= 50)  return { label: 'Threshold-heavy', color: 'text-orange-600 bg-orange-50' };
  return null;
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
      {ZONES.map((z) => (
        <div key={z.key} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: z.color }} />
          <span className="text-gray-500 w-20">{z.label} {z.name}:</span>
          <span className="font-semibold text-gray-800">{item?.[z.key] != null ? `${item[z.key].toFixed(1)}%` : '0%'}</span>
        </div>
      ))}
    </div>
  );
};

export default function ZoneDistributionChart({ trainings = [], tests = [], period = '90d' }) {
  const [activePeriod, setActivePeriod] = useState(period);

  const { chartData, pcts, hasData, usingThresholds } = useMemo(() => {
    const def = PERIODS.find((p) => p.value === activePeriod) || PERIODS[1];
    const filtered = filterByPeriod(trainings, def.days);
    const { hasData, ...totals } = aggregateZones(filtered, tests);
    if (!hasData) return { chartData: [], pcts: null, hasData: false, usingThresholds: false };

    const grand = Object.values(totals).reduce((a, b) => a + b, 0);
    if (grand === 0) return { chartData: [], pcts: null, hasData: false, usingThresholds: false };

    const pcts = {};
    ZONES.forEach((z) => { pcts[z.key] = (totals[z.key] / grand) * 100; });

    // Check if any sport has thresholds available (to show subtle indicator)
    const hasSomeThreshold = ['run', 'bike', 'swim'].some(s => computeThresholds(tests, s) != null);

    return { chartData: [{ name: 'dist', ...pcts }], pcts, hasData: true, usingThresholds: hasSomeThreshold };
  }, [trainings, tests, activePeriod]);

  const distLabel = hasData && pcts ? getDistributionLabel(pcts) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Zone Distribution</h3>
          {distLabel && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${distLabel.color}`}>
              {distLabel.label}
            </span>
          )}
        </div>
        <div className="flex items-center rounded-lg bg-gray-50 p-0.5 gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setActivePeriod(p.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activePeriod === p.value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 justify-center">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-5 4 4 4-6" />
              </svg>
            </div>
            <p className="text-xs font-medium text-gray-600 mb-1">No zone data yet</p>
            <p className="text-xs text-gray-400 max-w-[200px]">
              Add workouts with intensity levels to see zone distribution
            </p>
          </div>
        ) : (
          <>
            {/* Stacked horizontal bar */}
            <ResponsiveContainer width="100%" height={48}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap={0}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                {ZONES.map((z, i) => (
                  <Bar
                    key={z.key}
                    dataKey={z.key}
                    stackId="zones"
                    fill={z.color}
                    radius={i === 0 ? [4, 0, 0, 4] : i === ZONES.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                    isAnimationActive
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Zone legend */}
            <div className="mt-4 grid grid-cols-5 gap-1">
              {ZONES.map((z) => (
                <div key={z.key} className="flex flex-col items-center gap-1">
                  <div className="w-full h-1.5 rounded-full" style={{ background: z.color }} />
                  <span className="text-[11px] font-semibold text-gray-700">
                    {pcts?.[z.key] != null ? `${Math.round(pcts[z.key])}%` : '0%'}
                  </span>
                  <span className="text-[10px] text-gray-400">{z.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {ZONES.map((z) => (
                <p key={z.key} className="text-[9px] text-center text-gray-400 truncate">{z.name}</p>
              ))}
            </div>
            {usingThresholds && (
              <p className="mt-2 text-[9px] text-center text-gray-400">
                ✦ Estimated from your lactate test thresholds
              </p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
