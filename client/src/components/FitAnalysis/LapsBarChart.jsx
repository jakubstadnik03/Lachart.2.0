import React, { useMemo } from 'react';

/**
 * Strava-style laps bar chart.
 * Each lap = one bar. Height = avg power (or pace for runs, HR as fallback).
 * Selected lap is highlighted. Clicking a bar calls onSelect(lapNumber).
 */
export default function LapsBarChart({ laps = [], selectedLapNumber = null, onSelect, sport = '' }) {
  const sportLower = (sport || '').toLowerCase();
  const isRun = sportLower.includes('run') || sportLower === 'walk' || sportLower === 'hike';
  const isSwim = sportLower.includes('swim');

  // Determine the primary metric per lap
  const entries = useMemo(() => {
    return laps.map((lap, i) => {
      const lapNumber = lap?.lapNumber ?? (i + 1);
      const power = lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? lap.averageWatts ?? 0;
      const hr = lap.avgHeartRate ?? lap.avg_heart_rate ?? lap.average_heartrate ?? lap.averageHeartRate ?? 0;
      const speedMps = lap.avgSpeed ?? lap.average_speed ?? lap.avg_speed ?? lap.averageSpeed ?? 0;
      const lactate = lap.lactate ?? null;

      // For runs: use pace (inverted speed = higher bar = slower is BAD, so use speed directly)
      // For cycling: use power
      // Fallback: HR
      let value = 0;
      let metric = 'hr';
      if (!isRun && !isSwim && power > 0) {
        value = power;
        metric = 'power';
      } else if ((isRun || isSwim) && speedMps > 0) {
        value = speedMps * 100; // scale to reasonable range
        metric = 'speed';
      } else if (hr > 0) {
        value = hr;
        metric = 'hr';
      }

      // Duration for width scaling
      const duration =
        lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? 60;

      return { lapNumber, value, metric, hr, power, speedMps, lactate, duration, lap };
    });
  }, [laps, isRun, isSwim]);

  const maxVal = useMemo(() => Math.max(...entries.map(e => e.value), 1), [entries]);

  // Assign a color per lap based on metric
  const barColor = (entry, isSelected) => {
    if (entry.lactate != null) return isSelected ? '#7c6fc4' : '#a89ce0'; // purple = has lactate
    if (entry.metric === 'power') return isSelected ? '#3b5bdb' : '#74c0fc';
    if (entry.metric === 'speed') return isSelected ? '#2f9e44' : '#8ce99a';
    return isSelected ? '#c92a2a' : '#ffa8a8';
  };

  const fmtLabel = (entry) => {
    if (entry.metric === 'power') return `${Math.round(entry.power)}W`;
    if (entry.metric === 'speed') {
      const mps = entry.speedMps;
      if (!mps) return '';
      if (isRun) {
        const secPerKm = 1000 / mps;
        const min = Math.floor(secPerKm / 60);
        const sec = Math.round(secPerKm % 60);
        return `${min}:${String(sec).padStart(2, '0')}/km`;
      }
      return `${(mps * 3.6).toFixed(1)} km/h`;
    }
    return `${Math.round(entry.hr)} bpm`;
  };

  if (entries.length === 0) return null;

  // Total duration for proportional widths
  const totalDuration = entries.reduce((s, e) => s + e.duration, 0) || 1;

  return (
    <div className="w-full mb-4">
      {/* Bars */}
      <div className="flex items-end gap-0.5 h-20 px-1 w-full">
        {entries.map((entry) => {
          const isSelected = selectedLapNumber != null && String(entry.lapNumber) === String(selectedLapNumber);
          const heightPct = maxVal > 0 ? (entry.value / maxVal) * 100 : 20;
          // Width proportional to lap duration (min 2%)
          const widthPct = Math.max((entry.duration / totalDuration) * 100, 2);

          return (
            <button
              key={entry.lapNumber}
              onClick={() => onSelect && onSelect(isSelected ? null : entry.lapNumber)}
              title={`Lap ${entry.lapNumber}: ${fmtLabel(entry)}${entry.lactate != null ? ` · La ${entry.lactate.toFixed(1)}` : ''}`}
              className="flex flex-col items-center justify-end group transition-all relative shrink-0"
              style={{ width: `${widthPct}%`, height: '100%' }}
            >
              {/* Bar */}
              <div
                className="w-full rounded-t transition-all duration-150"
                style={{
                  height: `${Math.max(heightPct, 8)}%`,
                  backgroundColor: barColor(entry, isSelected),
                  opacity: isSelected ? 1 : 0.75,
                  boxShadow: isSelected ? `0 0 0 2px ${barColor(entry, true)}` : 'none',
                }}
              />
              {/* Lactate dot */}
              {entry.lactate != null && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary border border-white"
                  style={{ bottom: `${Math.max(heightPct, 8)}%`, marginBottom: '1px' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Lap number labels — only every Nth to avoid crowding */}
      <div className="flex items-start gap-0.5 px-1 mt-1">
        {entries.map((entry, i) => {
          const widthPct = Math.max((entry.duration / totalDuration) * 100, 2);
          const showLabel = entries.length <= 12 || i === 0 || i === entries.length - 1 || (i + 1) % Math.ceil(entries.length / 10) === 0;
          return (
            <div
              key={entry.lapNumber}
              className="text-center shrink-0 overflow-hidden"
              style={{ width: `${widthPct}%` }}
            >
              {showLabel && (
                <span className="text-[9px] text-gray-400 leading-none">{i + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-1 mt-1">
        <span className="text-[10px] text-gray-400">
          {entries[0]?.metric === 'power' ? '⚡ Avg power per lap' :
           entries[0]?.metric === 'speed' ? '🏃 Avg pace per lap' :
           '❤️ Avg HR per lap'}
        </span>
        {entries.some(e => e.lactate != null) && (
          <span className="text-[10px] text-primary flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            lactate
          </span>
        )}
      </div>
    </div>
  );
}
