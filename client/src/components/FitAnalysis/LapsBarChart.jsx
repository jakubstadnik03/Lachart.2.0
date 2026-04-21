import React, { useMemo, useRef } from 'react';

/**
 * Strava-style laps bar chart.
 * Normal view: bars proportional to duration, all laps visible at once.
 * Zoomed view (lap selected): fixed-width bars in a horizontal scroll container,
 *   auto-scrolled to center the selected lap. Selected bar is taller + highlighted.
 * Double-click anywhere on the chart to reset zoom.
 */
export default function LapsBarChart({ laps = [], selectedLapNumber = null, onSelect, sport = '' }) {
  const sportLower = (sport || '').toLowerCase();
  const isRun = sportLower.includes('run') || sportLower === 'walk' || sportLower === 'hike';
  const isSwim = sportLower.includes('swim');
  const scrollRef = useRef(null);
  const selectedBarRef = useRef(null);

  const entries = useMemo(() => {
    return laps.map((lap, i) => {
      const lapNumber = lap?.lapNumber ?? (i + 1);
      const power = lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? lap.averageWatts ?? 0;
      const hr = lap.avgHeartRate ?? lap.avg_heart_rate ?? lap.average_heartrate ?? lap.averageHeartRate ?? 0;
      const rawSpeedMps = lap.avgSpeed ?? lap.average_speed ?? lap.avg_speed ?? lap.averageSpeed ?? lap.enhancedAvgSpeed ?? lap.enhanced_avg_speed ?? lap.speed ?? 0;
      const distanceM = Number(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
      const duration = lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? 60;
      // For run/swim, speed may be missing — compute from distance/time as fallback
      const speedMps = rawSpeedMps > 0.05
        ? rawSpeedMps
        : ((isRun || isSwim) && distanceM > 0 && duration > 0 ? distanceM / duration : rawSpeedMps);
      const lactate = lap.lactate ?? null;
      const isPause = isSwim && distanceM < 10;

      let value = 0;
      let metric = 'hr';
      if (isPause) { value = 0; metric = 'pause'; }
      else if (!isRun && !isSwim && power > 0) { value = power; metric = 'power'; }
      else if ((isRun || isSwim) && speedMps > 0) {
        if (isSwim) { value = speedMps; metric = 'pace'; }
        else { value = speedMps * 100; metric = 'speed'; }
      } else if (hr > 0) { value = hr; metric = 'hr'; }

      return { lapNumber, value, metric, hr, power, speedMps, lactate, duration, distanceM, isPause, lap };
    });
  }, [laps, isRun, isSwim]);

  // Cumulative distances for X-axis labels
  const cumulativeDist = useMemo(() => {
    let acc = 0;
    return entries.map(e => {
      acc += e.distanceM;
      return acc;
    });
  }, [entries]);

  const fmtDist = (meters) => {
    if (!meters || meters <= 0) return '';
    if (isSwim || meters < 1000) return `${Math.round(meters)}m`;
    const km = meters / 1000;
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
  };

  const activeEntries = useMemo(() => entries.filter(e => !e.isPause), [entries]);
  const maxVal = useMemo(() => Math.max(...activeEntries.map(e => e.value), 1), [activeEntries]);
  const minVal = useMemo(() => {
    const vals = activeEntries.map(e => e.value).filter(v => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  }, [activeEntries]);

  // No scroll needed — bars are always proportional width, no fixed-width zoom mode.

  const barColor = (entry, isSelected) => {
    if (entry.isPause) return '#d1d5db';
    if (entry.lactate != null) return isSelected ? '#7c3aed' : '#a78bfa';
    if (entry.metric === 'power') return isSelected ? '#3b5bdb' : '#74c0fc';
    if (entry.metric === 'pace' || entry.metric === 'speed') return isSelected ? '#2f9e44' : '#8ce99a';
    return isSelected ? '#c92a2a' : '#ffa8a8';
  };

  const fmtLabel = (entry) => {
    if (entry.isPause) return 'Rest';
    if (entry.metric === 'power') return `${Math.round(entry.power)}W`;
    if (entry.metric === 'pace') {
      const mps = entry.speedMps;
      if (!mps) return '';
      const secPer100m = 100 / mps;
      const min = Math.floor(secPer100m / 60);
      const sec = Math.round(secPer100m % 60);
      return `${min}:${String(sec).padStart(2, '0')}/100m`;
    }
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

  // Y-axis label for the max value
  const fmtYMax = () => {
    if (!firstActive) return '';
    const m = firstActive.metric;
    if (m === 'power') return `${Math.round(maxVal)}W`;
    if (m === 'speed') { // run: value = speedMps * 100
      const mps = maxVal / 100;
      const sec = 1000 / mps;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    if (m === 'pace') { // swim: value = speedMps
      const sec = 100 / maxVal;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    return `${Math.round(maxVal)}`;
  };

  // Y-axis label for the min value (bottom of meaningful range)
  const fmtYMin = () => {
    if (!firstActive || minVal === 0) return '0';
    const m = firstActive.metric;
    if (m === 'power') return `${Math.round(minVal)}W`;
    if (m === 'speed') {
      const mps = minVal / 100;
      const sec = 1000 / mps;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    if (m === 'pace') {
      const sec = 100 / minVal;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    return `${Math.round(minVal)}`;
  };

  if (entries.length === 0) return null;

  const isZoomed = selectedLapNumber != null;
  const firstActive = activeEntries[0];

  const handleDoubleClick = () => {
    if (onSelect) onSelect(null);
  };

  return (
    <div className="w-full mb-3">
      {/* Chart area with Y-axis */}
      <div className="flex gap-1 items-stretch">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between flex-shrink-0 w-9 h-32 py-0.5">
          <span className="text-[8px] text-gray-400 leading-none text-right truncate">{fmtYMax()}</span>
          <span className="text-[8px] text-gray-400 leading-none text-right">{fmtYMin()}</span>
        </div>

        {/* Bars + lap labels */}
        <div className="flex-1 min-w-0">
          <div
            ref={scrollRef}
            onDoubleClick={handleDoubleClick}
            className="overflow-hidden rounded-lg"
          >
            <div
              className="flex items-end gap-0.5 h-32 px-1"
              style={{ width: '100%' }}
            >
              {entries.map((entry) => {
                const isSelected = selectedLapNumber != null && String(entry.lapNumber) === String(selectedLapNumber);

                if (entry.isPause) {
                  return (
                    <div
                      key={entry.lapNumber}
                      className="flex flex-col items-center justify-end shrink-0"
                      style={{ width: '6px', height: '100%' }}
                    >
                      <div className="w-full rounded-t" style={{ height: '8%', minHeight: '3px', backgroundColor: '#d1d5db' }} />
                    </div>
                  );
                }
                // Selected bar gets a minimum height so the label is always readable
                const rawPct = Math.max((entry.value / maxVal) * 100, 8);
                const heightPct = isSelected ? Math.max(rawPct, 28) : rawPct;

                return (
                  <button
                    type="button"
                    key={entry.lapNumber}
                    ref={isSelected ? selectedBarRef : null}
                    onClick={() => onSelect && onSelect(isSelected ? null : entry.lapNumber)}
                    title={`Lap ${entry.lapNumber}: ${fmtLabel(entry)}${entry.lactate != null ? ` · La ${entry.lactate.toFixed(1)}` : ''}`}
                    className="flex flex-col items-center justify-end group relative focus:outline-none"
                    style={{ flex: `${entry.duration} 1 0%`, minWidth: 0, height: '100%' }}
                  >
                    {/* Bar — label + lactate dot live inside */}
                    <div
                      className="w-full rounded-t relative overflow-hidden"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: barColor(entry, isSelected),
                        opacity: isZoomed ? (isSelected ? 1 : 0.55) : isSelected ? 1 : 0.75,
                        boxShadow: isSelected
                          ? `0 0 0 2px ${barColor(entry, true)}, 0 2px 8px ${barColor(entry, true)}60`
                          : 'none',
                        transform: isSelected && isZoomed ? 'scaleX(0.85)' : undefined,
                        transformOrigin: 'bottom',
                      }}
                    >
                      {/* Value label inside bar at top — always show when selected */}
                      {isSelected && (
                        <span className="absolute inset-x-0 top-1 text-[8px] font-bold leading-none text-center truncate px-0.5 text-white">
                          {fmtLabel(entry)}
                        </span>
                      )}
                      {/* Lactate dot — inside bar near top */}
                      {entry.lactate != null && (
                        <div className="absolute left-1/2 -translate-x-1/2 top-1 w-2 h-2 rounded-full bg-violet-500 border-2 border-white shadow-sm" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Lap number labels */}
            <div
              className="flex items-start gap-0.5 px-1 mt-0.5"
              style={{ width: '100%' }}
            >
              {(() => {
                // Build sparse label set: first, ~25%, ~50%, ~75%, last active entry index
                const n = activeEntries.length;
                const sparseSet = new Set([
                  activeEntries[0]?.lapNumber,
                  activeEntries[Math.round(n * 0.25)]?.lapNumber,
                  activeEntries[Math.round(n * 0.5)]?.lapNumber,
                  activeEntries[Math.round(n * 0.75)]?.lapNumber,
                  activeEntries[n - 1]?.lapNumber,
                ]);
                return entries.map((entry, i) => {
                if (entry.isPause) return (
                  <div key={entry.lapNumber} style={{ width: '6px', flexShrink: 0 }} />
                );
                const isSelected = String(entry.lapNumber) === String(selectedLapNumber);
                const cumDist = cumulativeDist[i];
                const distLabel = fmtDist(cumDist);
                const showLabel = isSelected || sparseSet.has(entry.lapNumber);
                return (
                  <div
                    key={entry.lapNumber}
                    className="text-center overflow-visible relative"
                    style={{ flex: `${entry.duration} 1 0%`, minWidth: 0 }}
                  >
                    {showLabel && (
                      <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] leading-none font-medium ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
                        {distLabel || entry.lapNumber}
                      </span>
                    )}
                  </div>
                );
              });
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Legend row */}
      <div className="flex items-center justify-between px-1 mt-1">
        <span className="text-[10px] text-gray-400">
          {firstActive?.metric === 'power' ? '⚡ Avg power' :
           firstActive?.metric === 'pace' ? '🏊 Avg pace' :
           firstActive?.metric === 'speed' ? '🏃 Avg pace' :
           '❤️ Avg HR'}
        </span>
        <div className="flex items-center gap-2">
          {entries.some(e => e.lactate != null) && (
            <span className="text-[10px] text-violet-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" /> lactate
            </span>
          )}
          {isZoomed && (
            <button
              type="button"
              onClick={() => onSelect && onSelect(null)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
