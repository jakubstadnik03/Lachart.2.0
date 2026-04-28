import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  formatDuration,
  lapDistanceMetersForChart,
  lapDurationSecondsForChart,
  lapSpeedMpsForChart
} from '../../utils/fitAnalysisUtils';
import { useAuth } from '../../context/AuthProvider';
import { formatDistance } from '../../utils/unitsConverter';

// Treat very slow "running pace" as pause so it doesn't squash the Y axis (e.g. pauses between intervals).
// 20:00/km threshold => 1200 seconds per km.
const RUN_PAUSE_PACE_SECONDS = 20 * 60;
// Minimum speed to count as "moving" (m/s) – below this, time is not counted (stopped/pause).
const MOVING_SPEED_THRESHOLD_MPS = 0.14; // ~0.5 km/h

/**
 * Strava/Garmin sometimes store lap.distance as cumulative end-of-split position (1km, 2km, …).
 * Summing those as segment lengths inflates total (e.g. 45 km for a 9 km run). Convert to per-lap meters.
 */
function resolveLapSegmentDistancesMeters(laps, records, isRun, isSwim, lapTimeSource = 'fit') {
  if (!Array.isArray(laps) || laps.length === 0) return [];
  const raw = laps.map((l) => lapDistanceMetersForChart(l, lapTimeSource, isSwim));
  if (!isRun && !isSwim) return raw;

  const n = raw.length;
  const sumRaw = raw.reduce((a, b) => a + b, 0);
  const lastRaw = raw[n - 1] || 0;
  const streamTotal =
    Array.isArray(records) && records.length > 0
      ? Number(records[records.length - 1]?.distance) || 0
      : 0;

  const strictlyIncreasing = n >= 2 && raw.every((d, i) => i === 0 || d > raw[i - 1]);

  // Run: cumulative km auto-laps. Swim: cumulative pool / open-water split distances (50,100,150…).
  const minLastForTriangular = isSwim ? 20 : 400;
  let treatAsCumulative = false;
  if (strictlyIncreasing && lastRaw >= minLastForTriangular && n >= 2) {
    const expectedTriangular = (lastRaw * (n + 1)) / 2;
    const tol = isSwim ? lastRaw * 0.12 + n * 10 : lastRaw * 0.08 + n * 120;
    if (Math.abs(sumRaw - expectedTriangular) <= tol) {
      treatAsCumulative = true;
    }
  }
  const streamFloor = isSwim ? 30 : 250;
  if (!treatAsCumulative && streamTotal > streamFloor && lastRaw >= streamTotal * 0.65 && sumRaw > streamTotal * 1.2) {
    treatAsCumulative = true;
  }
  if (!treatAsCumulative && n >= 2 && streamTotal > streamFloor && sumRaw > streamTotal * 1.35) {
    treatAsCumulative = true;
  }
  const minLastForSumHeuristic = isSwim ? 80 : 1500;
  if (!treatAsCumulative && strictlyIncreasing && lastRaw > minLastForSumHeuristic && sumRaw > lastRaw * 1.4) {
    treatAsCumulative = true;
  }

  if (!treatAsCumulative) return raw;

  return raw.map((d, i) => {
    if (i === 0) return Math.max(0, d);
    const delta = d - raw[i - 1];
    return delta > 0 ? delta : 0;
  });
}

const IntervalChart = ({
  laps = [],
  sport = 'cycling',
  records = [],
  user = null,
  selectedLapNumber = null,
  onSelectLapNumber = null,
  highlightMetric = null,
  /** 'strava' = same duration/distance rules as Strava intervals table; 'fit' = LapsTable (moving_time first) */
  lapTimeSource = 'fit'
}) => {
  const { user: authUser } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [hoveredBar, setHoveredBar] = useState(null);
  const [clickedBarIndex, setClickedBarIndex] = useState(null); // Track clicked bar on mobile / external highlight
  const chartContainerRef = useRef(null);
  const chartScrollRef = useRef(null);
  const barRefs = useRef({});
  const lastTouchAtRef = useRef(0);
  const [xZoomScale, setXZoomScale] = useState(1);
  
  // Determine unit system from user profile or default to metric
  const unitSystem = (user || authUser)?.units?.distance || 'metric';
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Check for running - handle various formats: 'Run', 'running', 'VirtualRun', 'Walk', 'Hike', etc.
  const sportLower = (sport || '').toLowerCase();
  const isRun = sportLower.includes('run') || sportLower === 'walk' || sportLower === 'hike';
  const isSwim = sportLower.includes('swim');
  // Check if power data is available
  const hasPowerData = useMemo(() => {
    // For running we don't show power (pace-based swim/run charts).
    // For swimming, allow power if backend/intervals actually provide watts.
    if (isRun) return false;
    if (!laps || laps.length === 0) return false;
    return laps.some(lap => {
      const powerRaw = lap.average_watts ?? lap.avgPower ?? lap.averageWatts ?? 0;
      const power = Number(powerRaw);
      return Number.isFinite(power) && power > 0;
    });
  }, [laps, isRun]);

  // For running and swimming, default to pace; for cycling with power data, default to power; otherwise heartRate
  const [selectedMetric, setSelectedMetric] = useState(
    isRun || isSwim ? 'pace' : (hasPowerData ? 'power' : 'heartRate')
  );

  // When sport or available data changes (e.g. switching from run to bike, or to a different swim activity),
  // reset selected metric to a sensible default so swim/run always starts on pace.
  useEffect(() => {
    const defaultMetric = isRun || isSwim ? 'pace' : (hasPowerData ? 'power' : 'heartRate');
    setSelectedMetric(defaultMetric);
  }, [sport, isRun, isSwim, hasPowerData]);
  
  // Debug log

  // Running: use the same laps as the intervals table whenever they exist. Only synthesize ~1 km splits
  // from streams when there are zero laps (otherwise e.g. 3 Strava laps get replaced by 8+ km bars and wrong totals).
  const processedLaps = useMemo(() => {
    if (!isRun) return laps;
    if (laps.length > 0) return laps;
    if (!records || records.length === 0) return laps;

    // FIT uploads and Strava stream records use speed in m/s (same as velocity_smooth).
    const speedMps = (r) => {
      const s = Number(r.speed);
      if (!Number.isFinite(s) || s <= 0) return 0;
      return s;
    };
    // Compute moving time (seconds) from consecutive records – only count intervals where speed > threshold
    const movingTimeFromRecords = (recs) => {
      if (!recs || recs.length < 2) return 0;
      let moving = 0;
      for (let i = 1; i < recs.length; i++) {
        const prev = recs[i - 1];
        const curr = recs[i];
        const prevTs = prev.timestamp ? new Date(prev.timestamp).getTime() : 0;
        const currTs = curr.timestamp ? new Date(curr.timestamp).getTime() : 0;
        const dt = (currTs - prevTs) / 1000;
        if (dt <= 0) continue;
        const currSpeed = speedMps(curr);
        const prevSpeed = speedMps(prev);
        if (currSpeed >= MOVING_SPEED_THRESHOLD_MPS || prevSpeed >= MOVING_SPEED_THRESHOLD_MPS) {
          moving += dt;
        }
      }
      return moving;
    };
    // Filter to records where we're moving (for averages – exclude stopped time from pace/speed)
    const movingRecords = (recs) => recs.filter(r => speedMps(r) >= MOVING_SPEED_THRESHOLD_MPS);

    // Create km intervals from records
    const kmLaps = [];
    let currentKmRecords = [];
    let kmNumber = 1;
    let lastKmDistance = 0;
    
    records.forEach((record, i) => {
      // Get distance in meters
      const distance = record.distance || 0;
      
      if (distance >= kmNumber * 1000 && distance > lastKmDistance) {
        // We've reached a new km
        if (currentKmRecords.length > 0) {
          const movingTimeSec = movingTimeFromRecords(currentKmRecords);
          const movingRecs = movingRecords(currentKmRecords);
          const segStartDist = currentKmRecords[0].distance ?? 0;
          const segEndDist = currentKmRecords[currentKmRecords.length - 1].distance ?? 0;
          const segmentMeters = Math.max(0, segEndDist - segStartDist);
          // Stats only from moving records so pace/speed don't include stopped time
          const speeds = movingRecs.map((r) => speedMps(r)).filter((v) => v > 0);
          const heartRates = movingRecs.map(r => r.heartRate).filter(v => v && v > 0);
          const cadences = movingRecs.map(r => r.cadence).filter(v => v && v > 0);
          
          const avgSpeedMps = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
          const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;
          const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : 0;
          
          kmLaps.push({
            distance: segmentMeters,
            elapsed_time: movingTimeSec,
            moving_time: movingTimeSec,
            average_speed: avgSpeedMps,
            avgSpeed: avgSpeedMps * 3.6,
            average_heartrate: avgHeartRate,
            avgHeartRate: avgHeartRate,
            average_cadence: avgCadence,
            avgCadence: avgCadence,
            lapNumber: kmNumber
          });
        }
        
        lastKmDistance = distance;
        kmNumber++;
        currentKmRecords = [record];
      } else {
        currentKmRecords.push(record);
      }
    });
    
    // Add last incomplete km if it has enough data (at least 500m)
    if (currentKmRecords.length > 10) {
      const lastRecord = currentKmRecords[currentKmRecords.length - 1];
      const lastDistance = lastRecord.distance || 0;
      if (lastDistance >= (kmNumber - 1) * 1000 + 500) {
        const movingTimeSec = movingTimeFromRecords(currentKmRecords);
        const movingRecs = movingRecords(currentKmRecords);
        const segStartDist = currentKmRecords[0].distance ?? 0;
        const segmentMeters = Math.max(0, lastDistance - segStartDist);
        const speeds = movingRecs.map((r) => speedMps(r)).filter((v) => v > 0);
        const heartRates = movingRecs.map(r => r.heartRate).filter(v => v && v > 0);
        const cadences = movingRecs.map(r => r.cadence).filter(v => v && v > 0);
        
        const avgSpeedMps = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
        const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;
        const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : 0;
        
        kmLaps.push({
          distance: segmentMeters,
          elapsed_time: movingTimeSec,
          moving_time: movingTimeSec,
          average_speed: avgSpeedMps,
          avgSpeed: avgSpeedMps * 3.6,
          average_heartrate: avgHeartRate,
          avgHeartRate: avgHeartRate,
          average_cadence: avgCadence,
          avgCadence: avgCadence,
          lapNumber: kmNumber
        });
      }
    }
    
    return kmLaps.length > 0 ? kmLaps : laps;
  }, [laps, records, isRun]);

  // Prepare data for the chart
  const chartData = useMemo(() => {
    if (!processedLaps || processedLaps.length === 0) return { bars: [], maxValue: 0, minValue: 0, totalDistance: 0 };

    // For running and swimming, don't filter by power - show all intervals
    // For cycling, filter out laps with no power or very low power (< 30W)
    const filteredLaps = (isRun || isSwim)
      ? processedLaps 
      : processedLaps.filter((lap) => {
      const power = lap.average_watts || lap.avgPower || 0;
      return power >= 30;
    });

    const segmentDistancesM = resolveLapSegmentDistancesMeters(filteredLaps, records, isRun, isSwim, lapTimeSource);

    const bars = filteredLaps.map((lap, originalIndex) => {
      // Prefer explicit lapNumber if available; otherwise fall back to array index
      const displayIndex = (lap?.lapNumber ?? lap?.lap_number ?? null) ?? (originalIndex + 1);
      
      let value = 0;
      let unit = '';

      let segmentMeters = Number(segmentDistancesM[originalIndex]);
      if (!Number.isFinite(segmentMeters) || segmentMeters <= 0) {
        segmentMeters = lapDistanceMetersForChart(lap, lapTimeSource, isSwim);
      }
      if (isSwim && (!Number.isFinite(segmentMeters) || segmentMeters <= 0)) {
        const tSec = lapDurationSecondsForChart(lap, lapTimeSource);
        const sMps = lapSpeedMpsForChart(lap);
        if (tSec > 0 && sMps > 0) segmentMeters = sMps * tSec;
      }

      switch (selectedMetric) {
        case 'power':
          value = lap.average_watts || lap.avgPower || 0;
          unit = 'W';
          break;
        case 'heartRate':
          value = lap.average_heartrate || lap.avgHeartRate || 0;
          unit = 'bpm';
          break;
        case 'speed': {
          const mps = lapSpeedMpsForChart(lap);
          if (unitSystem === 'imperial') {
            value = mps * 3.6 * 0.621371;
            unit = 'mph';
          } else {
            value = mps * 3.6;
            unit = 'km/h';
          }
          break;
        }
        case 'cadence':
          value = lap.average_cadence || lap.avgCadence || 0;
          unit = 'rpm';
          break;
        case 'pace': {
          // Same m/s as intervals table (Strava: average_speed); swim fallback from distance/time
          let speedMps = lapSpeedMpsForChart(lap);
          if (isSwim && (!Number.isFinite(speedMps) || speedMps <= 0) && segmentMeters > 0) {
            const tSec = lapDurationSecondsForChart(lap, lapTimeSource);
            if (tSec > 0) speedMps = segmentMeters / tSec;
          }
          if (speedMps > 0) {
            if (isSwim) {
              if (unitSystem === 'imperial') {
                value = Math.round(109.361 / speedMps); // seconds per 100yd for swimming
                unit = 's/100yd';
              } else {
                value = Math.round(100 / speedMps); // seconds per 100m for swimming
                unit = 's/100m';
              }
            } else {
              if (unitSystem === 'imperial') {
                value = Math.round(1609.34 / speedMps); // seconds per mile for running
                unit = 's/mile';
              } else {
                value = Math.round(1000 / speedMps); // seconds per km internally (axis shows M:SS)
                unit = unitSystem === 'imperial' ? 'min/mi' : 'min/km';
              }
            }
          } else {
            value = 0;
            if (isSwim) {
              unit = unitSystem === 'imperial' ? 's/100yd' : 's/100m';
            } else {
              unit = unitSystem === 'imperial' ? 'min/mi' : 'min/km';
            }
          }
          // For running: if pace is slower than threshold, treat as pause (value=0)
          const pauseThreshold = unitSystem === 'imperial' ? (20 * 60 * 1.60934) : RUN_PAUSE_PACE_SECONDS; // ~32:00/mile for imperial
          if (isRun && !isSwim && value > pauseThreshold) {
            value = 0;
          }
          break;
        }
        default:
          value = 0;
      }

      // Bar width & tooltips: segment meters only (avoid raw lap.distance km-heuristic bugs on swim)
      const distance =
        segmentMeters > 0
          ? segmentMeters
          : (Number(segmentDistancesM[originalIndex]) > 0
              ? Number(segmentDistancesM[originalIndex])
              : lapDistanceMetersForChart(lap, lapTimeSource, isSwim));

      let speedMpsPause = lapSpeedMpsForChart(lap);
      if (isSwim && (!Number.isFinite(speedMpsPause) || speedMpsPause <= 0) && segmentMeters > 0) {
        const tSec = lapDurationSecondsForChart(lap, lapTimeSource);
        if (tSec > 0) speedMpsPause = segmentMeters / tSec;
      }
      // For swim: also treat as pause when distance is 0 (rest laps with no movement)
      const isPause = speedMpsPause <= 0.1 || value === 0 || (selectedMetric === 'pace' && value === 0) || (isSwim && distance === 0);
      
      // Get max heart rate for this interval
      const maxHeartRate = lap.max_heartrate || lap.maxHeartRate || lap.average_heartrate || lap.avgHeartRate || 0;

      return {
        lapNumber: displayIndex,
        value: value,
        unit: unit,
        distance: distance, // Use distance instead of duration
        isPause: isPause,
        maxHeartRate: maxHeartRate,
        lap: lap
      };
    });

    const values = bars.map(b => b.value).filter(v => v > 0);
    const maxValue = values.length > 0 ? Math.max(...values) : 100;
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    // Exclude pauses from totalDistance so active laps fill proportional width correctly
    const totalDistance = bars.filter(b => !b.isPause).reduce((sum, b) => sum + b.distance, 0);

    // Group intervals by similar values (within 5% tolerance)
    // Pauses (isPause = true) get special group -1 (gray, minimum height)
    const tolerance = (maxValue - minValue) * 0.05 || 1;
    const groups = [];
    bars.forEach((bar, index) => {
      if (bar.isPause || bar.value <= 0) {
        groups.push({ groupId: -1, bars: [index] });
        return;
      }
      
      // Find existing group with similar value
      let foundGroup = false;
      for (const group of groups) {
        if (group.groupId === -1) continue;
        const groupValue = bars[group.bars[0]].value;
        if (Math.abs(bar.value - groupValue) <= tolerance) {
          group.bars.push(index);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        groups.push({ groupId: groups.length, bars: [index] });
      }
    });

    // Assign group IDs to bars
    bars.forEach((bar, index) => {
      const group = groups.find(g => g.bars.includes(index));
      bar.groupId = group ? group.groupId : -1;
    });

    return { bars, maxValue, minValue, totalDistance, groups };
  }, [processedLaps, selectedMetric, isRun, isSwim, unitSystem, records, lapTimeSource]);

  // Determine which bar corresponds to selectedLapNumber (after chartData is defined)
  const selectedBarIndex = useMemo(() => {
    if (!selectedLapNumber || !Array.isArray(chartData?.bars)) return -1;
    return chartData.bars.findIndex(b => String(b.lapNumber) === String(selectedLapNumber));
  }, [chartData, selectedLapNumber]);

  // Count of real (non-pause) bars — used to decide whether auto-zoom makes sense.
  const nonPauseBarCount = useMemo(() => {
    return chartData?.bars?.filter(b => !b.isPause).length || 0;
  }, [chartData]);

  // True when zoom would be counterproductive:
  //   • ≤ 6 bars  → bars are already wide, zoom just scrolls them off-screen
  //   • any single bar is > 40% of total distance → it would overflow the viewport after 2.4× zoom
  const skipAutoZoom = useMemo(() => {
    if (nonPauseBarCount <= 6) return true;
    if (!chartData?.totalDistance || chartData.totalDistance === 0) return nonPauseBarCount <= 6;
    const widestFraction = (chartData.bars || [])
      .filter(b => !b.isPause)
      .reduce((max, b) => Math.max(max, b.distance / chartData.totalDistance), 0);
    return widestFraction > 0.40;
  }, [nonPauseBarCount, chartData]);

  // Auto-highlight best bar when coming from Power Radar / SpiderChart
  useEffect(() => {
    if (!highlightMetric || !chartData || !chartData.bars || chartData.bars.length === 0) return;

    const { bars } = chartData;
    let bestIndex = null;
    let bestScore = -Infinity;

    bars.forEach((bar, index) => {
      const lap = bar.lap || {};
      const avgWatts = Number(lap.average_watts || lap.avgPower || 0);
      const durationSec = lapDurationSecondsForChart(lap, lapTimeSource);

      if (!avgWatts || avgWatts <= 0) return;

      // Base score = avg power
      let score = avgWatts;

      // Lightly weight by duration depending on metric key
      if (highlightMetric === 'sprint5s') {
        // prefer short sprints
        const durPenalty = durationSec > 30 ? durationSec / 30 : 1;
        score = avgWatts / durPenalty;
      } else if (highlightMetric === 'attack1min') {
        const target = 60;
        const diff = Math.abs(durationSec - target);
        const durFactor = Math.max(0.5, 1 - diff / 60);
        score = avgWatts * durFactor;
      } else if (highlightMetric === 'vo2max5min') {
        const target = 300;
        const diff = Math.abs(durationSec - target);
        const durFactor = Math.max(0.5, 1 - diff / 180);
        score = avgWatts * durFactor;
      } else if (highlightMetric === 'threshold20min') {
        const target = 1200;
        const diff = Math.abs(durationSec - target);
        const durFactor = Math.max(0.5, 1 - diff / 600);
        score = avgWatts * durFactor;
      } else if (highlightMetric === 'endurance60min') {
        const target = 3600;
        const diff = Math.abs(durationSec - target);
        const durFactor = Math.max(0.5, 1 - diff / 1200);
        score = avgWatts * durFactor;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex !== null) {
      setClickedBarIndex(bestIndex);
      const bestBar = chartData.bars[bestIndex];
      setHoveredBar({ bar: bestBar, index: bestIndex, widthPercent: chartData.totalDistance > 0 ? (bestBar.distance / chartData.totalDistance * 100) : 0 });
      if (onSelectLapNumber && bestBar?.lapNumber) {
        onSelectLapNumber(bestBar.lapNumber);
      }
    }
  }, [highlightMetric, chartData, onSelectLapNumber, lapTimeSource]);

  // If parent selects a lap (e.g., click in LapsTable), highlight it here
  useEffect(() => {
    if (!selectedLapNumber) return;
    const idx = chartData?.bars?.findIndex(b => String(b.lapNumber) === String(selectedLapNumber));
    if (idx === -1 || idx == null) return;
    setClickedBarIndex(idx);
    setHoveredBar({ bar: chartData.bars[idx], index: idx, widthPercent: 0 });
    // Don't auto-zoom when bars are few/wide — they should stay stretched to full width
    if (!skipAutoZoom) {
      setXZoomScale(2.4);
    }
  }, [selectedLapNumber, chartData, skipAutoZoom]);

  useEffect(() => {
    if (clickedBarIndex == null) {
      setXZoomScale(1);
      return;
    }

    // Few / wide bars: always keep zoom at 1 so bars stay stretched to full width.
    // Actively reset in case xZoomScale was left at 2.4 from a previous workout.
    if (skipAutoZoom) {
      setXZoomScale(1);
      // Also scroll back to the start so nothing appears "cut off"
      if (chartScrollRef.current) {
        chartScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }
      return;
    }

    setXZoomScale((prev) => Math.max(prev, 2.4));

    const scrollContainer = chartScrollRef.current;
    const barElement = barRefs.current?.[clickedBarIndex];
    if (!scrollContainer || !barElement) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const barRect = barElement.getBoundingClientRect();
    const targetLeft =
      scrollContainer.scrollLeft +
      (barRect.left - containerRect.left) -
      (containerRect.width / 2) +
      (barRect.width / 2);

    scrollContainer.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth'
    });
  }, [clickedBarIndex, xZoomScale, skipAutoZoom]);

  // When the chart switches to "few bars" mode (e.g. user opens a different workout that
  // has only 1–6 laps while the component was already zoomed in), immediately reset the
  // zoom so the bars stay stretched rather than appearing narrow.
  useEffect(() => {
    if (!skipAutoZoom) return;
    setXZoomScale(1);
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [skipAutoZoom]);

  // Close "locked" tooltip when clicking/tapping outside the chart
  useEffect(() => {
    if (clickedBarIndex == null) return;

    const handlePointerDown = (e) => {
      const container = chartContainerRef.current;
      if (!container) return;
      if (container.contains(e.target)) return; // inside chart -> handled by bar click

      setClickedBarIndex(null);
      setHoveredBar(null);
      if (onSelectLapNumber) onSelectLapNumber(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [clickedBarIndex, onSelectLapNumber]);

  // (mobile) We keep chart static; bar clicks only update selectedLapNumber and row highlight below.

  const getMetricColor = () => {
    switch (selectedMetric) {
      case 'power': return '#a855f7'; // lighter purple (purple-500)
      case 'heartRate': return '#E05347'; // red
      case 'speed': return '#599FD0'; // secondary
      case 'cadence': return '#6b7280'; // gray
      case 'pace': return '#4BA87D'; // greenos
      default: return '#a855f7'; // lighter purple
    }
  };

  // Get color for a bar based on its group and value
  const getBarColor = (bar, maxValue, minValue, groups) => {
    const baseColor = getMetricColor();
    if (bar.value <= 0 || bar.groupId === -1) {
      return '#e5e7eb'; // gray for zero/negative values
    }
    
    // Find the group this bar belongs to
    const group = groups.find(g => g.groupId === bar.groupId);
    if (!group) {
      // Fallback: use value-based color
      const normalizedValue = maxValue > minValue 
        ? (bar.value - minValue) / (maxValue - minValue)
        : 0.5;
      const hex = baseColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const hsl = rgbToHsl(r, g, b);
      // Higher value = darker (more saturated, less lightness) for all metrics
      const saturation = 0.4 + (normalizedValue * 0.6); // Range from 0.4 to 1.0 (higher = more saturated/darker)
      const lightness = 0.7 - (normalizedValue * 0.4); // Range from 0.7 to 0.3 (higher value = lower lightness = darker)
      return `hsl(${hsl.h}, ${saturation * 100}%, ${lightness * 100}%)`;
    }
    
    // Get the representative value for this group (average of group values)
    const groupBars = group.bars.map(idx => chartData.bars[idx]).filter(b => b.value > 0);
    const groupAvgValue = groupBars.length > 0
      ? groupBars.reduce((sum, b) => sum + b.value, 0) / groupBars.length
      : bar.value;
    
    // Calculate saturation based on group average value (higher value = more saturated)
    const normalizedValue = maxValue > minValue 
      ? (groupAvgValue - minValue) / (maxValue - minValue)
      : 0.5;
    
    // Convert hex to RGB
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Convert to HSL
    const hsl = rgbToHsl(r, g, b);
    
    // Higher value = darker (more saturated, less lightness) for all metrics
    const saturation = 0.4 + (normalizedValue * 0.6); // Range from 0.4 to 1.0 (higher = more saturated/darker)
    const lightness = 0.7 - (normalizedValue * 0.4); // Range from 0.7 to 0.3 (higher value = lower lightness = darker)
    
    return `hsl(${hsl.h}, ${saturation * 100}%, ${lightness * 100}%)`;
  };

  // Helper to convert RGB to HSL
  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
        default: h = 0; break;
      }
    }
    return { h: h * 360, s, l };
  };

  /**
   * Y-axis domain for lap charts.
   *
   * For PACE (inverted axis — fast = top, slow = bottom):
   *   - Fast end (adjustedMinValue): fastest lap − small padding
   *   - Slow end (adjustedMaxValue): max of "non-outlier" laps × 1.15 + 20 s
   *     where "outlier" = pace > median × 1.2.
   *     This means a single very slow recovery lap (18:31/km) won't stretch the whole
   *     axis — it just renders as a very short bar pinned to the bottom.
   *
   * For other metrics (power, HR, speed, cadence):
   *   - Mean-centred symmetric domain so typical laps sit mid-chart.
   *
   * @param {number[]} values — lap metric values (>0)
   * @param {'pace'|'heartRate'|'power'|'speed'|'cadence'} metric
   */
  const symmetricAxisFromMean = (values, metric) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    if (metric === 'pace') {
      const lo = sorted[0];
      const median = sorted[Math.floor(n / 2)];

      // Any lap slower than median × 1.2 is considered a clear recovery/rest outlier.
      const outlierThreshold = median * 1.2;
      const nonOutliers = sorted.filter(v => v <= outlierThreshold);
      // Fallback: if filtering removes everything, use the median itself.
      const effectiveMax = nonOutliers.length > 0
        ? nonOutliers[nonOutliers.length - 1]
        : median;

      // Slow axis end: effectiveMax + 15 % + 20 s flat buffer
      const slowEnd = effectiveMax * 1.15 + 20;

      // Fast axis end: fastest lap − 8 % − 5 s buffer, minimum 22 s/km (≈ 0:22/km)
      const fastEnd = Math.max(22, lo * 0.92 - 5);

      return { adjustedMinValue: fastEnd, adjustedMaxValue: slowEnd };
    }

    // ── Non-pace metrics: mean-centred symmetric domain ──
    const lo = sorted[0];
    const hi = sorted[n - 1];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spanData = hi - lo;
    const minHalf = Math.max((hi + lo) * 0.02, spanData * 0.08, 1e-6);
    const halfRaw = Math.max(hi - mean, mean - lo, spanData > 0 ? spanData * 0.06 : minHalf);
    const pad = Math.max(halfRaw * 0.18, spanData * 0.04);
    let low = mean - halfRaw - pad;
    let high = mean + halfRaw + pad;
    if (metric === 'heartRate') low = Math.max(35, low);
    if (metric === 'power' || metric === 'speed' || metric === 'cadence') low = Math.max(0, low);
    if (high <= low) high = low + 1;
    return { adjustedMinValue: low, adjustedMaxValue: high };
  };

  const getYAxisLabels = () => {
    const { maxValue, minValue, bars } = chartData;
    const activeValues = (bars || [])
      .filter((b) => b.value > 0 && !b.isPause)
      .map((b) => b.value);

    const useMeanCenteredPace = (isRun || isSwim) && selectedMetric === 'pace';
    const useMeanCenteredSwimMetric =
      isSwim && ['power', 'heartRate', 'speed', 'cadence'].includes(selectedMetric);

    let adjustedMinValue;
    let adjustedMaxValue;

    if (useMeanCenteredPace && activeValues.length > 0) {
      const sym = symmetricAxisFromMean(activeValues, 'pace');
      adjustedMinValue = sym.adjustedMinValue;
      adjustedMaxValue = sym.adjustedMaxValue;
    } else if (useMeanCenteredSwimMetric && activeValues.length > 0) {
      const sym = symmetricAxisFromMean(activeValues, selectedMetric);
      adjustedMinValue = sym.adjustedMinValue;
      adjustedMaxValue = sym.adjustedMaxValue;
    } else if ((isRun || isSwim) && selectedMetric === 'pace') {
      adjustedMinValue = minValue * 0.9;
      adjustedMaxValue = minValue * (5 / 3);
    } else if (selectedMetric === 'cadence') {
      adjustedMinValue = minValue * 0.8;
      adjustedMaxValue = maxValue * 1.2;
    } else {
      adjustedMinValue = Math.max(minValue * 0.8, maxValue * 0.2);
      adjustedMaxValue = maxValue * 1.1;
    }

    const range = adjustedMaxValue - adjustedMinValue;
    const step = range / 5;
    const labels = [];

    for (let i = 0; i <= 5; i++) {
      labels.push(Math.round(adjustedMinValue + step * i));
    }

    // Run + swim pace: fastest (smallest s/km or s/100m) at top, slower toward bottom; bar height uses reversed.
    if ((isRun || isSwim) && selectedMetric === 'pace') {
      return { labels, adjustedMinValue, adjustedMaxValue, reversed: true };
    }

    if (selectedMetric === 'cadence') {
      return { labels, adjustedMinValue, adjustedMaxValue, reversed: false };
    }

    return { labels, adjustedMinValue, adjustedMaxValue, reversed: false };
  };

  // Calculate total time for X-axis labels – use moving time only (exclude stopped time)
  const totalTime = useMemo(() => {
    if (!processedLaps || processedLaps.length === 0) return 0;
    return processedLaps.reduce((sum, lap) => sum + lapDurationSecondsForChart(lap, lapTimeSource), 0);
  }, [processedLaps, lapTimeSource]);

  if (!processedLaps || processedLaps.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-gray-500 text-center">No interval data available</p>
      </div>
    );
  }

  const { bars, maxValue, minValue, totalDistance, groups } = chartData;
  const { labels: yAxisLabels, adjustedMinValue, adjustedMaxValue, reversed } = getYAxisLabels();
  const isPaceAxis = (isRun || isSwim) && selectedMetric === 'pace';
  const yAxisWidth = isMobile ? 'w-8' : 'w-12';
  const chartLeftMargin = isMobile ? 'ml-10' : 'ml-14';

  return (
    <div className={`relative bg-white ${isMobile ? 'rounded-lg p-2' : 'rounded-2xl p-2 sm:p-4'} shadow-lg overflow`}>
      <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-end'} gap-2 mb-2 sm:mb-4`}>
        <div className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'flex-wrap' : ''}`}>
          {xZoomScale > 1 && (
            <button
              onClick={() => {
                setXZoomScale(1);
                setClickedBarIndex(null);
                setHoveredBar(null);
                if (onSelectLapNumber) onSelectLapNumber(null);
                if (chartScrollRef.current) {
                  chartScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                }
              }}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200`}
            >
              Reset zoom
            </button>
          )}
          {(isRun || isSwim) && (
          <button
              onClick={() => setSelectedMetric('pace')}
            className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'pace'
                ? 'bg-greenos text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
              Pace
          </button>
          )}
          {/* Only show power button if power data exists and it's not running or swimming */}
          {hasPowerData && !isRun && (
          <button
            onClick={() => setSelectedMetric('power')}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'power'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Power
          </button>
          )}
          <button
            onClick={() => setSelectedMetric('heartRate')}
            className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'heartRate'
                ? 'bg-red text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Heart Rate
          </button>
          <button
            onClick={() => setSelectedMetric('speed')}
            className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'speed'
                ? 'bg-secondary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Speed
          </button>
          <button
            onClick={() => setSelectedMetric('cadence')}
            className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'cadence'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cadence
          </button>
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="relative w-full overflow-x-hidden"
        style={{ height: isMobile ? '250px' : '400px', paddingTop: isMobile ? '12px' : '14px' }}
      >
        {/* Y-axis labels - aligned 1:1 with dashed grid lines; first/last not shifted up/down so they are not clipped */}
        <div className={`absolute left-0 top-0 bottom-12 ${yAxisWidth} ${isMobile ? 'pr-1' : 'pr-2'} z-10 pb-0.5 pt-1`}>
          <div className="relative w-full h-full">
            {yAxisLabels.map((_, i) => {
              const steps = yAxisLabels.length - 1 || 1;
              const t = i / steps;
              const range = adjustedMaxValue - adjustedMinValue;
              let value;
              if (isPaceAxis) {
                // Pace (run + swim): fastest = smallest seconds at top of axis
                value = adjustedMinValue + range * t;
              } else {
                // Power, speed, HR, cadence: larger value at top, smaller at bottom
                value = adjustedMaxValue - range * t;
              }

              // Format display label
              let displayLabel = value;
              if (selectedMetric === 'pace' && value > 0) {
                const minutes = Math.floor(value / 60);
                const seconds = Math.round(value % 60);
                displayLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
              } else {
                displayLabel = Math.round(value);
              }

              const topPercent = steps > 0 ? (i / steps) * 100 : 0;
              const yTransform =
                i === 0 ? 'translateY(0)' : i === steps ? 'translateY(-100%)' : 'translateY(-50%)';

              return (
                <div
                  key={i}
                  className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-right absolute right-0 leading-tight`}
                  style={{
                    top: `${topPercent}%`,
                    transform: yTransform,
                  }}
                >
                  {displayLabel} {!isMobile && (chartData.bars[0]?.unit || '')}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart area */}
        <div
          ref={chartScrollRef}
          className={`${chartLeftMargin} ${isMobile ? 'mr-0' : 'mr-4'} relative overflow-x-auto overflow-y-hidden`}
          style={{ height: isMobile ? 'calc(100% - 44px)' : 'calc(100% - 58px)' }}
        >
          <div
            className="relative h-full"
            style={{ width: `${Math.max(100, xZoomScale * 100)}%`, minWidth: '100%' }}
          >
            {/* Grid lines */}
            <div className="absolute inset-0">
              {yAxisLabels.map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-dashed border-gray-200"
                  style={{
                    top: `${(i / (yAxisLabels.length - 1)) * 100}%`
                  }}
                />
              ))}
            </div>

            {/* Bars */}
            <div
              className="relative h-full flex items-end gap-0.5"
              style={{ width: '100%' }}
            >
              {bars.map((bar, index) => {
              const isSelectedBar = selectedBarIndex === index;
              // For pace, reverse the height calculation (smaller pace = faster = higher bar)
              const height = adjustedMaxValue > adjustedMinValue
                ? Math.min(100, Math.max(2, reversed
                  ? ((adjustedMaxValue - bar.value) / (adjustedMaxValue - adjustedMinValue)) * 100
                  : ((bar.value - adjustedMinValue) / (adjustedMaxValue - adjustedMinValue)) * 100))
                : 0;
              const speedMps = lapSpeedMpsForChart(bar.lap);
              const avgSpeed = speedMps > 0 
                ? (unitSystem === 'imperial' 
                  ? (speedMps * 3.6 * 0.621371).toFixed(1) + ' mph'
                  : (speedMps * 3.6).toFixed(1) + ' km/h')
                : '-';
              
              let paceSeconds = 0;
              if ((isRun || isSwim) && speedMps > 0) {
                if (isSwim) {
                  paceSeconds = unitSystem === 'imperial' 
                    ? Math.round(109.361 / speedMps)
                    : Math.round(100 / speedMps);
                } else {
                  paceSeconds = unitSystem === 'imperial'
                    ? Math.round(1609.34 / speedMps)
                    : Math.round(1000 / speedMps);
                }
              }
              const lapDur = lapDurationSecondsForChart(bar.lap, lapTimeSource);
              const paceMinutes = Math.floor(paceSeconds / 60);
              const paceSecs = paceSeconds % 60;
              const paceUnit = isSwim 
                ? (unitSystem === 'imperial' ? '/100yd' : '/100m')
                : (unitSystem === 'imperial' ? '/mile' : '/km');
              const paceFormatted = paceSeconds > 0 ? `${paceMinutes}:${String(paceSecs).padStart(2, '0')}${paceUnit}` : '-';
              
              // widthPercent kept for tooltip hit-test calculations only — actual sizing uses flexGrow below
              const widthPercent = bar.isPause
                ? 0
                : (totalDistance > 0
                    ? (bar.distance / totalDistance) * 100
                    : (100 / bars.filter(b => !b.isPause).length));
              
              const barColor = getBarColor(bar, maxValue, minValue, groups);
              
              // For pauses, set minimum height (2px) and gray color
              const barHeight = bar.isPause ? 2 : height;
              
              // Tooltip title: depends on the selected metric, not on sport type.
              const avgHr = Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0);
              const avgPower = Math.round(bar.lap.average_watts || bar.lap.avgPower || 0);
              const avgCadence = Math.round(bar.lap.average_cadence || bar.lap.avgCadence || 0);

              const tooltipTitle =
                selectedMetric === 'pace'
                  ? `Lap ${bar.lapNumber}\nTime: ${formatDuration(lapDur)}\nAvg. pace: ${paceFormatted}\nAvg. Speed: ${avgSpeed}\nAvg. HR: ${avgHr}`
                  : selectedMetric === 'power'
                    ? `Lap ${bar.lapNumber}\nTime: ${formatDuration(lapDur)}\nAvg. Power: ${avgPower} W\nAvg. Speed: ${avgSpeed}\nAvg. HR: ${avgHr}`
                    : selectedMetric === 'cadence'
                      ? `Lap ${bar.lapNumber}\nTime: ${formatDuration(lapDur)}\nAvg. Cadence: ${avgCadence}\nAvg. Speed: ${avgSpeed}\nAvg. HR: ${avgHr}`
                      : `Lap ${bar.lapNumber}\nTime: ${formatDuration(lapDur)}\nAvg. Speed: ${avgSpeed}\nAvg. HR: ${avgHr}`;
              
              return (
                <div
                  key={index}
                  className="group relative cursor-pointer flex flex-col items-stretch justify-end"
                  style={bar.isPause
                    ? { flex: '0 0 6px', height: '100%' }
                    : { flex: `${Math.max(bar.distance, 1)} 1 0%`, minWidth: 0, height: '100%' }
                  }
                  onMouseEnter={() => {
                    if (!isMobile) {
                      setHoveredBar({ bar, index, widthPercent });
                    }
                  }}
                  onMouseLeave={() => {
                    if (!isMobile && clickedBarIndex !== index) {
                      // Only hide on mouse leave if this bar is not clicked
                      setHoveredBar(null);
                    }
                  }}
                  onClick={() => {
                    // Klik na bar: vždy jen vybrat / odvybrat interval a aktualizovat selectedLapNumber
                    if (clickedBarIndex === index) {
                      // If clicking the same bar, hide tooltip
                      setClickedBarIndex(null);
                      setHoveredBar(null);
                      if (onSelectLapNumber) onSelectLapNumber(null);
                    } else {
                      // Show tooltip for clicked bar and keep it visible
                      setClickedBarIndex(index);
                      setHoveredBar({ bar, index, widthPercent });
                      if (onSelectLapNumber) onSelectLapNumber(bar.lapNumber);
                    }
                  }}
                  onTouchStart={() => {
                    // Jen si poznačíme čas dotyku; samotný výběr řeší onClick
                    lastTouchAtRef.current = Date.now();
                  }}
                  ref={(el) => {
                    if (el) {
                      barRefs.current[index] = el;
                    }
                  }}
                >
                  {/* Bar body */}
                  <div
                    className="w-full rounded-t transition-all hover:opacity-80"
                    style={{
                      height: `${barHeight}%`,
                      backgroundColor: barColor,
                      minHeight: bar.isPause ? '2px' : (bar.value > 0 ? '2px' : '0')
                    }}
                    title={isMobile ? tooltipTitle : undefined}
                  />
                  {/* Selected underline (bottom highlight) */}
                  <div
                    className={`h-1 w-full rounded-t-md mt-0.5 transition-colors ${
                      isSelectedBar ? 'bg-indigo-500' : 'bg-transparent group-hover:bg-indigo-200'
                    }`}
                  />
                </div>
              );
              })}
            </div>
          </div>
        </div>
        
        {/* Tooltip positioned above the bar (desktop only) */}
        {!isMobile && (hoveredBar || clickedBarIndex !== null) && (() => {
          // Use clicked bar if available, otherwise use hovered bar
          let activeBar = null;
          if (clickedBarIndex !== null && Array.isArray(chartData?.bars) && chartData.bars[clickedBarIndex]) {
            const bar = chartData.bars[clickedBarIndex];
            activeBar = { bar, index: clickedBarIndex, widthPercent: chartData.totalDistance > 0 ? (bar.distance / chartData.totalDistance * 100) : 0 };
          } else {
            activeBar = hoveredBar;
          }
          
          if (!activeBar || !activeBar.bar) return null;
          const bar = activeBar.bar;
          const speedMps = lapSpeedMpsForChart(bar.lap);
          const avgSpeed = speedMps > 0 
            ? (unitSystem === 'imperial' 
              ? (speedMps * 3.6 * 0.621371).toFixed(1) + ' mph'
              : (speedMps * 3.6).toFixed(1) + ' km/h')
            : '-';
          
          let paceSeconds = 0;
          if ((isRun || isSwim) && speedMps > 0) {
            if (isSwim) {
              paceSeconds = unitSystem === 'imperial' 
                ? Math.round(109.361 / speedMps)
                : Math.round(100 / speedMps);
            } else {
              paceSeconds = unitSystem === 'imperial'
                ? Math.round(1609.34 / speedMps)
                : Math.round(1000 / speedMps);
            }
          }
          const lapDurTooltip = lapDurationSecondsForChart(bar.lap, lapTimeSource);
          const paceMinutes = Math.floor(paceSeconds / 60);
          const paceSecs = paceSeconds % 60;
          const paceUnit = isSwim 
            ? (unitSystem === 'imperial' ? '/100yd' : '/100m')
            : (unitSystem === 'imperial' ? '/mile' : '/km');
          const paceFormatted = paceSeconds > 0 ? `${paceMinutes}:${String(paceSecs).padStart(2, '0')}${paceUnit}` : '-';
          
          // Calculate tooltip position - same style as TrainingChart.jsx
          const barElement = barRefs.current[activeBar.index];
          const containerElement = chartContainerRef.current;
          
          let tooltipLeft = 0;
          let barCenterX = 0; // x in container coordinates
          let barTop = 0;     // y in container coordinates (top of the colored bar)
          
          if (barElement && containerElement) {
            const barRect = barElement.getBoundingClientRect();
            const containerRect = containerElement.getBoundingClientRect();
            
            // Use the actual colored bar element for precise alignment (outer wrapper spans full height)
            const coloredBarEl = barElement.firstElementChild;
            const coloredBarRect = coloredBarEl?.getBoundingClientRect?.() || barRect;

            // Center of the bar relative to container
            const relativeX = (coloredBarRect.left + (coloredBarRect.width / 2)) - containerRect.left;
            barCenterX = relativeX;
            
            // Top of the colored bar (not the wrapper)
            barTop = (coloredBarRect.top - containerRect.top);
            
            // Use actual bar center position for tooltip alignment (same as TrainingChart.jsx)
            const containerWidth = containerRect.width;
            const tooltipWidth = isMobile ? 180 : 200;
            const offset = 15;
            
            tooltipLeft = relativeX + offset; // Offset from bar center
            
            // Keep tooltip within container bounds
            if (tooltipLeft + tooltipWidth > containerWidth - 10) {
              tooltipLeft = relativeX - tooltipWidth - offset; // Show on left side of bar
            }
            if (tooltipLeft < 10) {
              tooltipLeft = 10; // Minimum left margin
            }
          } else {
            // Fallback calculation if refs are not available
            const cumulativeWidth = bars.slice(0, activeBar.index).reduce((sum, b) => sum + (b.distance / totalDistance * 100), 0);
            const barCenterPercent = cumulativeWidth + (activeBar.widthPercent / 2);
            const chartAreaLeftMargin = isMobile ? (isPaceAxis ? 56 : 40) : (isPaceAxis ? 80 : 56);
            const containerWidth = containerElement?.offsetWidth || 800;
            const chartAreaWidthPercent = 100 - ((chartAreaLeftMargin * 2) / containerWidth * 100);
            const relativeX = (chartAreaLeftMargin / containerWidth * 100) + (barCenterPercent * chartAreaWidthPercent / 100);
            const tooltipWidth = isMobile ? 180 : 200;
            const offset = 15;
            tooltipLeft = (relativeX / 100) * containerWidth + offset;
            if (tooltipLeft + tooltipWidth > containerWidth - 10) {
              tooltipLeft = (relativeX / 100) * containerWidth - tooltipWidth - offset;
            }
            if (tooltipLeft < 10) {
              tooltipLeft = 10;
            }
            // Fallback for bar position
            barCenterX = (relativeX / 100) * containerWidth;
            barTop = 200; // Approximate position
          }
          
          // Calculate diagonal line position from tooltip to bar
          // Line starts from bottom-center of tooltip and goes to top-center of bar
          const tooltipHeight = isMobile ? 120 : 150; // Approximate tooltip height
          const tooltipBottomY = 10 + tooltipHeight; // Bottom of tooltip
          const tooltipWidth = isMobile ? 180 : 200; // Tooltip width
          const lineStartX = tooltipLeft + (tooltipWidth / 2); // Center of tooltip (bottom)
          const lineStartY = tooltipBottomY; // Bottom of tooltip
          const lineEndX = barCenterX; // Center of bar (container coords)
          const lineEndY = barTop; // Top of bar (where interval ends)
          
          return (
            <>
              {/* Thin gray diagonal line from tooltip to bar */}
              <svg
                className="absolute pointer-events-none z-40"
                style={{
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%'
                }}
              >
                <line
                  x1={lineStartX}
                  y1={lineStartY}
                  x2={lineEndX}
                  y2={lineEndY}
                  stroke="#d1d5db"
                  strokeWidth="1"
                  opacity="0.5"
                />
              </svg>
              
              {/* Tooltip */}
              <div 
                className={`absolute bg-white rounded-lg shadow-xl border border-gray-200 ${isMobile ? 'p-2' : 'p-3'} z-50 pointer-events-none`}
                    style={{
                  left: `${tooltipLeft}px`,
                  top: '10px',
                  minWidth: isMobile ? '180px' : '200px'
                    }}
                  >
                    <div className={`space-y-1 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                        <div className="font-semibold text-gray-900">
                          {isSwim
                            ? `Lap ${bar.lapNumber}`
                            : isRun
                              ? `Km ${bar.lapNumber}`
                              : `Lap ${bar.lapNumber}`}
                        </div>
                        <div className="text-gray-600">
                          Distance: {bar.distance > 0 ? formatDistance(bar.distance, unitSystem).formatted : '-'}
                        </div>
                        <div className="text-gray-600">
                          Time: {formatDuration(lapDurTooltip)}
                        </div>
                        {(isRun || isSwim) ? (
                          <>
                        <div className="text-greenos font-medium">
                          Avg. pace: {paceFormatted}
                        </div>
                        <div className="text-secondary font-medium">
                          Avg. Speed: {avgSpeed}
                        </div>
                          </>
                        ) : (
                        <div className="text-secondary font-medium">
                          Avg. Speed: {avgSpeed}
                        </div>
                        )}
                        {!isRun && !isSwim && (
                        <div className="text-purple-600 font-medium">
                          Avg. Power: {Math.round(bar.lap.average_watts || bar.lap.avgPower || 0)} W
                        </div>
                        )}
                        <div className="text-red font-medium">
                          Avg. HR: {Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0)}
                        </div>
                    {(bar.lap.max_heartrate || bar.lap.maxHeartRate || bar.maxHeartRate) > 0 && (
                        <div className="text-red-dark font-semibold">
                      Max. HR: {Math.round(bar.lap.max_heartrate || bar.lap.maxHeartRate || bar.maxHeartRate)}
                        </div>
                        )}
                      </div>
                    </div>
              </>
          );
          })()}

        {/* X-axis labels - show cumulative distance/time instead of individual intervals */}
        <div className={`${chartLeftMargin} ${isMobile ? 'mr-0' : 'mr-4'} mt-2`}>
          <div style={{ width: `${Math.max(100, xZoomScale * 100)}%`, minWidth: '100%' }} className="flex items-center justify-between">
            {bars.length > 0 && (
              <>
                <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-left`}>
                  {formatDistance(0, unitSystem).formatted}
                </div>

                {bars.length > 2 && (
                  <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-center`}>
                    {formatDistance((totalDistance || 0) / 2, unitSystem).formatted}
                  </div>
                )}

                <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-right`}>
                  {formatDistance(totalDistance || 0, unitSystem).formatted}
                  {!isMobile && totalTime > 0 && (
                    <span className="ml-1 text-gray-500">
                      ({formatDuration(totalTime)})
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntervalChart;

