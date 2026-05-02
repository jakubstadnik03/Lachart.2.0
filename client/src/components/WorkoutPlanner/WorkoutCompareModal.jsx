/**
 * WorkoutCompareModal
 * ───────────────────
 * Shows a planned vs. actual comparison chart after a workout is completed.
 * Planned power target shown as grey bars, actual average power shown as colored bars.
 * Compliance score = % of work steps where actual was within ±10% of target.
 */
import React, { useMemo } from 'react';
import { XMarkIcon, CheckCircleIcon, ChartBarIcon } from '@heroicons/react/24/outline';

const STEP_COLORS = {
  warmup:   '#fbbf24',
  work:     '#767EB5',
  recovery: '#6ee7b7',
  cooldown: '#38bdf8',
  rest:     '#d1d5db',
};

/** Stable empty steps array so useMemo deps do not change every render when missing. */
const EMPTY_STEPS = [];

function fmtTime(secs) {
  if (!secs && secs !== 0) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function ComplianceBadge({ pct }) {
  const color = pct >= 85 ? '#22c55e' : pct >= 65 ? '#f59e0b' : '#ef4444';
  const label = pct >= 85 ? 'Excellent' : pct >= 65 ? 'Good' : 'Needs work';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 201} 201`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

export default function WorkoutCompareModal({ pw, onClose }) {
  const executionData = pw?.executionData;

  const stats = useMemo(() => {
    const steps = Array.isArray(executionData?.steps) ? executionData.steps : EMPTY_STEPS;
    if (!steps.length) return null;
    const workSteps = steps.filter(s => s.stepType === 'work' && s.targetWatts != null && s.actualAvgWatts != null);
    const compliance = workSteps.length > 0
      ? workSteps.filter(s => {
          const diff = Math.abs(s.actualAvgWatts - s.targetWatts) / s.targetWatts;
          return diff <= 0.10;
        }).length / workSteps.length * 100
      : null;

    const totalActual = steps.reduce((sum, s) => sum + (s.actualAvgWatts || 0) * (s.durationSeconds || 0), 0);
    const totalSecs = steps.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const avgPower = totalSecs > 0 ? Math.round(totalActual / totalSecs) : null;

    return { compliance, workSteps: workSteps.length, avgPower };
  }, [executionData?.steps]);

  // Build chart data
  const chartData = useMemo(() => {
    const steps = Array.isArray(executionData?.steps) ? executionData.steps : EMPTY_STEPS;
    if (!steps.length) return null;
    const maxW = Math.max(
      ...steps.map(s => Math.max(s.targetWatts || 0, s.actualAvgWatts || 0)),
      50
    );
    const totalSecs = steps.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) || 1;
    let cursor = 0;
    return steps.map(s => {
      const x = cursor / totalSecs;
      const w = (s.durationSeconds || 0) / totalSecs;
      cursor += (s.durationSeconds || 0);
      return { ...s, x, w, maxW };
    });
  }, [executionData?.steps]);

  if (!pw || !executionData) return null;

  const steps = Array.isArray(executionData.steps) ? executionData.steps : EMPTY_STEPS;

  const completedAt = executionData.completedAt
    ? new Date(executionData.completedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-gray-900">{pw.title || 'Workout'}</h2>
              {completedAt && <p className="text-xs text-gray-500">Completed {completedAt}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Summary row */}
          <div className="flex items-center gap-6">
            {stats?.compliance != null && <ComplianceBadge pct={stats.compliance} />}
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Duration</p>
                <p className="text-sm font-bold text-gray-900">{fmtTime(executionData.totalDuration || 0)}</p>
              </div>
              {stats?.avgPower != null && (
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Avg Power</p>
                  <p className="text-sm font-bold text-gray-900">{stats.avgPower} W</p>
                </div>
              )}
              {stats?.workSteps != null && (
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Work Steps</p>
                  <p className="text-sm font-bold text-gray-900">{stats.workSteps}</p>
                </div>
              )}
            </div>
          </div>

          {/* Chart: planned (grey) vs actual (colored) bars */}
          {chartData && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Power Profile — Planned vs Actual</p>
              <div className="flex items-center gap-4 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-gray-300" />
                  <span className="text-[10px] text-gray-500">Planned</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-[#767EB5]" />
                  <span className="text-[10px] text-gray-500">Actual</span>
                </div>
              </div>
              <svg
                width="100%"
                viewBox="0 0 600 100"
                className="rounded-xl overflow-hidden"
                style={{ display: 'block' }}
              >
                <rect width="600" height="100" fill="#f9fafb" />
                {chartData.map((s, i) => {
                  const svgX = s.x * 600;
                  const svgW = Math.max(1, s.w * 600 - 1);
                  const maxW = s.maxW || 1;

                  const targetH = s.targetWatts != null ? (s.targetWatts / maxW) * 85 : 0;
                  const actualH = s.actualAvgWatts != null ? (s.actualAvgWatts / maxW) * 85 : 0;
                  const color = STEP_COLORS[s.stepType] || '#767EB5';

                  // compliance coloring for actual bar
                  let actualColor = color;
                  if (s.stepType === 'work' && s.targetWatts && s.actualAvgWatts) {
                    const diff = (s.actualAvgWatts - s.targetWatts) / s.targetWatts;
                    if (diff > 0.10) actualColor = '#ef4444';
                    else if (diff < -0.10) actualColor = '#f59e0b';
                    else actualColor = '#22c55e';
                  }

                  return (
                    <g key={i}>
                      {/* Planned bar (grey, behind) */}
                      {targetH > 0 && (
                        <rect
                          x={svgX}
                          y={100 - targetH}
                          width={svgW}
                          height={targetH}
                          fill="#d1d5db"
                          opacity={0.7}
                          rx={1}
                        />
                      )}
                      {/* Actual bar (colored, in front, slightly narrower) */}
                      {actualH > 0 && (
                        <rect
                          x={svgX + svgW * 0.1}
                          y={100 - actualH}
                          width={svgW * 0.8}
                          height={actualH}
                          fill={actualColor}
                          opacity={0.9}
                          rx={1}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Per-step table */}
          {steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Step Details</p>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">Step</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-semibold">Duration</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-semibold">Target</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-semibold">Actual</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s, i) => {
                      const color = STEP_COLORS[s.stepType] || '#767EB5';
                      let statusIcon = null;
                      if (s.stepType === 'work' && s.targetWatts && s.actualAvgWatts) {
                        const diff = (s.actualAvgWatts - s.targetWatts) / s.targetWatts;
                        if (diff > 0.10) statusIcon = <span className="text-red-500 font-bold">High</span>;
                        else if (diff < -0.10) statusIcon = <span className="text-amber-500 font-bold">Low</span>;
                        else statusIcon = <CheckCircleIcon className="w-4 h-4 text-green-500 mx-auto" />;
                      }
                      return (
                        <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="capitalize font-medium text-gray-700">{s.label || s.stepType}</span>
                              {s._repeatIdx && <span className="text-gray-400 text-[10px]">×{s._repeatIdx}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{fmtTime(s.durationSeconds || 0)}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{s.targetWatts ? `${s.targetWatts} W` : '-'}</td>
                          <td className="px-3 py-2 text-center font-semibold" style={{ color: s.actualAvgWatts ? color : '#9ca3af' }}>
                            {s.actualAvgWatts ? `${s.actualAvgWatts} W` : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">{statusIcon || <span className="text-gray-300">-</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {steps.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <ChartBarIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No execution data recorded.</p>
              <p className="text-xs mt-1">Connect a power meter during the workout to see comparison data.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
