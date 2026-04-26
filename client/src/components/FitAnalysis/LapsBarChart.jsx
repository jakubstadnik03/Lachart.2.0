import React, { useMemo, useRef, useEffect, useState } from 'react';

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
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const checkScrollEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    });
  };

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

      const intervalType = lap.intervalType ?? null; // 'work' | 'warmup' | 'cooldown' | 'recovery' | null
      return { lapNumber, value, metric, hr, power, speedMps, lactate, duration, distanceM, isPause, intervalType, lap };
    });
  }, [laps, isRun, isSwim]);

  // Cumulative distances for X-axis labels (keyed by lapNumber so displayEntries can look up)
  const cumulativeDistMap = useMemo(() => {
    let acc = 0;
    const map = new Map();
    entries.forEach(e => {
      acc += e.distanceM;
      map.set(e.lapNumber, acc);
    });
    return map;
  }, [entries]);

  const fmtDist = (meters) => {
    if (!meters || meters <= 0) return '';
    if (isSwim || meters < 1000) return `${Math.round(meters)}m`;
    const km = meters / 1000;
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
  };

  const fmtDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0:00';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const activeEntries = useMemo(() => entries.filter(e => !e.isPause), [entries]);
  const maxVal = useMemo(() => Math.max(...activeEntries.map(e => e.value), 1), [activeEntries]);
  const minVal = useMemo(() => {
    const vals = activeEntries.map(e => e.value).filter(v => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  }, [activeEntries]);

  const skipZoom = useMemo(() => {
    const totalDuration = activeEntries.reduce((s, e) => s + e.duration, 0);
    const maxDuration = activeEntries.reduce((max, e) => Math.max(max, e.duration), 0);
    return (
      activeEntries.length <= 6 ||
      (totalDuration > 0 && maxDuration / totalDuration > 0.40)
    );
  }, [activeEntries]);

  const ZOOM_BAR_W = 36; // px per bar in zoomed mode
  const PAUSE_BAR_W = 8; // px for pause/rest bars in zoom mode
  const PAUSE_BAR_W_NORMAL = 5; // px for pause/rest bars in normal mode

  // Re-check scroll edges after layout changes
  useEffect(() => {
    const raf = requestAnimationFrame(checkScrollEdges);
    return () => cancelAnimationFrame(raf);
  }, [entries, selectedLapNumber]);

  // Scroll selected bar into centre when zoomed — math-based, no DOM measurement.
  // Skip entirely in skipZoom mode (bars stay at full proportional width, no scroll needed).
  useEffect(() => {
    if (selectedLapNumber == null || !scrollRef.current || skipZoom) return;
    const container = scrollRef.current;
    let leftOffset = 4; // px-1 padding
    for (const entry of entries) {
      if (String(entry.lapNumber) === String(selectedLapNumber)) break;
      leftOffset += entry.isPause ? PAUSE_BAR_W : ZOOM_BAR_W;
      leftOffset += 2; // gap-0.5
    }
    const scrollTarget = leftOffset + ZOOM_BAR_W / 2 - container.clientWidth / 2;
    requestAnimationFrame(() => {
      container.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
    });
  }, [selectedLapNumber, entries, skipZoom]);

  const barColor = (entry, isSelected) => {
    if (entry.isPause) return '#d1d5db';

    // Interval-type colouring (overrides metric colour when type is set)
    const itype = entry.intervalType;
    if (itype === 'warmup')   return isSelected ? '#d97706' : '#fbbf24'; // amber
    if (itype === 'cooldown') return isSelected ? '#0284c7' : '#38bdf8'; // sky
    if (itype === 'recovery') return isSelected ? '#6b7280' : '#d1d5db'; // gray

    // 'work' or no type → metric-based colour (existing logic)
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

  // Format a raw value (same unit as entry.value) as a short Y-axis label
  const fmtYValue = (val, withUnit = false) => {
    if (!firstActive || val <= 0) return '0';
    const m = firstActive.metric;
    if (m === 'power') return withUnit ? `${Math.round(val)}W` : `${Math.round(val)}`;
    if (m === 'speed') {
      const mps = val / 100;
      if (mps <= 0) return '—';
      const sec = 1000 / mps;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    if (m === 'pace') {
      const mps = val;
      if (mps <= 0) return '—';
      const sec = 100 / mps;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    return withUnit ? `${Math.round(val)}` : `${Math.round(val)}`;
  };

  // Y-axis: 4 evenly-spaced ticks from maxVal (top) down to ~0
  // Positions as percentages from the top of the h-32 container
  const yTicks = useMemo(() => {
    if (!activeEntries.length) return [];
    // Use minVal as the floor so the range is meaningful (not down to 0 for HR/pace)
    const floor = minVal > 0 ? minVal * 0.9 : 0;
    const ticks = [];
    const steps = 3; // 0%, 33%, 67%, 100% → 4 labels
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps; // 0 = top, 1 = bottom
      // height fraction of bar at this y position: 1 - frac
      const barHeightFrac = 1 - frac;
      // corresponding value: barHeightFrac = value / maxVal  → value = barHeightFrac * maxVal
      // But we want the label to be relative to the actual range [floor, maxVal]
      const val = floor + (maxVal - floor) * barHeightFrac;
      ticks.push({ topPct: frac * 100, val });
    }
    return ticks;
  }, [activeEntries, maxVal, minVal]);

  if (entries.length === 0) return null;

  // Don't switch to fixed-width zoomed layout when there are few laps or when one lap
  // dominates the chart — the fixed 36 px bars would make a single bar appear tiny.
  // Same heuristic as IntervalChart: ≤ 6 active bars, or the widest bar > 40 % of total duration.
  const isZoomed = selectedLapNumber != null && !skipZoom;
  const firstActive = activeEntries[0];

  // Selected entry data for the info row
  const selectedEntry = selectedLapNumber != null
    ? entries.find(e => String(e.lapNumber) === String(selectedLapNumber) && !e.isPause)
    : null;

  const handleDoubleClick = () => {
    if (onSelect) onSelect(null);
  };

  return (
    <div className="w-full mb-3">
      {/* Chart area with Y-axis */}
      <div className="flex gap-1 items-stretch">
        {/* Y-axis — 4 evenly-spaced absolute labels */}
        <div className="relative flex-shrink-0 w-10 h-32">
          {yTicks.map((tick, i) => (
            <span
              key={i}
              className="absolute right-0 text-[8px] text-gray-400 leading-none text-right"
              style={{
                top: `${tick.topPct}%`,
                transform: tick.topPct === 0 ? 'translateY(0)' : tick.topPct === 100 ? 'translateY(-100%)' : 'translateY(-50%)',
              }}
            >
              {fmtYValue(tick.val, i === 0)}
            </span>
          ))}
        </div>

        {/* Bars + lap labels */}
        <div className="flex-1 min-w-0 relative">
          <div
            ref={scrollRef}
            onDoubleClick={handleDoubleClick}
            onScroll={checkScrollEdges}
            className="rounded-lg overflow-x-auto"
            style={{ overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}
          >
            <div
              className="flex items-end gap-0.5 h-32 px-1"
              style={isZoomed
                ? { minWidth: `${entries.reduce((s, e) => s + (e.isPause ? PAUSE_BAR_W : ZOOM_BAR_W) + 2, 8)}px` }
                : { minWidth: '100%' }}
            >
              {entries.map((entry) => {
                const isSelected = selectedLapNumber != null && String(entry.lapNumber) === String(selectedLapNumber);

                if (entry.isPause) {
                  const pw = isZoomed ? PAUSE_BAR_W : PAUSE_BAR_W_NORMAL;
                  return (
                    <div
                      key={entry.lapNumber}
                      className="flex flex-col items-center justify-end shrink-0"
                      style={{ width: `${pw}px`, height: '100%' }}
                    >
                      <div className="w-full rounded-t" style={{ height: '8%', minHeight: '3px', backgroundColor: '#d1d5db' }} />
                    </div>
                  );
                }
                const rawPct = Math.max((entry.value / maxVal) * 100, 8);
                const heightPct = isZoomed
                  ? (isSelected ? 100 : Math.max((entry.value / maxVal) * 82, 6))
                  // skipZoom: give selected bar a subtle 8 % height boost so it stands out
                  : (skipZoom && isSelected ? Math.min(rawPct * 1.08, 100) : rawPct);

                return (
                  <button
                    type="button"
                    key={entry.lapNumber}
                    ref={isSelected ? selectedBarRef : null}
                    onClick={() => onSelect && onSelect(isSelected ? null : entry.lapNumber)}
                    title={`Lap ${entry.lapNumber}: ${fmtLabel(entry)}${entry.lactate != null ? ` · La ${entry.lactate.toFixed(1)}` : ''}`}
                    className="flex flex-col items-center justify-end group relative focus:outline-none"
                    style={isZoomed
                      ? { width: `${ZOOM_BAR_W}px`, minWidth: `${ZOOM_BAR_W}px`, height: '100%', flexShrink: 0 }
                      : { flex: `${entry.duration} 1 0%`, minWidth: '2px', height: '100%' }}
                  >
                    {/* Bar — label + lactate dot live inside */}
                    <div
                      className="w-full rounded-t relative overflow-hidden transition-[height] duration-200"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: barColor(entry, isSelected),
                        opacity: isZoomed
                          ? (isSelected ? 1 : 0.55)
                          : (selectedLapNumber != null ? (isSelected ? 1 : 0.60) : 0.75),
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
              style={isZoomed
                ? { minWidth: `${entries.reduce((s, e) => s + (e.isPause ? PAUSE_BAR_W : ZOOM_BAR_W) + 2, 8)}px` }
                : { minWidth: '100%' }}
            >
              {(() => {
                const n = activeEntries.length;
                const sparseSet = new Set([
                  activeEntries[0]?.lapNumber,
                  activeEntries[Math.round(n * 0.25)]?.lapNumber,
                  activeEntries[Math.round(n * 0.5)]?.lapNumber,
                  activeEntries[Math.round(n * 0.75)]?.lapNumber,
                  activeEntries[n - 1]?.lapNumber,
                ]);
                return entries.map((entry) => {
                if (entry.isPause) return (
                  <div key={entry.lapNumber} style={{ width: isZoomed ? `${PAUSE_BAR_W}px` : `${PAUSE_BAR_W_NORMAL}px`, flexShrink: 0 }} />
                );
                const isSelected = String(entry.lapNumber) === String(selectedLapNumber);
                const cumDist = cumulativeDistMap.get(entry.lapNumber) || 0;
                const distLabel = fmtDist(cumDist);
                const showLabel = isZoomed ? isSelected : (isSelected || sparseSet.has(entry.lapNumber));
                return (
                  <div
                    key={entry.lapNumber}
                    className="text-center overflow-visible relative"
                    style={isZoomed
                      ? { width: `${ZOOM_BAR_W}px`, flexShrink: 0 }
                      : { flex: `${entry.duration} 1 0%`, minWidth: '2px' }}
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
          {/* Left fade — visible when scrolled right */}
          {scrollEdges.left && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent z-10 rounded-l-lg" />
          )}
          {/* Right fade + arrow — visible when more content to the right */}
          {scrollEdges.right && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 rounded-r-lg flex items-center justify-end pr-0.5">
              <span className="text-gray-400 text-[11px] leading-none select-none">›</span>
            </div>
          )}
        </div>
      </div>

      {/* Selected interval info row */}
      {selectedEntry && (
        <div className="flex items-center gap-2 px-1 mt-1.5 py-1 rounded-lg bg-gray-50 border border-gray-100">
          <span
            className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${barColor(selectedEntry, true)}22`, color: barColor(selectedEntry, true) }}
          >
            Lap {selectedEntry.lapNumber}
          </span>
          <span className="text-[10px] text-gray-700 font-medium leading-none">
            {fmtDuration(selectedEntry.duration)}
          </span>
          {selectedEntry.distanceM > 0 && (
            <span className="text-[10px] text-gray-500 leading-none">
              {fmtDist(selectedEntry.distanceM)}
            </span>
          )}
          <span className="text-[10px] font-semibold leading-none" style={{ color: barColor(selectedEntry, true) }}>
            {fmtLabel(selectedEntry)}
          </span>
          {selectedEntry.lactate != null && (
            <span className="text-[10px] text-violet-600 leading-none font-medium">
              La {selectedEntry.lactate.toFixed(1)}
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelect && onSelect(null)}
            className="ml-auto text-[10px] text-gray-400 hover:text-gray-600 leading-none font-semibold px-1"
          >✕</button>
        </div>
      )}

      {/* Legend row */}
      <div className="flex items-center justify-between px-1 mt-1 gap-2 flex-wrap">
        {/* Interval-type legend — only shown when multiple types are present */}
        {(() => {
          const types = [...new Set(entries.filter(e => !e.isPause && e.intervalType).map(e => e.intervalType))];
          const hasMultiple = types.length > 1;
          const TYPE_META = {
            warmup:   { label: 'Warm-up',   color: '#fbbf24' },
            work:     { label: 'Work',       color: '#74c0fc' },
            recovery: { label: 'Rest',       color: '#d1d5db' },
            cooldown: { label: 'Cool-down',  color: '#38bdf8' },
          };
          if (!hasMultiple) return (
            <span className="text-[10px] text-gray-400">
              {firstActive?.metric === 'power' ? '⚡ Avg power' :
               firstActive?.metric === 'pace' ? '🏊 Avg pace' :
               firstActive?.metric === 'speed' ? '🏃 Avg pace' : '❤️ Avg HR'}
            </span>
          );
          return (
            <div className="flex items-center gap-2 flex-wrap">
              {['warmup','work','recovery','cooldown'].filter(t => types.includes(t)).map(t => (
                <span key={t} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: TYPE_META[t].color }} />
                  {TYPE_META[t].label}
                </span>
              ))}
            </div>
          );
        })()}

        <div className="flex items-center gap-2">
          {entries.some(e => e.lactate != null) && (
            <span className="text-[10px] text-violet-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" /> lactate
            </span>
          )}
          {isZoomed && (
            <>
              <span className="text-[10px] text-gray-400">← →</span>
              <button
                type="button"
                onClick={() => onSelect && onSelect(null)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold leading-none"
              >✕</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
