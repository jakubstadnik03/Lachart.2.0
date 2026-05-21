import React, { useMemo, useRef, useEffect, useState } from 'react';

/**
 * LapsBarChart — Garmin Connect–style laps bar chart.
 *
 * Swim:  equal-width bars (each lap is the same unit distance), colour
 *        intensity mapped from light blue (slow) → dark navy (fast).
 *        Rest intervals render as a tiny stub at the very bottom.
 *
 * Run / Bike: duration-proportional bars (legacy behaviour), green for
 *        pace / purple for power / red for HR.
 */
export default function LapsBarChart({ laps = [], selectedLapNumber = null, onSelect, sport = '', disableZoom = false }) {
  const sportLower = (sport || '').toLowerCase();
  const isRun  = sportLower.includes('run') || sportLower === 'walk' || sportLower === 'hike';
  const isSwim = sportLower.includes('swim');

  const scrollRef = useRef(null);
  const outerRef  = useRef(null);
  const [outerW,      setOuterW]      = useState(0);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const checkScrollEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollEdges({
      left:  el.scrollLeft > 2,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    });
  };

  // ── Normalise lap data ──────────────────────────────────────────────────
  const entries = useMemo(() => {
    return laps.map((lap, i) => {
      const lapNumber  = lap?.lapNumber ?? (i + 1);
      const power      = lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? lap.averageWatts ?? 0;
      const hr         = lap.avgHeartRate ?? lap.avg_heart_rate ?? lap.average_heartrate ?? lap.averageHeartRate ?? 0;
      const rawSpeedMps = lap.avgSpeed ?? lap.average_speed ?? lap.avg_speed ?? lap.averageSpeed
                        ?? lap.enhancedAvgSpeed ?? lap.enhanced_avg_speed ?? lap.speed ?? 0;
      const distanceM  = Number(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
      const duration   = lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? 60;
      const speedMps   = rawSpeedMps > 0.05
        ? rawSpeedMps
        : ((isRun || isSwim) && distanceM > 0 && duration > 0 ? distanceM / duration : rawSpeedMps);
      const lactate    = lap.lactate ?? null;
      // Swim: intervals with < 10 m are rest / turn-around pauses
      const isPause    = isSwim && distanceM < 10;

      let value  = 0;
      let metric = 'hr';
      if (isPause)                              { value = 0;              metric = 'pause'; }
      else if (!isRun && !isSwim && power > 0) { value = power;          metric = 'power'; }
      else if ((isRun || isSwim) && speedMps > 0) {
        value  = speedMps;
        metric = isSwim ? 'pace' : 'speed';
      } else if (hr > 0)                        { value = hr;             metric = 'hr';    }

      const intervalType = lap.intervalType ?? null;
      return { lapNumber, value, metric, hr, power, speedMps, lactate, duration, distanceM, isPause, intervalType, lap };
    });
  }, [laps, isRun, isSwim]);

  const activeEntries = useMemo(() => entries.filter(e => !e.isPause), [entries]);
  const maxVal = useMemo(() => Math.max(...activeEntries.map(e => e.value), 1), [activeEntries]);
  const minVal = useMemo(() => {
    const vals = activeEntries.map(e => e.value).filter(v => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  }, [activeEntries]);

  // Floor for Y-axis and bar heights: gives better visual range than starting at 0
  const chartFloor = useMemo(() => (minVal > 0 ? minVal * 0.92 : 0), [minVal]);

  // For each active entry, intensity 0 = slowest, 1 = fastest (relative within the set)
  const intensityMap = useMemo(() => {
    const range = maxVal - minVal;
    const m = new Map();
    activeEntries.forEach(e => {
      m.set(e.lapNumber, range > 0 ? (e.value - minVal) / range : 0.5);
    });
    return m;
  }, [activeEntries, maxVal, minVal]);

  // ── Colours ───────────────────────────────────────────────────────────────
  // Swim: navy-to-light-blue gradient by pace intensity.
  // Other sports: flat metric colours (legacy).
  const swimBarColor = (entry, isSelected) => {
    if (entry.isPause) return '#e2e8f0'; // very light slate for rest stubs
    const intensity = intensityMap.get(entry.lapNumber) ?? 0.5;
    // light blue #bfdbfe (slow) → dark navy #1e3a8a (fast)
    const light = [191, 219, 254];
    const dark  = [ 30,  58, 138];
    const r = Math.round(light[0] + (dark[0] - light[0]) * intensity);
    const g = Math.round(light[1] + (dark[1] - light[1]) * intensity);
    const b = Math.round(light[2] + (dark[2] - light[2]) * intensity);
    const base = `rgb(${r},${g},${b})`;
    if (!isSelected) return base;
    // Selected: slightly lighter + brighter
    const sr = Math.min(255, r + 30);
    const sg = Math.min(255, g + 30);
    const sb = Math.min(255, b + 50);
    return `rgb(${sr},${sg},${sb})`;
  };

  const legacyBarColor = (entry, isSelected) => {
    if (entry.isPause) return '#d1d5db';
    const itype = entry.intervalType;
    if (itype === 'warmup')   return isSelected ? '#d97706' : '#fbbf24';
    if (itype === 'cooldown') return isSelected ? '#0284c7' : '#38bdf8';
    if (itype === 'recovery') return isSelected ? '#6b7280' : '#d1d5db';
    if (entry.lactate != null) return isSelected ? '#7c3aed' : '#a78bfa';
    if (entry.metric === 'power') return isSelected ? '#3b5bdb' : '#74c0fc';
    if (entry.metric === 'pace' || entry.metric === 'speed') return isSelected ? '#2f9e44' : '#8ce99a';
    return isSelected ? '#c92a2a' : '#ffa8a8';
  };

  const barColor = (entry, isSelected) =>
    isSwim ? swimBarColor(entry, isSelected) : legacyBarColor(entry, isSelected);

  // ── Formatters ────────────────────────────────────────────────────────────
  const fmtDist = (m) => {
    if (!m || m <= 0) return '';
    if (isSwim || m < 1000) return `${Math.round(m)}m`;
    const km = m / 1000;
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
  };

  const fmtDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0:00';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const min = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const fmtLabel = (entry) => {
    if (entry.isPause) return 'Rest';
    if (entry.metric === 'power') return `${Math.round(entry.power)}W`;
    if (entry.metric === 'pace') {
      const { speedMps } = entry;
      if (!speedMps) return '';
      const secPer100m = 100 / speedMps;
      const min = Math.floor(secPer100m / 60);
      const sec = Math.round(secPer100m % 60);
      return `${min}:${String(sec).padStart(2, '0')}/100m`;
    }
    if (entry.metric === 'speed') {
      const { speedMps } = entry;
      if (!speedMps) return '';
      if (isRun) {
        const secPerKm = 1000 / speedMps;
        const min = Math.floor(secPerKm / 60);
        const sec = Math.round(secPerKm % 60);
        return `${min}:${String(sec).padStart(2, '0')}/km`;
      }
      return `${(speedMps * 3.6).toFixed(1)} km/h`;
    }
    return `${Math.round(entry.hr)} bpm`;
  };

  // Y-axis ticks (4 labels, top → bottom).  For pace/speed we want the
  // faster value at the top (largest speed → smallest pace time).
  const firstActive = activeEntries[0];

  const fmtYValue = (val) => {
    if (!firstActive || val <= 0) return '';
    const m = firstActive.metric;
    if (m === 'power') return `${Math.round(val)}W`;
    if (m === 'speed') {
      const sec = 1000 / val;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    if (m === 'pace') {
      const sec = 100 / val;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    return `${Math.round(val)}`;
  };

  // Y-axis ticks: index 0 = top (max), index 4 = bottom (floor).
  // Plain values — rendered via flex-col justify-between so order = visual order.
  const yTicks = useMemo(() => {
    if (!activeEntries.length) return [];
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4; // 0 = top, 1 = bottom
      ticks.push(chartFloor + (maxVal - chartFloor) * (1 - frac));
    }
    return ticks;
  }, [activeEntries, maxVal, chartFloor]);

  // ── Zoom (non-swim only — swim uses equal-width bars) ─────────────────────
  const totalDuration = useMemo(() => entries.reduce((s, e) => s + e.duration, 0), [entries]);

  const skipZoom = useMemo(() => {
    if (disableZoom || isSwim) return true;
    const maxDur = activeEntries.reduce((max, e) => Math.max(max, e.duration), 0);
    return activeEntries.length <= 6 || (totalDuration > 0 && maxDur / totalDuration > 0.40);
  }, [activeEntries, disableZoom, isSwim, totalDuration]);

  const TARGET_SELECTED_PX = 90;

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setOuterW(entry.contentRect.width || el.clientWidth));
    ro.observe(el);
    setOuterW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const zoomedContainerW = useMemo(() => {
    if (selectedLapNumber == null || skipZoom) return null;
    const selEntry = entries.find(e => String(e.lapNumber) === String(selectedLapNumber) && !e.isPause);
    if (!selEntry || selEntry.duration <= 0 || totalDuration <= 0) return null;
    const needed = TARGET_SELECTED_PX * (totalDuration / selEntry.duration);
    const base = outerW > 0 ? outerW : 400;
    return needed > base ? needed : null;
  }, [selectedLapNumber, entries, totalDuration, outerW, skipZoom]);

  // Re-check scroll edges after layout changes
  useEffect(() => {
    const raf = requestAnimationFrame(checkScrollEdges);
    return () => cancelAnimationFrame(raf);
  }, [entries, selectedLapNumber, zoomedContainerW]);

  // Scroll selected bar into view (non-swim only — swim uses equal-width so
  // the browser handles it via scrollIntoView on the selected element)
  const selectedBarRef = useRef(null);
  useEffect(() => {
    if (selectedLapNumber == null) return;
    if (isSwim) {
      // Equal-width bars — just scroll the element into view
      requestAnimationFrame(() => {
        selectedBarRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      });
      return;
    }
    if (!scrollRef.current || !zoomedContainerW) return;
    let cumDur = 0;
    for (const entry of entries) {
      if (String(entry.lapNumber) === String(selectedLapNumber)) break;
      cumDur += entry.duration;
    }
    const selEntry = entries.find(e => String(e.lapNumber) === String(selectedLapNumber));
    const selDur   = selEntry?.duration || 0;
    const barLeft  = (cumDur / totalDuration) * zoomedContainerW;
    const barW     = (selDur / totalDuration) * zoomedContainerW;
    const target   = barLeft + barW / 2 - scrollRef.current.clientWidth / 2;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    });
  }, [selectedLapNumber, entries, zoomedContainerW, totalDuration, isSwim]);

  // Cumulative distances for legacy x-axis labels — must be before early return
  const cumulativeDistMap = useMemo(() => {
    let acc = 0;
    const map = new Map();
    entries.forEach(e => { acc += e.distanceM; map.set(e.lapNumber, acc); });
    return map;
  }, [entries]);

  if (entries.length === 0) return null;

  const isZoomed  = !!zoomedContainerW;
  const innerStyle = zoomedContainerW ? { minWidth: `${zoomedContainerW}px` } : { minWidth: '100%' };

  const selectedEntry = selectedLapNumber != null
    ? entries.find(e => String(e.lapNumber) === String(selectedLapNumber) && !e.isPause)
    : null;

  // ── Chart height: swim gets a taller canvas to better match Garmin ───────
  const CHART_H_CLASS = isSwim ? 'h-48' : 'h-32'; // 192px vs 128px
  const CHART_H_PX    = isSwim ? 192 : 128;

  // ── Swim bar width: fixed pixel width so bars are uniform ─────────────────
  // 28px bar + 2px gap looks close to the Garmin screenshot on a phone screen.
  const SWIM_BAR_W   = 28;
  const SWIM_GAP_W   = 2;
  const SWIM_PAUSE_W = 6;

  return (
    <div className="w-full mb-3">
      {/* Chart area with Y-axis */}
      <div className="flex items-start" style={{ gap: isSwim ? 6 : 4 }}>

        {/* Y-axis — flex-col top→bottom so index 0 (max) is visually at top */}
        <div
          className="flex-shrink-0 w-10 flex flex-col justify-between"
          style={{ height: CHART_H_PX }}
        >
          {yTicks.map((val, i) => (
            <span
              key={i}
              className="text-[9px] text-gray-400 leading-none text-right tabular-nums block w-full"
            >
              {fmtYValue(val)}
            </span>
          ))}
        </div>

        {/* Scroll container */}
        <div ref={outerRef} className="flex-1 min-w-0 relative">
          <div
            ref={scrollRef}
            onScroll={checkScrollEdges}
            className="overflow-x-auto"
            style={{
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',       // Firefox
              msOverflowStyle: 'none',      // IE
            }}
          >
            {/* Swim: fixed-width equal bars */}
            {isSwim ? (
              <div
                className="flex items-end"
                style={{
                  height: CHART_H_PX,
                  gap: SWIM_GAP_W,
                  paddingTop: 4,   // small top padding so tallest bar doesn't clip
                }}
              >
                {entries.map((entry) => {
                  const isSelected = selectedLapNumber != null && String(entry.lapNumber) === String(selectedLapNumber);

                  if (entry.isPause) {
                    return (
                      <div
                        key={entry.lapNumber}
                        style={{ width: SWIM_PAUSE_W, flexShrink: 0, height: '100%' }}
                        className="flex items-end"
                      >
                        {/* Tiny stub at the very bottom */}
                        <div
                          style={{
                            width: '100%',
                            height: 4,
                            borderRadius: '2px 2px 0 0',
                            backgroundColor: '#cbd5e1',
                          }}
                        />
                      </div>
                    );
                  }

                  // Height: fraction of chart height, based on speed value.
                  // Bottom 4 px reserved for the selected-indicator line.
                  const usableH   = CHART_H_PX - 4;
                  const floor     = minVal > 0 ? minVal * 0.92 : 0;
                  const range     = maxVal - floor;
                  const frac      = range > 0 ? Math.max((entry.value - floor) / range, 0.05) : 0.5;
                  const barH      = Math.round(frac * usableH);
                  const color     = barColor(entry, isSelected);

                  const hasLactate = entry.lactate != null;

                  return (
                    <button
                      type="button"
                      key={entry.lapNumber}
                      ref={isSelected ? selectedBarRef : null}
                      onClick={() => onSelect && onSelect(isSelected ? null : entry.lapNumber)}
                      title={`Lap ${entry.lapNumber}: ${fmtLabel(entry)}${hasLactate ? ` · La ${entry.lactate.toFixed(1)}` : ''}`}
                      className="relative flex flex-col items-center justify-end focus:outline-none shrink-0 group"
                      style={{ width: SWIM_BAR_W, height: CHART_H_PX }}
                    >
                      {/* Lactate value floating above bar */}
                      {hasLactate && (
                        <span
                          className="absolute text-[8px] font-extrabold text-violet-500 leading-none w-full text-center"
                          style={{ bottom: barH + 3 }}
                        >
                          {entry.lactate.toFixed(1)}
                        </span>
                      )}
                      {/* Bar */}
                      <div
                        style={{
                          width: '100%',
                          height: barH,
                          backgroundColor: color,
                          borderRadius: hasLactate ? '0 0 0 0' : '4px 4px 0 0',
                          transition: 'height 0.2s ease, background-color 0.15s ease',
                          opacity: selectedLapNumber != null && !isSelected ? 0.6 : 1,
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Violet cap on top of bar when lactate is recorded */}
                        {hasLactate && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              height: 4,
                              borderRadius: '4px 4px 0 0',
                              backgroundColor: '#7c3aed',
                            }}
                          />
                        )}
                      </div>
                      {/* Selected indicator: underline at the very bottom (Garmin style) */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: '10%',
                          right: '10%',
                          height: 3,
                          borderRadius: 2,
                          backgroundColor: isSelected ? color : 'transparent',
                          transition: 'background-color 0.15s',
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Non-swim: original duration-proportional bars */
              <div
                className={`flex items-end gap-0.5 ${CHART_H_CLASS} px-1`}
                style={innerStyle}
              >
                {entries.map((entry) => {
                  const isSelected = selectedLapNumber != null && String(entry.lapNumber) === String(selectedLapNumber);

                  if (entry.isPause) {
                    return (
                      <div key={entry.lapNumber} className="flex flex-col items-center justify-end shrink-0" style={{ width: 5, height: '100%' }}>
                        <div className="w-full rounded-t" style={{ height: '8%', minHeight: 3, backgroundColor: '#d1d5db' }} />
                      </div>
                    );
                  }

                  const range = maxVal - chartFloor;
                  const rawPct = range > 0 ? Math.max((entry.value - chartFloor) / range * 100, 8) : 50;
                  const heightPct = isSelected ? Math.min(rawPct * 1.08, 100) : rawPct;

                  return (
                    <button
                      type="button"
                      key={entry.lapNumber}
                      onClick={() => onSelect && onSelect(isSelected ? null : entry.lapNumber)}
                      title={`Lap ${entry.lapNumber}: ${fmtLabel(entry)}${entry.lactate != null ? ` · La ${entry.lactate.toFixed(1)}` : ''}`}
                      className="flex flex-col items-center justify-end group relative focus:outline-none"
                      style={{ flex: `${entry.duration} 1 0%`, minWidth: 2, height: '100%' }}
                    >
                      <div
                        className="w-full rounded-t relative overflow-hidden transition-[height,opacity] duration-200"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: barColor(entry, isSelected),
                          opacity: selectedLapNumber != null ? (isSelected ? 1 : 0.55) : 0.82,
                          boxShadow: isSelected
                            ? `0 0 0 2px ${barColor(entry, true)}, 0 2px 8px ${barColor(entry, true)}60`
                            : 'none',
                        }}
                      >
                        {/* When selected: show metric label; when has lactate: show value */}
                        {isSelected && entry.lactate == null && (
                          <span className="absolute inset-x-0 top-1 text-[8px] font-bold leading-none text-center truncate px-0.5 text-white">
                            {fmtLabel(entry)}
                          </span>
                        )}
                        {isSelected && entry.lactate != null && (
                          <span className="absolute inset-x-0 top-0.5 text-[8px] font-extrabold leading-none text-center text-white">
                            {entry.lactate.toFixed(1)} · {fmtLabel(entry)}
                          </span>
                        )}
                        {/* Lactate value always visible on bar when not selected */}
                        {entry.lactate != null && !isSelected && (
                          <span className="absolute inset-x-0 top-1 text-[8px] font-extrabold leading-none text-center text-white">
                            {entry.lactate.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* X-axis labels */}
            {isSwim ? (
              /* Swim: lap numbers centred under each bar */
              <div
                className="flex items-start mt-1"
                style={{ gap: SWIM_GAP_W }}
              >
                {entries.map((entry) => {
                  if (entry.isPause) return (
                    <div key={entry.lapNumber} style={{ width: SWIM_PAUSE_W, flexShrink: 0 }} />
                  );
                  const isSelected = String(entry.lapNumber) === String(selectedLapNumber);
                  // Show every label when narrow, or every nth when many laps
                  const total = activeEntries.length;
                  const nth   = total > 20 ? 5 : total > 10 ? 2 : 1;
                  const idx   = activeEntries.findIndex(e => e.lapNumber === entry.lapNumber);
                  const show  = isSelected || idx % nth === 0 || idx === total - 1;
                  return (
                    <div
                      key={entry.lapNumber}
                      style={{ width: SWIM_BAR_W, flexShrink: 0 }}
                      className="text-center"
                    >
                      {show && (
                        <span
                          className={`text-[9px] leading-none tabular-nums ${
                            isSelected ? 'font-bold text-blue-600' : 'text-gray-400'
                          }`}
                        >
                          {entry.lapNumber}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Non-swim: distance-based x-axis labels (legacy) */
              <div className="flex items-start gap-0.5 px-1 mt-0.5" style={innerStyle}>
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
                    if (entry.isPause) return <div key={entry.lapNumber} style={{ width: 5, flexShrink: 0 }} />;
                    const isSelected = String(entry.lapNumber) === String(selectedLapNumber);
                    const cumDist    = cumulativeDistMap.get(entry.lapNumber) || 0;
                    const distLabel  = fmtDist(cumDist);
                    const show       = isSelected || sparseSet.has(entry.lapNumber);
                    return (
                      <div key={entry.lapNumber} className="text-center overflow-visible relative" style={{ flex: `${entry.duration} 1 0%`, minWidth: 2 }}>
                        {show && (
                          <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] leading-none font-medium ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
                            {distLabel || entry.lapNumber}
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Left / right fade scrolling hints */}
          {scrollEdges.left && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent z-10" />
          )}
          {scrollEdges.right && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 flex items-center justify-end pr-0.5">
              <span className="text-gray-400 text-[11px] leading-none select-none">›</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Selected lap info row ──────────────────────────────────────────── */}
      {selectedEntry && (
        <div className="flex items-center gap-2 px-2 mt-2 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
          {isSwim && (
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: barColor(selectedEntry, true) }}
            />
          )}
          <span className="text-[11px] font-bold text-gray-700 leading-none">
            {isSwim ? `${selectedEntry.lapNumber}. kolo` : `Lap ${selectedEntry.lapNumber}`}
          </span>
          {selectedEntry.distanceM > 0 && (
            <span className="text-[11px] text-gray-500 leading-none">
              {fmtDist(selectedEntry.distanceM)}
            </span>
          )}
          <span className="text-[11px] font-semibold leading-none" style={{ color: isSwim ? '#1e40af' : barColor(selectedEntry, true) }}>
            {fmtLabel(selectedEntry)}
          </span>
          <span className="text-[11px] text-gray-500 leading-none">
            {fmtDuration(selectedEntry.duration)}
          </span>
          {selectedEntry.lactate != null && (
            <span className="text-[11px] text-violet-600 leading-none font-medium">
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

      {/* ── Legend / zoom hint ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 mt-1 gap-2 flex-wrap">
        {(() => {
          const types = [...new Set(entries.filter(e => !e.isPause && e.intervalType).map(e => e.intervalType))];
          const hasMultiple = types.length > 1;
          const TYPE_META = {
            warmup:   { label: 'Warm-up',  color: '#fbbf24' },
            work:     { label: 'Work',     color: '#74c0fc' },
            recovery: { label: 'Rest',     color: '#d1d5db' },
            cooldown: { label: 'Cool-down', color: '#38bdf8' },
          };
          if (!hasMultiple) return (
            <span className="text-[10px] text-gray-400">
              {firstActive?.metric === 'power' ? '⚡ Avg power' :
               firstActive?.metric === 'pace'  ? '🏊 Avg pace /100m' :
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
          {isSwim && activeEntries.length > 12 && (
            <span className="text-[10px] text-gray-400">scroll ← →</span>
          )}
          {isZoomed && (
            <>
              <span className="text-[10px] text-gray-400">scroll ← →</span>
              <button
                type="button"
                onClick={() => onSelect && onSelect(null)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold leading-none"
              >✕ reset</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
