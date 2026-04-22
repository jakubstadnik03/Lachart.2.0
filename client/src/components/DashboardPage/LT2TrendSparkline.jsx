import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthProvider';
import { resolveDistanceUnitSystem, paceUnit } from '../../utils/unitsConverter';

const PRIMARY = '#767EB5';

/**
 * Estimate LT2 from a test's results array.
 * Strategy 1 – OBLA: first stage where lactate >= 4.0 mmol/L.
 * Strategy 2 – 50% rise heuristic: first stage where lactate increases by > 50% vs previous.
 * Returns { value, unit } or null if not determinable.
 */
function estimateLT2(results, sport, unitSystem = 'metric') {
  if (!Array.isArray(results) || results.length < 2) return null;

  // Filter stages that have lactate readings
  const stages = results.filter(
    (r) => r.lactate != null && !Number.isNaN(Number(r.lactate))
  );
  if (stages.length < 2) return null;

  const getValue = (stage) => {
    if (sport === 'bike') return Number(stage.power) || null;
    // For run use interval/pace field; fallback to power
    return Number(stage.interval) || Number(stage.pace) || Number(stage.power) || null;
  };

  const unit = sport === 'bike' ? 'W' : paceUnit(unitSystem, sport);

  // Strategy 1: OBLA (lactate >= 4.0)
  for (const stage of stages) {
    if (Number(stage.lactate) >= 4.0) {
      const val = getValue(stage);
      if (val) return { value: val, unit };
    }
  }

  // Strategy 2: 50% rise heuristic
  for (let i = 1; i < stages.length; i++) {
    const prev = Number(stages[i - 1].lactate);
    const curr = Number(stages[i].lactate);
    if (prev > 0 && (curr - prev) / prev > 0.5) {
      const val = getValue(stages[i]);
      if (val) return { value: val, unit };
    }
  }

  return null;
}

/**
 * Filter tests by sport and return only the last 12 months,
 * sorted oldest → newest.
 */
function filterAndSortTests(tests, sport) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  return tests
    .filter((t) => {
      const matchesSport = sport === 'all' || t.sport === sport;
      const withinWindow = new Date(t.date) >= cutoff;
      return matchesSport && withinWindow;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const { label, value, unit } = payload[0].payload;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800">
        {value} {unit}
      </p>
      <p className="text-gray-500">{label}</p>
    </div>
  );
};

// Sports that have at least one test with extractable LT2
function availableSports(tests) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const seen = new Set();
  tests.forEach((t) => {
    if (new Date(t.date) >= cutoff && estimateLT2(t.results, t.sport)) {
      seen.add(t.sport);
    }
  });
  return [...seen];
}

export default function LT2TrendSparkline({ tests = [], sport = 'all' }) {
  const { user } = useAuth();
  const unitSystem = resolveDistanceUnitSystem(user);

  // When parent says 'all', let the user pick inside the card
  const sports = useMemo(() => availableSports(tests), [tests]);
  const [activeSport, setActiveSport] = React.useState(() => {
    if (sport !== 'all') return sport;
    return sports[0] || 'bike';
  });

  // If parent sport changes to a specific sport, follow it
  React.useEffect(() => {
    if (sport !== 'all') setActiveSport(sport);
  }, [sport]);

  // If available sports change and current isn't available, switch
  React.useEffect(() => {
    if (sports.length > 0 && !sports.includes(activeSport)) {
      setActiveSport(sports[0]);
    }
  }, [sports, activeSport]);

  const chartData = useMemo(() => {
    const filtered = filterAndSortTests(tests, activeSport);
    return filtered
      .map((t) => {
        const lt2 = estimateLT2(t.results, t.sport, unitSystem);
        if (!lt2) return null;
        const date = new Date(t.date);
        const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { label, value: lt2.value, unit: lt2.unit, date };
      })
      .filter(Boolean);
  }, [tests, activeSport, unitSystem]);

  const hasData = chartData.length >= 2;

  const first = hasData ? chartData[0] : null;
  const latest = hasData ? chartData[chartData.length - 1] : null;

  const delta = hasData ? latest.value - first.value : null;
  const improving = delta !== null && delta > 0;
  const declining = delta !== null && delta < 0;

  const monthsDiff = hasData
    ? Math.round((latest.date - first.date) / (1000 * 60 * 60 * 24 * 30))
    : 0;

  const trendArrow = improving ? '↑' : declining ? '↓' : '→';
  const trendColor = improving ? 'text-green-500' : declining ? 'text-red-500' : 'text-gray-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">LT2 Trend</h3>
          {/* Sport tabs — only show when multiple sports available or parent is 'all' */}
          {(sport === 'all' || sports.length > 1) && sports.length > 0 && (
            <div className="flex gap-1">
              {sports.map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveSport(s)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    activeSport === s
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
          {sport !== 'all' && sports.length <= 1 && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
              {activeSport.charAt(0).toUpperCase() + activeSport.slice(1)}
            </span>
          )}
        </div>
        {hasData && (
          <span className={`text-lg font-bold ${trendColor}`}>{trendArrow}</span>
        )}
      </div>

      {/* Chart or placeholder */}
      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-indigo-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.5l5.25-5.25 4.5 4.5 5.25-7.5"
              />
            </svg>
          </div>
          <p className="text-xs text-gray-500 max-w-[180px]">
            Enter more tests to see LT2 trend
          </p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
            >
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={PRIMARY}
                strokeWidth={2}
                dot={<Dot r={3} fill={PRIMARY} strokeWidth={0} />}
                activeDot={{ r: 4, fill: PRIMARY }}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Footer summary */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>
              {first.value} {first.unit}
              <span className="mx-1 text-gray-300">→</span>
              <span className="font-semibold text-gray-700">
                {latest.value} {latest.unit}
              </span>
            </span>
            {delta !== null && (
              <span className={improving ? 'text-green-600 font-medium' : declining ? 'text-red-500 font-medium' : 'text-gray-400'}>
                {delta > 0 ? '+' : ''}
                {delta} {latest.unit} over {monthsDiff} mo
              </span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
