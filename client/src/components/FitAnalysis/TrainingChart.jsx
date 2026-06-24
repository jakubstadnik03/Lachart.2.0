import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { prepareTrainingChartData, formatDuration } from '../../utils/fitAnalysisUtils';
import { useAuth } from '../../context/AuthProvider';
import { formatDistance, formatElevation } from '../../utils/unitsConverter';

// Calculate zone for power
const getPowerZone = (power, powerZones) => {
  if (!powerZones || !power) return null;
  for (let i = 1; i <= 5; i++) {
    const zone = powerZones[`zone${i}`];
    if (zone && power >= zone.min && (zone.max === Infinity || power <= zone.max)) {
      return i;
    }
  }
  return null;
};

// Calculate zone for heart rate
const getHeartRateZone = (hr, hrZones) => {
  if (!hrZones || !hr) return null;
  for (let i = 1; i <= 5; i++) {
    const zone = hrZones[`zone${i}`];
    if (zone && hr >= zone.min && (zone.max === Infinity || hr <= zone.max)) {
      return i;
    }
  }
  return null;
};

// Calculate zone for pace (running/swimming) - pace zones are in seconds, lower = faster
// For pace: zone 1 is slowest (highest seconds), zone 5 is fastest (lowest seconds)
// Note: pace zones in profile are stored in seconds per km (metric) or need conversion for imperial
const getPaceZone = (paceSeconds, paceZones, unitSystem = 'metric') => {
  if (!paceZones || !paceSeconds || paceSeconds <= 0) return null;
  
  // Convert pace zones to current unit system if needed
  // If zones are in metric (seconds/km) and we need imperial, convert to seconds/mile
  // 1 mile = 1.60934 km, so pace in seconds/mile = pace in seconds/km * 1.60934
  for (let i = 1; i <= 5; i++) {
    const zone = paceZones[`zone${i}`];
    if (zone) {
      let zoneMin = zone.min || 0;
      let zoneMax = zone.max === Infinity || zone.max === null || zone.max === undefined ? Infinity : zone.max;
      
      // Convert zone boundaries to current unit system
      // Assuming zones are stored in metric (seconds/km), convert to imperial if needed
      if (unitSystem === 'imperial') {
        zoneMin = zoneMin * 1.60934; // Convert seconds/km to seconds/mile
        zoneMax = zoneMax === Infinity ? Infinity : zoneMax * 1.60934;
      }
      
      // For pace zones: min is slower (higher seconds), max is faster (lower seconds)
      // So we check if paceSeconds is between max and min (reversed logic)
      if (paceSeconds >= zoneMax && paceSeconds <= zoneMin) {
        return i;
      }
    }
  }
  return null;
};

// Format pace from seconds to MM:SS with unit
const formatPace = (seconds, unitSystem, isSwim = false) => {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  const unit = isSwim 
    ? (unitSystem === 'imperial' ? '/100yd' : '/100m')
    : (unitSystem === 'imperial' ? '/mile' : '/km');
  return `${minutes}:${String(secs).padStart(2, '0')}${unit}`;
};


const TrainingChart = ({ training, userProfile, onHover, onLeave, user, highlightMetric = null, radarWatts = null, focusTimeSec = null, focusMetric = null }) => {
  const { user: authUser } = useAuth();
  const [smoothing, setSmoothing] = useState(0.5); // Default 50%
  const [showPower, setShowPower] = useState(true);
  const [showHeartRate, setShowHeartRate] = useState(true);
  const [showSpeed, setShowSpeed] = useState(true);
  const [showCadence, setShowCadence] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [showZones, setShowZones] = useState(false); // target training-zone bands behind the line
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [cursorX, setCursorX] = useState(null);
  const [clickedPoint, setClickedPoint] = useState(null); // For mobile touch tooltip
  const [clickedCursorX, setClickedCursorX] = useState(null); // For mobile touch tooltip
  const [touchActive, setTouchActive] = useState(false); // finger is currently on chart
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [zoomRange, setZoomRange] = useState({ min: 0, max: 1 }); // 0-1 range of distance to show
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [highlightWindow, setHighlightWindow] = useState(null); // { startDistance, endDistance }
  const [highlightSummary, setHighlightSummary] = useState(null); // aggregated metrics for highlighted window
  const touchSelRef = useRef({ startRel: null, endRel: null, selecting: false }); // mobile drag-to-select state
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const mouseMoveTimeoutRef = useRef(null); // For throttling mouse move events
  
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

  const chartData = useMemo(() => {
    if (!training || !training.records || training.records.length === 0) return null;
    return prepareTrainingChartData(training);
  }, [training]);

  // Get zones from user profile based on sport type
  const sportType = training?.sport?.toLowerCase() || 'cycling';
  const isCycling = sportType.includes('ride') || sportType.includes('cycle') || sportType.includes('bike');
  const isRunning = sportType.includes('run');
  const isSwimming = sportType.includes('swim');
  
  const powerZones = isCycling 
    ? (userProfile?.powerZones?.cycling || null)
    : isRunning 
    ? (userProfile?.powerZones?.running || null)
    : isSwimming
    ? (userProfile?.powerZones?.swimming || null)
    : null;
    
  const hrZones = useMemo(() => {
    if (!userProfile?.heartRateZones) return null;
    if (isCycling) return userProfile.heartRateZones.cycling || null;
    if (isRunning) return userProfile.heartRateZones.running || null;
    if (isSwimming) return userProfile.heartRateZones.swimming || null;
    return null;
  }, [userProfile, isCycling, isRunning, isSwimming]);

  // Apply moving average filter based on smoothing value
  const applyMovingAverage = (data, windowSize) => {
    if (windowSize <= 1 || data.length === 0) return data;
    const filtered = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
      const window = data.slice(start, end);
      const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
      filtered.push(avg);
    }
    return filtered;
  };

  // Process data with filters and distance-based X-axis
  const processedData = useMemo(() => {
    if (!chartData) return null;

    const records = chartData.records;
    
    // Reduce data points if too many to prevent memory issues and improve performance
    // Keep max 2000 points for rendering (more than enough for smooth curves)
    const MAX_POINTS = 2000;
    let recordsToProcess = records;
    if (records.length > MAX_POINTS) {
      const step = Math.ceil(records.length / MAX_POINTS);
      recordsToProcess = records.filter((_, i) => i % step === 0 || i === records.length - 1);
      console.log(`[TrainingChart] Reduced ${records.length} records to ${recordsToProcess.length} points for rendering`);
    }
    
    // Convert to distance-based data - use actual distance from records if available
    let cumulativeDistance = 0;
    const distanceData = recordsToProcess.map((record, i) => {
      // Use distance from record if available (in meters), otherwise calculate from speed
      if (record.distance !== undefined && record.distance !== null && record.distance > 0) {
        cumulativeDistance = record.distance / 1000; // Convert meters to km
      } else if (i > 0) {
        const prevRecord = recordsToProcess[i - 1];
        const timeDiff = record.timeFromStart - prevRecord.timeFromStart;
        const avgSpeed = record.speed || prevRecord.speed || 0;
        cumulativeDistance += (avgSpeed * timeDiff) / 3600; // km/h × s ÷ 3600 = km
      }
      
      return {
        distance: cumulativeDistance,
        time: record.timeFromStart,
        speed: record.speed !== null && record.speed !== undefined ? record.speed : 0, // Already in km/h from prepareTrainingChartData
        heartRate: record.heartRate !== null && record.heartRate !== undefined ? record.heartRate : 0,
        power: record.power !== null && record.power !== undefined ? record.power : 0,
        cadence: record.cadence !== null && record.cadence !== undefined ? record.cadence : null, // Keep null to distinguish from 0
        altitude: record.altitude !== null && record.altitude !== undefined ? record.altitude : null // Keep null to distinguish from 0
      };
    });

    // Which metrics actually have data — drives both the toggle chips and
    // the X-axis. A gym/strength session has no distance/power/speed, so we
    // hide those and plot the X-axis by elapsed TIME instead of distance.
    const hasDistance = (distanceData[distanceData.length - 1]?.distance || 0) > 0.001;
    const hasPower = distanceData.some(d => d.power > 0);
    const hasSpeed = distanceData.some(d => d.speed > 0);
    const hasHeartRate = distanceData.some(d => d.heartRate > 0);

    // No distance → repurpose the `distance` field as elapsed HOURS so the
    // existing distance-based xScale spreads points over time (otherwise every
    // point sits at distance 0 and the line collapses to a vertical bar).
    if (!hasDistance) {
      const t0 = distanceData[0]?.time || 0;
      distanceData.forEach(d => { d.distance = Math.max(0, (d.time - t0) / 3600); });
    }

    const maxDistance = distanceData[distanceData.length - 1]?.distance || 0;

    // Calculate smoothing window size based on smoothing value (0-1)
    // 0% = no smoothing (1 point), 50% = ~10s (assuming 1s intervals), 100% = ~20s
    const smoothingWindowSize = Math.max(1, Math.round(1 + smoothing * 19)); // 1 to 20 seconds
    
    // Apply moving average filter - handle null values for cadence and altitude
    const powerValues = distanceData.map(d => d.power);
    const hrValues = distanceData.map(d => d.heartRate);
    const speedValues = distanceData.map(d => d.speed);
    // For cadence and altitude, use 0 for null values during smoothing, but track which ones had data
    const cadenceValues = distanceData.map(d => d.cadence !== null && d.cadence !== undefined ? d.cadence : 0);
    const altitudeValues = distanceData.map(d => d.altitude !== null && d.altitude !== undefined ? d.altitude : 0);

    const filteredPower = applyMovingAverage(powerValues, smoothingWindowSize);
    const filteredHr = applyMovingAverage(hrValues, smoothingWindowSize);
    const filteredSpeed = applyMovingAverage(speedValues, smoothingWindowSize);
    const filteredCadence = applyMovingAverage(cadenceValues, smoothingWindowSize);
    const filteredAltitude = applyMovingAverage(altitudeValues, smoothingWindowSize);
    
    // Create filtered points - preserve null for cadence/altitude if original was null
    const filteredPoints = distanceData.map((d, i) => ({
      ...d,
      power: filteredPower[i] || 0,
      heartRate: filteredHr[i] || 0,
      speed: filteredSpeed[i] || 0,
      cadence: d.cadence !== null && d.cadence !== undefined ? filteredCadence[i] : null, // Preserve null
      altitude: d.altitude !== null && d.altitude !== undefined ? filteredAltitude[i] : null // Preserve null
    }));
    
    // Calculate max values from FILTERED data - this ensures smoothness changes are reflected
    // Ensure at least 1 to avoid division by zero
    const maxSpeed = Math.max(...filteredSpeed.filter(v => v > 0), 1);
    const maxHeartRate = Math.max(...filteredHr.filter(v => v > 0), 1);
    const maxPower = Math.max(...filteredPower.filter(v => v > 0), 1);
    
    // For cadence, check if we have any non-null values in the original data
    const hasCadenceData = distanceData.some(d => d.cadence !== null && d.cadence !== undefined);
    const validCadence = filteredCadence.filter((v, i) => {
      // Only include if original data had cadence (not null) and filtered value is valid
      return distanceData[i].cadence !== null && distanceData[i].cadence !== undefined && v >= 0;
    });
    const validAltitude = filteredAltitude.filter((v, i) => {
      // Only include if original data had altitude (not null)
      return distanceData[i].altitude !== null && distanceData[i].altitude !== undefined;
    });
    
    // Calculate maxCadence - if we have cadence data, use max of valid values (even if 0)
    const maxCadence = hasCadenceData && validCadence.length > 0 
      ? (Math.max(...validCadence) > 0 ? Math.max(...validCadence) : (validCadence.length > 0 ? 0 : null))
      : null;
    const maxAltitude = validAltitude.length > 0 ? Math.max(...validAltitude) : null;
    const minAltitude = validAltitude.length > 0 ? Math.min(...validAltitude) : null;
    
    const hasElevation = validAltitude.length > 0;

    return {
      points: filteredPoints,
      maxDistance,
      maxSpeed,
      maxHeartRate,
      maxPower,
      maxCadence,
      maxAltitude,
      minAltitude,
      hasDistance,
      hasPower,
      hasSpeed,
      hasHeartRate,
      hasElevation,
    };
  }, [chartData, smoothing]);

  // Running: show cadence trace by default when the activity has cadence data.
  useEffect(() => {
    if (!isRunning) return;
    if (processedData?.maxCadence != null && processedData.maxCadence > 0) {
      setShowCadence(true);
    }
  }, [isRunning, training?.id, training?._id, processedData?.maxCadence]);

  // Chart dimensions - adjust padding for narrow layouts (reduced spacing to match IntervalChart)
  const chartHeight = isMobile ? 250 : 400;
  const isNarrow = containerWidth < 800;
  const padding = isMobile
    ? { top: 15, right: 10, bottom: 25, left: 40 }
    : isNarrow 
    ? { top: 20, right: 15, bottom: 30, left: 50 }
    : { top: 20, right: 20, bottom: 30, left: 56 };
  // Use container width for viewBox - this ensures proper scaling
  // For mobile, use actual container width; for desktop, use container width or minimum
  const svgWidth = isMobile 
    ? Math.max(containerWidth || 400, 400) 
    : Math.max(containerWidth || 800, 800);
  const svgHeight = chartHeight;
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const summarizeWindow = useCallback((points, startIndex, endIndex, label = 'Selected segment') => {
    if (!Array.isArray(points) || points.length === 0 || startIndex == null || endIndex == null) return;
    if (endIndex <= startIndex) return;

    let sumPower = 0;
    let countPower = 0;
    let sumHr = 0;
    let countHr = 0;
    let sumCadence = 0;
    let countCadence = 0;
    let sumSpeed = 0;
    let countSpeed = 0;

    for (let i = startIndex; i <= endIndex; i++) {
      const p = points[i];
      const pPower = Number(p.power || 0);
      const pHr = Number(p.heartRate || 0);
      const pCad = p.cadence != null ? Number(p.cadence) : null;
      const pSpeed = Number(p.speed || 0);

      if (pPower > 0) {
        sumPower += pPower;
        countPower++;
      }
      if (pHr > 0) {
        sumHr += pHr;
        countHr++;
      }
      if (pCad != null) {
        sumCadence += pCad;
        countCadence++;
      }
      if (pSpeed > 0) {
        sumSpeed += pSpeed;
        countSpeed++;
      }
    }

    const startPoint = points[startIndex];
    const endPoint = points[endIndex];
    const durationSec = endPoint.time - startPoint.time;
    const distanceKm = Math.max(0, endPoint.distance - startPoint.distance);

    setHighlightWindow({
      startDistance: startPoint.distance,
      endDistance: endPoint.distance
    });

    setHighlightSummary({
      label,
      durationSec,
      distanceKm,
      avgPower: countPower > 0 ? sumPower / countPower : null,
      avgHr: countHr > 0 ? sumHr / countHr : null,
      avgCadence: countCadence > 0 ? sumCadence / countCadence : null,
      avgSpeedKmh: countSpeed > 0 ? sumSpeed / countSpeed : null
    });
  }, []);

  // Summarise the segment between two in-graph x-pixels (no zoom) — used by the
  // mobile drag-to-select gesture so you can mark a part of the ride and read
  // its averages without losing the full chart.
  const summarizeFromRelativeX = useCallback((relA, relB) => {
    if (!processedData || relA == null || relB == null) return;
    const startX = Math.min(relA, relB);
    const endX = Math.max(relA, relB);
    if (endX - startX < graphWidth * 0.03) return; // too small a swipe — treat as a tap
    const zoomedMin = processedData.maxDistance * zoomRange.min;
    const zoomedMax = processedData.maxDistance * zoomRange.max;
    const zr = (zoomedMax - zoomedMin) || 1;
    const startDistance = zoomedMin + (startX / graphWidth) * zr;
    const endDistance = zoomedMin + (endX / graphWidth) * zr;
    let si = 0, ei = processedData.points.length - 1;
    for (let i = 0; i < processedData.points.length; i++) { if (processedData.points[i].distance >= startDistance) { si = i; break; } }
    for (let i = processedData.points.length - 1; i >= 0; i--) { if (processedData.points[i].distance <= endDistance) { ei = i; break; } }
    summarizeWindow(processedData.points, si, ei, 'Selected segment');
  }, [processedData, graphWidth, zoomRange, summarizeWindow]);

  // When coming from Power Radar (highlightMetric), auto-zoom to the best window and keep tooltip there
  useEffect(() => {
    if (!highlightMetric || !processedData || !processedData.points || processedData.points.length === 0) {
      setHighlightWindow(null);
      setHighlightSummary(null);
      return;
    }
    if (!processedData.maxPower || processedData.maxPower <= 0) {
      setHighlightWindow(null);
      setHighlightSummary(null);
      return;
    }

    // Map metric key to target duration in seconds
    const metricDurations = {
      sprint5s: 5,
      attack1min: 60,
      vo2max5min: 300,
      threshold20min: 1200,
      endurance60min: 3600,
    };
    const targetDuration = metricDurations[highlightMetric];
    if (!targetDuration) return;

    const points = processedData.points;
    if (points.length < 2) return;

    // Sliding window on distance/time series to find best average power over targetDuration
    let best = { avg: 0, startIndex: 0, endIndex: 0 };
    let sum = 0;
    let count = 0;
    let start = 0;

    for (let end = 0; end < points.length; end++) {
      const pEnd = points[end];
      const power = pEnd.power || 0;
      const tEnd = pEnd.time;

      sum += power;
      count++;

      while (start < end && (tEnd - points[start].time) > targetDuration) {
        sum -= (points[start].power || 0);
        count--;
        start++;
      }

      if (count > 0) {
        const windowDuration = tEnd - points[start].time;
        if (windowDuration >= targetDuration * 0.8) {
          const avg = sum / count;
          if (avg > best.avg) {
            best = { avg, startIndex: start, endIndex: end };
          }
        }
      }
    }

    if (best.endIndex <= best.startIndex) return;

    const startPoint = points[best.startIndex];
    const endPoint = points[best.endIndex];
    const maxDistance = processedData.maxDistance || endPoint.distance || 0;
    if (!maxDistance) {
      setHighlightWindow(null);
      setHighlightSummary(null);
      return;
    }

    // Compute zoom range around this window with a bit of padding
    const startRatio = Math.max(0, (startPoint.distance / maxDistance) - 0.05);
    const endRatio = Math.min(1, (endPoint.distance / maxDistance) + 0.05);
    if (endRatio <= startRatio) return;

    setZoomRange({ min: startRatio, max: endRatio });

    // Human-friendly label for the metric
    const metricLabels = {
      sprint5s: 'Best 5s sprint window',
      attack1min: 'Best 1min attack window',
      vo2max5min: 'Best 5min VO₂max window',
      threshold20min: 'Best 20min threshold window',
      endurance60min: 'Best 60min endurance window'
    };

    summarizeWindow(points, best.startIndex, best.endIndex, metricLabels[highlightMetric] || 'Highlighted window');

    // Also set hoveredPoint so tooltip immediately shows at window end
    const midIndex = Math.round((best.startIndex + best.endIndex) / 2);
    const midPoint = points[midIndex] || endPoint;
    setHoveredPoint(midPoint);
  }, [highlightMetric, processedData, summarizeWindow]);

  // Auto-toggle metrics based on what data the training actually has, so a
  // gym/strength session (HR only) doesn't draw flat-zero Power/Speed lines.
  useEffect(() => {
    if (!processedData) return;
    if (!processedData.hasPower) setShowPower(false);
    if (!processedData.hasSpeed) setShowSpeed(false);
    if (processedData.hasElevation && !isSwimming) setShowElevation(true);
    else if (!processedData.hasElevation) setShowElevation(false);
  }, [processedData, isSwimming]);

  // Update container width when component mounts or resizes
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width || (isMobile ? 400 : 1200));
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isMobile]);

  // Hide tooltip when clicking/tapping outside the chart container
  useEffect(() => {
    const handlePointerDown = (e) => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(e.target)) return; // inside chart -> ignore

      setHoveredPoint(null);
      setClickedPoint(null);
      setCursorX(null);
      setClickedCursorX(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      // Cleanup throttle timeout
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
        mouseMoveTimeoutRef.current = null;
      }
    };
  }, []);

  // Scale functions with zoom support
  const xScale = useCallback((distance) => {
    if (!processedData || processedData.maxDistance === 0) return 0;
    // Apply zoom range
    const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
    const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
    const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
    
    if (distance < zoomedMinDistance || distance > zoomedMaxDistance) return null;
    
    const normalizedDistance = (distance - zoomedMinDistance) / zoomedRange;
    // Use current graphWidth from container
    const currentGraphWidth = graphWidth || (svgWidth - padding.left - padding.right);
    return padding.left + normalizedDistance * currentGraphWidth;
  }, [processedData, graphWidth, svgWidth, padding.left, padding.right, zoomRange]);

  // Format an X-axis value: real distance when the training has it, otherwise
  // elapsed time (the `distance` field holds elapsed HOURS in that case).
  const hasDistanceAxis = !processedData || processedData.hasDistance;
  const fmtClock = (secs) => {
    const s = Math.max(0, Math.round(secs));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${m}:${String(ss).padStart(2, '0')}`;
  };
  const fmtXLabel = (distKm) => (hasDistanceAxis
    ? formatDistance((distKm || 0) * 1000, unitSystem).formatted
    : fmtClock((distKm || 0) * 3600));
  const xAxisName = hasDistanceAxis ? 'Distance' : 'Time';

  // Seek chart to a peak effort selected from the Peaks tab.
  useEffect(() => {
    if (focusTimeSec == null || !processedData?.points?.length) return;
    if (focusMetric === 'power') setShowPower(true);
    if (focusMetric === 'hr') setShowHeartRate(true);
    const pts = processedData.points;
    let best = pts[0];
    let minD = Math.abs((pts[0].time || 0) - focusTimeSec);
    for (const p of pts) {
      const d = Math.abs((p.time || 0) - focusTimeSec);
      if (d < minD) { minD = d; best = p; }
    }
    const px = xScale(best.distance);
    if (px == null || Number.isNaN(px)) return;
    setHoveredPoint(best);
    setCursorX(px);
    setClickedPoint(best);
    setClickedCursorX(px);
    setTouchActive(true);
    if (onHover) onHover(best);
  }, [focusTimeSec, focusMetric, processedData, xScale, onHover]);

  // Add top padding (10% of graph height) so max values don't touch the top
  const topPaddingRatio = 0.1; // 10% padding at top
  const effectiveGraphHeight = graphHeight * (1 - topPaddingRatio); // 90% of graph height for data

  const speedYScale = useCallback((speed) => {
    if (!processedData || processedData.maxSpeed === 0) return padding.top + graphHeight;
    // Scale to 90% of graph height, leaving 10% padding at top
    return padding.top + graphHeight - ((speed / processedData.maxSpeed) * effectiveGraphHeight);
  }, [processedData, effectiveGraphHeight, graphHeight, padding.top]);

  const hrYScale = useCallback((hr) => {
    if (!processedData || processedData.maxHeartRate === 0) return padding.top + graphHeight;
    return padding.top + graphHeight - ((hr / processedData.maxHeartRate) * effectiveGraphHeight);
  }, [processedData, effectiveGraphHeight, graphHeight, padding.top]);

  const powerYScale = useCallback((power) => {
    if (!processedData || processedData.maxPower === 0) return padding.top + graphHeight;
    return padding.top + graphHeight - ((power / processedData.maxPower) * effectiveGraphHeight);
  }, [processedData, effectiveGraphHeight, graphHeight, padding.top]);

  const cadenceYScale = useCallback((cadence) => {
    if (!processedData || processedData.maxCadence === null || processedData.maxCadence === undefined) return padding.top + graphHeight;
    // If maxCadence is 0, all values are 0, so return bottom of graph
    if (processedData.maxCadence === 0) return padding.top + graphHeight;
    // Normalize cadence to 0-100% like other metrics, but use its own max value
    const normalized = (cadence / processedData.maxCadence);
    return padding.top + graphHeight - (normalized * effectiveGraphHeight);
  }, [processedData, effectiveGraphHeight, graphHeight, padding.top]);

  const elevationYScale = useCallback((altitude) => {
    if (!processedData || processedData.maxAltitude === null || processedData.minAltitude === null) return padding.top + graphHeight;
    const altitudeRange = processedData.maxAltitude - processedData.minAltitude;
    if (altitudeRange === 0) return padding.top + graphHeight;
    // Normalize altitude to 0-1 range, then scale to full graph height (100%)
    const normalized = (altitude - processedData.minAltitude) / altitudeRange;
    return padding.top + graphHeight - (normalized * graphHeight);
  }, [processedData, graphHeight, padding.top]);

  // ── Target training-zone bands (shown behind the actual line) ──
  // Power zones for cycling, HR zones for run/swim — whichever the athlete
  // has thresholds configured for. Lets coaches see, at a glance, which zone
  // the real effort fell into vs the planned target intensity.
  const ZONE_FILLS = [
    'rgba(96,165,250,0.12)',  // Z1 — blue
    'rgba(52,211,153,0.12)',  // Z2 — green
    'rgba(250,204,21,0.16)',  // Z3 — yellow
    'rgba(251,146,60,0.18)',  // Z4 — orange
    'rgba(248,113,113,0.18)', // Z5 — red
  ];
  const zoneOverlay = (() => {
    if (!processedData) return null;
    if (isCycling && showPower && powerZones && processedData.maxPower > 1) {
      return { zones: powerZones, yScaleFn: powerYScale, maxVal: processedData.maxPower, unit: 'W' };
    }
    if (showHeartRate && hrZones && processedData.maxHeartRate > 1) {
      return { zones: hrZones, yScaleFn: hrYScale, maxVal: processedData.maxHeartRate, unit: 'bpm' };
    }
    return null;
  })();
  const hasZoneData = !!zoneOverlay;

  // Generate SVG paths - use polyline with optional smoothing
  const speedPath = useMemo(() => {
    if (!processedData || processedData.points.length === 0) return '';
    const points = processedData.points
      .map(p => {
        const x = xScale(p.distance);
        const y = speedYScale(p.speed);
        if (x === null || isNaN(x) || y === null || isNaN(y)) return null;
        return { x, y };
      })
      .filter(p => p !== null && p.x !== null && p.y !== null);
    if (points.length === 0) return '';
    
    // Always use straight lines - smoothing is applied to data, not to the curve
    return `M ${points[0].x},${points[0].y} L ${points.slice(1).map(p => `${p.x},${p.y}`).join(' L ')}`;
  }, [processedData, xScale, speedYScale]);

  const hrPath = useMemo(() => {
    if (!processedData || processedData.points.length === 0) return '';
    const points = processedData.points
      .map(p => {
        const x = xScale(p.distance);
        const y = hrYScale(p.heartRate);
        if (x === null || isNaN(x) || y === null || isNaN(y)) return null;
        return { x, y };
      })
      .filter(p => p !== null && p.x !== null && p.y !== null);
    if (points.length === 0) return '';
    
    // Always use straight lines - smoothing is applied to data, not to the curve
    return `M ${points[0].x},${points[0].y} L ${points.slice(1).map(p => `${p.x},${p.y}`).join(' L ')}`;
  }, [processedData, xScale, hrYScale]);

  const powerPath = useMemo(() => {
    if (!processedData || processedData.points.length === 0) return '';
    const points = processedData.points
      .map(p => {
        const x = xScale(p.distance);
        const y = powerYScale(p.power);
        if (x === null || isNaN(x) || y === null || isNaN(y)) return null;
        return { x, y };
      })
      .filter(p => p !== null && p.x !== null && p.y !== null);
    if (points.length === 0) return '';
    
    // Always use straight lines - smoothing is applied to data, not to the curve
    return `M ${points[0].x},${points[0].y} L ${points.slice(1).map(p => `${p.x},${p.y}`).join(' L ')}`;
  }, [processedData, xScale, powerYScale]);

  const cadencePath = useMemo(() => {
    if (!processedData || processedData.points.length === 0) {
      return '';
    }
    
    if (processedData.maxCadence === null || processedData.maxCadence === undefined) {
      return '';
    }
    
    // Filter points with valid cadence data (include 0 values)
    const validPoints = processedData.points.filter(p => p.cadence !== null && p.cadence !== undefined && p.cadence >= 0);
    
    if (validPoints.length === 0) {
      return '';
    }
    
    const points = validPoints
      .map(p => {
        const x = xScale(p.distance);
        const y = cadenceYScale(p.cadence);
        if (x === null || isNaN(x) || y === null || isNaN(y)) return null;
        return { x, y };
      })
      .filter(p => p !== null && p.x !== null && p.y !== null);
    
    if (points.length === 0) {
      console.log('No valid cadence points after scaling');
      return '';
    }
    
    console.log('Cadence path created with', points.length, 'points, first point:', points[0], 'last point:', points[points.length - 1]);
    // Always use straight lines - smoothing is applied to data, not to the curve
    return `M ${points[0].x},${points[0].y} L ${points.slice(1).map(p => `${p.x},${p.y}`).join(' L ')}`;
  }, [processedData, xScale, cadenceYScale]);

  const elevationPath = useMemo(() => {
    if (!processedData || processedData.points.length === 0 || processedData.maxAltitude === null || processedData.minAltitude === null) return '';
    
    // Include all points with valid elevation data (can be 0 or negative)
    const validPoints = processedData.points.filter(p => p.altitude !== null && p.altitude !== undefined);
    if (validPoints.length === 0) {
      console.log('No valid elevation points found, maxAltitude:', processedData.maxAltitude, 'minAltitude:', processedData.minAltitude);
      return '';
    }
    
    const points = validPoints
      .map(p => {
        const x = xScale(p.distance);
        const y = elevationYScale(p.altitude);
        if (x === null || isNaN(x) || y === null || isNaN(y)) return null;
        return { x, y };
      })
      .filter(p => p !== null && p.x !== null && p.y !== null);
    
    if (points.length === 0) {
      return '';
    }
    // Always use straight lines - smoothing is applied to data, not to the curve
    return `M ${points[0].x},${points[0].y} L ${points.slice(1).map(p => `${p.x},${p.y}`).join(' L ')}`;
  }, [processedData, xScale, elevationYScale]);

  // Generate area paths (closed paths for filled areas)
  const speedAreaPath = useMemo(() => {
    if (!speedPath || !processedData) return '';
    // Find first and last visible points
    const visiblePoints = processedData.points.filter(p => {
      const x = xScale(p.distance);
      return x !== null && !isNaN(x);
    });
    if (visiblePoints.length === 0) return '';
    
    const firstPoint = visiblePoints[0];
    const lastPoint = visiblePoints[visiblePoints.length - 1];
    const firstX = xScale(firstPoint.distance);
    const lastX = xScale(lastPoint.distance);
    const baseY = padding.top + graphHeight;
    
    if (firstX === null || lastX === null) return speedPath;
    return `${speedPath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [speedPath, processedData, xScale, padding.top, graphHeight]);

  const hrAreaPath = useMemo(() => {
    if (!hrPath || !processedData) return '';
    // Find first and last visible points
    const visiblePoints = processedData.points.filter(p => {
      const x = xScale(p.distance);
      return x !== null && !isNaN(x);
    });
    if (visiblePoints.length === 0) return '';
    
    const firstPoint = visiblePoints[0];
    const lastPoint = visiblePoints[visiblePoints.length - 1];
    const firstX = xScale(firstPoint.distance);
    const lastX = xScale(lastPoint.distance);
    const baseY = padding.top + graphHeight;
    
    if (firstX === null || lastX === null) return hrPath;
    return `${hrPath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [hrPath, processedData, xScale, padding.top, graphHeight]);

  const powerAreaPath = useMemo(() => {
    if (!powerPath || !processedData) return '';
    // Find first and last visible points
    const visiblePoints = processedData.points.filter(p => {
      const x = xScale(p.distance);
      return x !== null && !isNaN(x);
    });
    if (visiblePoints.length === 0) return '';
    
    const firstPoint = visiblePoints[0];
    const lastPoint = visiblePoints[visiblePoints.length - 1];
    const firstX = xScale(firstPoint.distance);
    const lastX = xScale(lastPoint.distance);
    const baseY = padding.top + graphHeight;
    
    if (firstX === null || lastX === null) return powerPath;
    return `${powerPath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [powerPath, processedData, xScale, padding.top, graphHeight]);

  const elevationAreaPath = useMemo(() => {
    if (!elevationPath || elevationPath.length === 0 || !processedData || processedData.maxAltitude === null || processedData.minAltitude === null) {
      return '';
    }
    // Find first and last visible points with elevation data (include all values, not just > 0)
    const visiblePoints = processedData.points.filter(p => {
      const x = xScale(p.distance);
      return x !== null && !isNaN(x) && p.altitude !== null && p.altitude !== undefined;
    });
    if (visiblePoints.length === 0) {
      console.log('No visible elevation points');
      return '';
    }
    
    const firstPoint = visiblePoints[0];
    const lastPoint = visiblePoints[visiblePoints.length - 1];
    const firstX = xScale(firstPoint.distance);
    const lastX = xScale(lastPoint.distance);
    // Use minAltitude as the base for the area fill
    const baseY = elevationYScale(processedData.minAltitude);
    
    if (firstX === null || lastX === null) {
      return elevationPath;
    }
    
    const areaPath = `${elevationPath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    return areaPath;
  }, [elevationPath, processedData, xScale, elevationYScale]);

  // Handle touch/click for mobile tooltip
  const handleTouchStart = useCallback((e) => {
    if (!containerRef.current || !processedData || !isMobile) return;
    
    // If two touches, allow pinch zoom (don't prevent default)
    if (e.touches.length > 1) {
      return; // Let browser handle pinch zoom
    }
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    // Convert screen px → SVG viewBox units (the SVG is width:100% over a fixed
    // svgWidth viewBox), so relativeX matches graphWidth / xScale / padding.left
    // which are all in SVG units. Without this the selection band drifts on
    // phones where the rendered width ≠ svgWidth.
    const relativeX = (x / (rect.width || svgWidth)) * svgWidth - padding.left;

    if (relativeX < 0 || relativeX > graphWidth) return;

    // Find closest point
    const clampedRelativeX = Math.max(0, Math.min(relativeX, graphWidth));
    let closestPoint = null;
    let minDist = Infinity;
    
    for (const point of processedData.points) {
      const pointX = xScale(point.distance);
      if (pointX === null || isNaN(pointX)) continue;
      
      const pointRelativeX = pointX - padding.left;
      const dist = Math.abs(pointRelativeX - clampedRelativeX);
      
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    }
    
    // Remember where the finger landed — a horizontal drag from here becomes a
    // range selection; a tap stays a tooltip.
    touchSelRef.current = { startRel: clampedRelativeX, endRel: clampedRelativeX, selecting: false };

    // Show top-bar info immediately on touch
    if (closestPoint) {
      setTouchActive(true);
      setClickedPoint(closestPoint);
      setClickedCursorX(x);
    }
  }, [processedData, graphWidth, padding.left, isMobile, xScale, svgWidth]);

  // Track finger movement — small move = scrub tooltip, horizontal drag = select
  const handleTouchMove = useCallback((e) => {
    if (!containerRef.current || !processedData || !isMobile) return;
    if (e.touches.length > 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    // px → SVG units (see handleTouchStart) so the selection matches the bars.
    const relativeX = Math.max(0, Math.min((x / (rect.width || svgWidth)) * svgWidth - padding.left, graphWidth));

    const sel = touchSelRef.current;
    // Enter selection mode once the finger has travelled far enough horizontally.
    if (!sel.selecting && sel.startRel != null && Math.abs(relativeX - sel.startRel) > 14) {
      sel.selecting = true;
      setIsDragging(true);
      setDragStart({ relativeX: sel.startRel });
      // Selecting a range — drop the single-point tooltip.
      setClickedPoint(null);
      setClickedCursorX(null);
      setTouchActive(false);
    }
    if (sel.selecting) {
      sel.endRel = relativeX;
      setDragEnd({ relativeX });
      return;
    }

    // Otherwise keep scrubbing the tooltip.
    let closestPoint = null, minDist = Infinity;
    for (const point of processedData.points) {
      const px = xScale(point.distance);
      if (px === null || isNaN(px)) continue;
      const d = Math.abs((px - padding.left) - relativeX);
      if (d < minDist) { minDist = d; closestPoint = point; }
    }
    if (closestPoint) {
      setClickedPoint(closestPoint);
      setClickedCursorX(x);
    }
  }, [processedData, graphWidth, padding.left, isMobile, xScale, svgWidth]);

  // On lift: if we were selecting, summarise the marked segment; else clear.
  const handleTouchEnd = useCallback(() => {
    const sel = touchSelRef.current;
    if (sel.selecting) {
      summarizeFromRelativeX(sel.startRel, sel.endRel);
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
    touchSelRef.current = { startRel: null, endRel: null, selecting: false };
    setTouchActive(false);
  }, [summarizeFromRelativeX]);

  // Handle mouse down for drag selection (desktop)
  const handleMouseDown = useCallback((e) => {
    if (!containerRef.current || !processedData) return;
    if (e.button !== 0) return; // Only left mouse button
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // px → SVG units so selection/point-finding matches the bars (see handleTouchStart).
    const relativeX = (x / (rect.width || svgWidth)) * svgWidth - padding.left;
    
    if (relativeX < 0 || relativeX > graphWidth) return;
    
    // On mobile, handle click to show/hide tooltip
    if (isMobile) {
      // Find closest point
      const clampedRelativeX = Math.max(0, Math.min(relativeX, graphWidth));
      let closestPoint = null;
      let minDist = Infinity;
      
      for (const point of processedData.points) {
        const pointX = xScale(point.distance);
        if (pointX === null || isNaN(pointX)) continue;
        
        const pointRelativeX = pointX - padding.left;
        const dist = Math.abs(pointRelativeX - clampedRelativeX);
        
        if (dist < minDist) {
          minDist = dist;
          closestPoint = point;
        }
      }
      
      // Toggle tooltip on click
      if (closestPoint && clickedPoint === closestPoint) {
        // If clicking the same point, hide tooltip
        setClickedPoint(null);
        setClickedCursorX(null);
      } else if (closestPoint) {
        // Show tooltip for clicked point
        setClickedPoint(closestPoint);
        setClickedCursorX(x);
      }
      
      // Don't start dragging on mobile
      return;
    }
    
    setIsDragging(true);
    setDragStart({ x, relativeX });
    setDragEnd({ x, relativeX });
    setCursorX(null);
    setHoveredPoint(null);
    setClickedPoint(null);
    setClickedCursorX(null);
  }, [processedData, graphWidth, padding.left, isMobile, clickedPoint, xScale, svgWidth]);

  // Handle mouse move with throttling to reduce CPU usage
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current || !processedData) return;
    
    // Throttle to max 30fps (33ms) to reduce CPU usage
    if (mouseMoveTimeoutRef.current) {
      return;
    }
    
    mouseMoveTimeoutRef.current = setTimeout(() => {
      mouseMoveTimeoutRef.current = null;
    }, 33);
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // px → SVG units so selection/point-finding matches the bars (see handleTouchStart).
    const relativeX = (x / (rect.width || svgWidth)) * svgWidth - padding.left;
    
    // If dragging, update drag end (no throttling for dragging)
    if (isDragging && dragStart) {
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
        mouseMoveTimeoutRef.current = null;
      }
      setDragEnd({ x, relativeX });
      return;
    }
    
    // Allow hover slightly outside the graph boundaries for better UX
    // Extended range to allow hovering near edges
    if (relativeX < -20 || relativeX > graphWidth + 20) {
      setCursorX(null);
      setHoveredPoint(null);
      if (onLeave) onLeave();
      return;
    }

    // Set cursor X to mouse position - cursor line follows the mouse
    setCursorX(x);

    // Find closest point by pixel X position
    // Optimize: limit search to reasonable number of points to reduce CPU usage
    let closestPoint = null;
    let minDist = Infinity;
    
    // Clamp relativeX to valid range for comparison
    const clampedRelativeX = Math.max(0, Math.min(relativeX, graphWidth));
    
    // Optimize: limit search to max 500 points (sample every Nth point if more)
    const searchLimit = Math.min(processedData.points.length, 500);
    const step = Math.max(1, Math.floor(processedData.points.length / searchLimit));
    
    // Find closest point by comparing pixel X positions
    for (let i = 0; i < processedData.points.length; i += step) {
      const point = processedData.points[i];
      const pointX = xScale(point.distance);
      if (pointX === null || isNaN(pointX)) continue;
      
      // Compare relative X positions (without padding)
      const pointRelativeX = pointX - padding.left;
      const dist = Math.abs(pointRelativeX - clampedRelativeX);
      
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
      }
    }
    
    // If no point found in zoom range, try finding by distance value as fallback
    if (!closestPoint) {
      const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
      const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
      const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
      const normalizedX = Math.max(0, Math.min(clampedRelativeX / graphWidth, 1));
      const mouseDistance = zoomedMinDistance + normalizedX * zoomedRange;
      
      for (const point of processedData.points) {
        const dist = Math.abs(point.distance - mouseDistance);
        if (dist < minDist) {
          minDist = dist;
          closestPoint = point;
        }
      }
    }

    if (closestPoint) {
      setHoveredPoint(closestPoint);
      if (onHover) onHover(closestPoint);
    } else {
      setHoveredPoint(null);
      if (onLeave) onLeave();
    }
  }, [processedData, graphWidth, padding.left, onHover, onLeave, isDragging, dragStart, zoomRange, xScale, svgWidth]);

  // Handle mouse up for zoom
  const handleMouseUp = useCallback((e) => {
    if (!isDragging || !dragStart || !dragEnd || !processedData) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    
    const startX = Math.min(dragStart.relativeX, dragEnd.relativeX);
    const endX = Math.max(dragStart.relativeX, dragEnd.relativeX);
    const selectionWidth = endX - startX;
    
    // Only zoom if selection is meaningful (at least 5% of graph width)
    if (selectionWidth > graphWidth * 0.05) {
      // Convert X positions to distance ratios
      const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
      const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
      const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
      
      const startDistance = zoomedMinDistance + (startX / graphWidth) * zoomedRange;
      const endDistance = zoomedMinDistance + (endX / graphWidth) * zoomedRange;
      
      const newMin = startDistance / processedData.maxDistance;
      const newMax = endDistance / processedData.maxDistance;
      
      setZoomRange({ min: Math.max(0, newMin), max: Math.min(1, newMax) });

      let startIndex = 0;
      let endIndex = processedData.points.length - 1;
      for (let i = 0; i < processedData.points.length; i++) {
        if (processedData.points[i].distance >= startDistance) {
          startIndex = i;
          break;
        }
      }
      for (let i = processedData.points.length - 1; i >= 0; i--) {
        if (processedData.points[i].distance <= endDistance) {
          endIndex = i;
          break;
        }
      }
      summarizeWindow(processedData.points, startIndex, endIndex, 'Selected segment');
    }
    
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, processedData, graphWidth, zoomRange, summarizeWindow]);

  const handleMouseLeave = useCallback(() => {
    // On mobile, don't clear clicked point on mouse leave
    if (!isMobile) {
    setCursorX(null);
    setHoveredPoint(null);
    if (onLeave) onLeave();
    }
  }, [onLeave, isMobile]);

  if (!chartData || !processedData) {
    console.log('TrainingChart: Missing data', { chartData: !!chartData, processedData: !!processedData, training: !!training });
    return null;
  }

  return (
    <div className={`relative bg-white ${isMobile ? 'rounded-lg p-2' : 'rounded-2xl p-4'} shadow-lg `}>
      {/* Header with Legend and Smoothness Control */}
      <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} mb-2 sm:mb-4 flex-wrap gap-2 sm:gap-4`}>
        {/* Legend with toggle buttons */}
        <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-4'} ${isMobile ? 'text-xs' : 'text-sm'} flex-wrap`}>
          {/* Only show power toggle if power data exists and it's not running or swimming */}
          {processedData && processedData.hasPower && !isRunning && !isSwimming && (
          <button
            onClick={() => setShowPower(!showPower)}
              className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded transition-colors ${
              showPower ? 'bg-purple-100' : 'bg-gray-100 opacity-50'
            }`}
          >
              <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded-full ${showPower ? 'bg-purple-600' : 'bg-gray-400'}`}></div>
              <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${showPower ? 'text-gray-700' : 'text-gray-400'}`}>Power</span>
          </button>
          )}
          {processedData && processedData.hasHeartRate && (
          <button
            onClick={() => setShowHeartRate(!showHeartRate)}
            className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded transition-colors ${
              showHeartRate ? 'bg-red-100' : 'bg-gray-100 opacity-50'
            }`}
          >
            <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded-full ${showHeartRate ? 'bg-red-400' : 'bg-gray-400'}`}></div>
            <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${showHeartRate ? 'text-gray-700' : 'text-gray-400'}`}>Heart Rate</span>
          </button>
          )}
          {processedData && processedData.hasSpeed && (
          <button
            onClick={() => setShowSpeed(!showSpeed)}
            className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded transition-colors ${
              showSpeed ? 'bg-teal-100' : 'bg-gray-100 opacity-50'
            }`}
          >
            <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded-full ${showSpeed ? 'bg-teal-500' : 'bg-gray-400'}`}></div>
            <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${showSpeed ? 'text-gray-700' : 'text-gray-400'}`}>Speed</span>
          </button>
          )}
          {/* Only show cadence toggle if cadence data is available (even if maxCadence is 0) */}
          {processedData && processedData.maxCadence !== null && processedData.maxCadence !== undefined && (
          <button
            onClick={() => setShowCadence(!showCadence)}
              className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded transition-colors ${
              showCadence ? 'bg-gray-200' : 'bg-gray-100 opacity-50'
            }`}
          >
              <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded-full ${showCadence ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
              <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${showCadence ? 'text-gray-700' : 'text-gray-400'}`}>Cadence</span>
          </button>
          )}
          {/* Only show elevation toggle if elevation data is available and it's not swimming */}
          {processedData && processedData.maxAltitude !== null && processedData.minAltitude !== null && !isSwimming && (
            <button
              onClick={() => setShowElevation(!showElevation)}
              className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded transition-colors ${
                showElevation ? 'bg-orange-100' : 'bg-gray-100 opacity-50'
              }`}
            >
              <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded-full ${showElevation ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
              <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${showElevation ? 'text-gray-700' : 'text-gray-400'}`}>Elevation</span>
            </button>
          )}
          {/* Target training-zone bands toggle — only when the athlete has zones */}
          {hasZoneData && (
            <button
              onClick={() => setShowZones(!showZones)}
              className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded transition-colors ${
                showZones ? 'bg-indigo-100' : 'bg-gray-100 opacity-50'
              }`}
              title="Show target training zones behind the line"
            >
              <div className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'} rounded-sm overflow-hidden flex flex-col`}>
                <span className="flex-1" style={{ backgroundColor: showZones ? '#f87171' : '#9ca3af' }} />
                <span className="flex-1" style={{ backgroundColor: showZones ? '#fbbf24' : '#9ca3af' }} />
                <span className="flex-1" style={{ backgroundColor: showZones ? '#34d399' : '#9ca3af' }} />
              </div>
              <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} ${showZones ? 'text-gray-700' : 'text-gray-400'}`}>Zones</span>
            </button>
          )}
        </div>

        <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2 sm:gap-4`}>
          {/* Smoothness Control */}
          <div className="flex items-center gap-2">
            <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Smoothness:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
              className={isMobile ? 'w-24' : 'w-32'}
            />
            <span className={`${isMobile ? 'text-[10px] w-12' : 'text-xs w-16'} text-gray-500`}>
              {smoothing === 0 ? 'Raw' : `${Math.round(1 + smoothing * 19)}s avg`}
            </span>
          </div>
          
          {/* Reset Zoom Button */}
          {(zoomRange.min > 0 || zoomRange.max < 1) && (
            <button
              onClick={() => setZoomRange({ min: 0, max: 1 })}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors`}
            >
              Reset Zoom
            </button>
          )}
        </div>
      </div>

      {/* Discovery hint — only until the user has a selection */}
      {!highlightSummary && (
        <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mb-1`}>
          {isMobile ? 'Drag across the chart to measure a segment' : 'Drag across the chart to zoom & measure a segment'}
        </div>
      )}

      {/* Highlighted window summary (from Power Radar) */}
      {highlightSummary && (
        <div className={`mb-2 sm:mb-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 ${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm'} text-gray-700`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-blue-800">
              {highlightSummary.label}
            </span>
            {radarWatts > 0 && (
              <span>
                Power Radar:{' '}
                <span className="font-bold text-indigo-700">{radarWatts} W</span>
              </span>
            )}
            <span>
              Duration: <span className="font-medium">{formatDuration(highlightSummary.durationSec)}</span>
            </span>
            {hasDistanceAxis && (
            <span>
              Distance:{' '}
              <span className="font-medium">
                {formatDistance((highlightSummary.distanceKm || 0) * 1000, unitSystem).formatted}
              </span>
            </span>
            )}
            {highlightSummary.avgPower != null && highlightSummary.avgPower > 0 && (
              <span>
                Avg Power:{' '}
                <span className="font-medium text-purple-700">
                  {Math.round(highlightSummary.avgPower)} W
                </span>
              </span>
            )}
            {highlightSummary.avgHr != null && highlightSummary.avgHr > 0 && (
              <span>
                Avg HR:{' '}
                <span className="font-medium text-red-600">
                  {Math.round(highlightSummary.avgHr)} bpm
                </span>
              </span>
            )}
            {highlightSummary.avgSpeedKmh != null && highlightSummary.avgSpeedKmh > 0 && (
              <span>
                Avg Speed:{' '}
                <span className="font-medium text-teal-700">
                  {unitSystem === 'imperial'
                    ? `${(highlightSummary.avgSpeedKmh * 0.621371).toFixed(1)} mph`
                    : `${highlightSummary.avgSpeedKmh.toFixed(1)} km/h`}
                </span>
              </span>
            )}
            {highlightSummary.avgCadence != null && (
              <span>
                Avg Cadence:{' '}
                <span className="font-medium">
                  {Math.round(highlightSummary.avgCadence)} rpm
                </span>
              </span>
            )}
            <button
              onClick={() => {
                setHighlightWindow(null);
                setHighlightSummary(null);
                setZoomRange({ min: 0, max: 1 });
                setHoveredPoint(null);
              }}
              className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2"
            >
              View Full Training
            </button>
          </div>
        </div>
      )}

      {/* Chart */}
      <div
        ref={containerRef}
        className={`relative ${isMobile ? 'rounded-md' : 'rounded-lg'} bg-white overflow-hidden`}
        style={{ height: `${chartHeight}px`, width: '100%', cursor: isDragging ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={(e) => {
          handleMouseLeave();
          if (isDragging) {
            handleMouseUp(e);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag selection rectangle — relativeX is in SVG units, convert the
            horizontal values back to screen px (the SVG is width:100% over a
            fixed viewBox). Vertical stays 1:1 (svgHeight renders at px height). */}
        {isDragging && dragStart && dragEnd && (() => {
          const pxPerSvg = (containerWidth || svgWidth) / svgWidth;
          const startX = Math.min(dragStart.relativeX, dragEnd.relativeX);
          const w = Math.abs(dragEnd.relativeX - dragStart.relativeX);
          return (
            <div
              className="absolute border-2 border-blue-500 bg-blue-200/20 pointer-events-none z-40"
              style={{
                left: `${(padding.left + startX) * pxPerSvg}px`,
                top: `${padding.top}px`,
                width: `${w * pxPerSvg}px`,
                height: `${graphHeight}px`
              }}
            />
          );
        })()}
        <svg
          ref={svgRef}
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="absolute inset-0"
          preserveAspectRatio="none"
          style={{ 
            width: '100%', 
            height: `${svgHeight}px`,
            display: 'block',
            overflow: 'visible',
            minWidth: 0
          }}
        >
          {/* Grid lines */}
          {Array.from({ length: 6 }).map((_, i) => {
            const y = padding.top + (graphHeight / 5) * i;
            return (
              <line
                key={`grid-y-${i}`}
                x1={padding.left}
                y1={y}
                x2={padding.left + graphWidth}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            );
          })}

          {/* Target training-zone bands — drawn behind the metric areas/lines */}
          {showZones && zoneOverlay && [1, 2, 3, 4, 5].map((i) => {
            const z = zoneOverlay.zones[`zone${i}`];
            if (!z) return null;
            const lo = Number(z.min) || 0;
            const hi = (z.max === Infinity || z.max == null) ? zoneOverlay.maxVal : Number(z.max);
            if (hi <= lo) return null;
            const yTop = zoneOverlay.yScaleFn(Math.min(hi, zoneOverlay.maxVal));
            const yBot = zoneOverlay.yScaleFn(lo);
            const h = Math.max(0, yBot - yTop);
            if (h <= 0) return null;
            return (
              <g key={`zone-band-${i}`}>
                <rect x={padding.left} y={yTop} width={graphWidth} height={h} fill={ZONE_FILLS[i - 1]} />
                {h > 12 && (
                  <text x={padding.left + 4} y={yTop + 11} fontSize={isMobile ? 8 : 10} fontWeight="700" fill="#64748b" opacity="0.7">
                    Z{i}
                  </text>
                )}
              </g>
            );
          })}

          {/* Highlighted window band (if available) */}
          {highlightWindow && processedData && (() => {
            const xStart = xScale(highlightWindow.startDistance);
            const xEnd = xScale(highlightWindow.endDistance);
            if (xStart == null || xEnd == null) return null;
            const x = Math.min(xStart, xEnd);
            const width = Math.abs(xEnd - xStart);
            return (
              <rect
                x={x}
                y={padding.top}
                width={width}
                height={graphHeight}
                fill="rgba(191, 219, 254, 0.35)" // blue-200 with some transparency
              />
            );
          })()}

          {/* X-axis grid lines with zoom support */}
          {Array.from({ length: 11 }).map((_, i) => {
            if (!processedData) return null;
            const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
            const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
            const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
            const distance = zoomedMinDistance + (zoomedRange / 10) * i;
            const x = xScale(distance);
            if (x === null) return null;
            return (
              <line
                key={`grid-x-${i}`}
                x1={x}
                y1={padding.top}
                x2={x}
                y2={padding.top + graphHeight}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            );
          })}

          {/* Area fills - Elevation in background first */}
          {showElevation && elevationAreaPath && elevationAreaPath.length > 0 && (
            <path
              d={elevationAreaPath}
              fill="url(#elevationGradient)"
              opacity="0.5"
            />
          )}
          {showSpeed && (
            <path
              d={speedAreaPath}
              fill="url(#speedGradient)"
              opacity="0.3"
            />
          )}
          {showHeartRate && (
            <path
              d={hrAreaPath}
              fill="url(#hrGradient)"
              opacity="0.3"
            />
          )}
          {processedData && processedData.maxPower > 0 && !isRunning && !isSwimming && showPower && (
            <path
              d={powerAreaPath}
              fill="url(#powerGradient)"
              opacity="0.3"
            />
          )}

          {/* Gradients */}
          <defs>
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hrGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f87171" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="powerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#9333ea" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#9333ea" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="elevationGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6b7280" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#9ca3af" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Lines */}
          {showSpeed && (
            <path
              d={speedPath}
              fill="none"
              stroke="#14b8a6"
              strokeWidth="1.5"
            />
          )}
          {showHeartRate && (
            <path
              d={hrPath}
              fill="none"
              stroke="#f87171"
              strokeWidth="1.5"
            />
          )}
          {processedData && processedData.maxPower > 0 && !isRunning && !isSwimming && showPower && (
            <path
              d={powerPath}
              fill="none"
              stroke="#9333ea"
              strokeWidth="1.5"
            />
          )}
          {showCadence && cadencePath && cadencePath.length > 0 && (
            <path
              d={cadencePath}
              fill="none"
              stroke="#374151"
              strokeWidth="2.5"
              opacity="0.9"
            />
          )}

          {/* X-axis labels (distance) - show only start, middle, and end on mobile */}
          {(() => {
            if (!processedData) return null;
            const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
            const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
            const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
            
            // On mobile, show only 3 labels (start, middle, end)
            // On desktop, show 11 labels
            const labelCount = isMobile ? 3 : 11;
            
            return Array.from({ length: labelCount }).map((_, i) => {
              const distance = zoomedMinDistance + (zoomedRange / (labelCount - 1)) * i;
            const x = xScale(distance);
            if (x === null) return null;
              
              // Calculate time at this distance
              const timeAtDistance = processedData.points.find(p => p.distance >= distance)?.time || 0;
              
            return (
              <g key={`x-label-${i}`}>
                <text
                  x={x}
                    y={svgHeight - padding.bottom + (isMobile ? 15 : 20)}
                  textAnchor="middle"
                    className={`${isMobile ? 'text-[9px]' : containerWidth < 800 ? 'text-[10px]' : 'text-xs'} fill-gray-600`}
                >
                    {fmtXLabel(distance)}
                    {isMobile && i === labelCount - 1 && hasDistanceAxis && timeAtDistance > 0 && (
                      <tspan x={x} dy="10" className="text-[8px] fill-gray-500">
                        {formatDuration(timeAtDistance)}
                      </tspan>
                    )}
                </text>
              </g>
            );
            });
          })()}

          {/* Y-axis labels - show percentage (0-100%) since all metrics are normalized */}
          {Array.from({ length: 6 }).map((_, i) => {
            const ratio = 1 - (i / 5);
            const y = padding.top + (graphHeight / 5) * i;
            const percentage = Math.round(ratio * 100);
            
            return (
              <g key={`y-label-${i}`}>
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className={`${isMobile ? 'text-[9px]' : 'text-xs'} fill-gray-600`}
                >
                  {percentage}%
                </text>
              </g>
            );
          })}
          

          {/* Cursor line - desktop hover OR mobile touch */}
          {((cursorX !== null && !isDragging) || (isMobile && touchActive && clickedCursorX !== null)) && (() => {
            const activeCX = isMobile ? clickedCursorX : cursorX;
            if (activeCX === null) return null;
            const cw = containerRef.current?.offsetWidth || svgWidth;
            const scaleX = svgWidth / cw;
            const svgX = activeCX * scaleX;
            return (
              <line
                x1={svgX}
                y1={padding.top}
                x2={svgX}
                y2={padding.top + graphHeight}
                stroke={isMobile ? '#6366f1' : '#000'}
                strokeWidth={isMobile ? '2' : '1.5'}
                strokeDasharray={isMobile ? '4,3' : undefined}
              />
            );
          })()}
        </svg>

        {/* ── MOBILE: fixed top-bar info strip ── */}
        {isMobile && clickedPoint && (
          <div
            className="absolute left-0 right-0 z-50 pointer-events-none flex items-center gap-3 px-2 py-1 flex-wrap"
            style={{
              top: 0,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(4px)',
              borderBottom: '1px solid #e5e7eb',
              borderRadius: '6px 6px 0 0',
              minHeight: 28,
            }}
          >
            <span className="text-[10px] font-semibold text-gray-800">
              {fmtXLabel(clickedPoint.distance)}
            </span>
            <span className="text-[10px] text-gray-500">
              {formatDuration(clickedPoint.time)}
            </span>
            {processedData && processedData.maxPower > 0 && !isRunning && !isSwimming && clickedPoint.power > 0 && (
              <span className="text-[10px] font-semibold text-purple-600">
                {Math.round(clickedPoint.power)} W
              </span>
            )}
            {clickedPoint.heartRate > 0 && (
              <span className="text-[10px] font-semibold text-red-500">
                ♥ {Math.round(clickedPoint.heartRate)} bpm
                {hrZones && (() => {
                  const z = getHeartRateZone(clickedPoint.heartRate, hrZones);
                  return z ? <span className="text-gray-400 font-normal"> Z{z}</span> : null;
                })()}
              </span>
            )}
            {clickedPoint.speed > 0 && (
              <span className="text-[10px] font-semibold text-teal-600">
                {unitSystem === 'imperial'
                  ? `${(clickedPoint.speed * 0.621371).toFixed(1)} mph`
                  : `${clickedPoint.speed.toFixed(1)} km/h`}
              </span>
            )}
            {clickedPoint.cadence > 0 && (
              <span className="text-[10px] text-gray-500">
                {Math.round(clickedPoint.cadence)} rpm
              </span>
            )}
            {clickedPoint.altitude != null && clickedPoint.altitude > 0 && (
              <span className="text-[10px] text-orange-500">
                ↑ {formatElevation(clickedPoint.altitude, unitSystem).formatted}
              </span>
            )}
          </div>
        )}

        {/* ── DESKTOP: floating tooltip on hover ── */}
        {!isMobile && hoveredPoint && cursorX !== null && !isDragging && (() => {
          const activePoint = hoveredPoint;
          const activeCursorX = cursorX;

          if (!activePoint || activeCursorX === null) return null;

          const cw = containerRef.current?.offsetWidth || svgWidth;
          const tooltipWidth = 200;
          const offset = 15;
          const pointX = xScale(activePoint.distance);
          const actualPointX = pointX !== null ? pointX : activeCursorX;

          let tooltipLeft = actualPointX + offset;
          if (tooltipLeft + tooltipWidth > cw - 10) {
            tooltipLeft = actualPointX - tooltipWidth - offset;
          }
          if (tooltipLeft < 10) tooltipLeft = 10;

          const hrZone = hrZones && activePoint.heartRate > 0
            ? getHeartRateZone(activePoint.heartRate, hrZones)
            : null;

          return (
            <div
              className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 pointer-events-none"
              style={{ left: `${tooltipLeft}px`, top: '10px', minWidth: '180px' }}
            >
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-gray-900">
                  {xAxisName}: {fmtXLabel(activePoint.distance)}
                </div>
                <div className="text-gray-600">
                  Time: {formatDuration(activePoint.time)}
                </div>
                {processedData && processedData.maxPower > 0 && !isRunning && !isSwimming && activePoint.power > 0 && (
                  <div className="text-purple-600 font-medium">
                    Power: {Math.round(activePoint.power)} W
                  </div>
                )}
                {activePoint.heartRate > 0 && (
                  <div className="text-red-500 font-medium">
                    Heart Rate: {Math.round(activePoint.heartRate)} bpm
                    {hrZone && ` (Zone ${hrZone})`}
                  </div>
                )}
                {activePoint.speed > 0 && (
                  <div className="text-teal-600 font-medium">
                    Speed: {unitSystem === 'imperial'
                      ? `${(activePoint.speed * 0.621371).toFixed(1)} mph`
                      : `${activePoint.speed.toFixed(1)} km/h`}
                  </div>
                )}
                {activePoint.cadence > 0 && (
                  <div className="text-gray-600">
                    Cadence: {Math.round(activePoint.cadence)} rpm
                  </div>
                )}
                {activePoint.altitude > 0 && (
                  <div className="text-orange-600 font-medium">
                    Elevation: {formatElevation(activePoint.altitude, unitSystem).formatted}
                  </div>
                )}
                {/* Zone indicators */}
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                  {isRunning && powerZones && activePoint.speed > 0 && (() => {
                    const speedMps = activePoint.speed / 3.6;
                    const paceSeconds = unitSystem === 'imperial'
                      ? Math.round(1609.34 / speedMps)
                      : Math.round(1000 / speedMps);
                    const currentZone = getPaceZone(paceSeconds, powerZones, unitSystem);
                    return (
                      <div>
                        <div className="text-xs font-semibold text-gray-700 mb-1">Pace zone</div>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => {
                            const zone = powerZones[`zone${i + 1}`];
                            let zoneMin = zone?.min || 0;
                            let zoneMax = zone?.max === Infinity || zone?.max === null || zone?.max === undefined ? Infinity : zone.max;
                            if (unitSystem === 'imperial') {
                              zoneMin = zoneMin * 1.60934;
                              zoneMax = zoneMax === Infinity ? Infinity : zoneMax * 1.60934;
                            }
                            return (
                              <div
                                key={i}
                                className={`w-3 h-3 rounded ${currentZone === i + 1 ? 'bg-green-600 border-2 border-green-800' : 'bg-gray-200 border border-gray-300'}`}
                                title={`Zone ${i + 1}: ${formatPace(zoneMax, unitSystem)} - ${formatPace(zoneMin, unitSystem)}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {isCycling && powerZones && activePoint.power > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-1">Power zone</div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const zone = getPowerZone(activePoint.power, powerZones);
                          return (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded ${zone === i + 1 ? 'bg-purple-600 border-2 border-purple-800' : 'bg-gray-200 border border-gray-300'}`}
                              title={`Zone ${i + 1}: ${powerZones[`zone${i + 1}`]?.min || 0}-${powerZones[`zone${i + 1}`]?.max === Infinity ? '∞' : powerZones[`zone${i + 1}`]?.max || 0} W`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {hrZones && activePoint.heartRate > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-1">Heart rate</div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const zone = getHeartRateZone(activePoint.heartRate, hrZones);
                          return (
                            <div
                              key={`hr-zone-${i + 1}`}
                              className={`w-3 h-3 rounded ${zone === i + 1 ? 'bg-red-500 border-2 border-red-700' : 'bg-gray-200 border border-gray-300'}`}
                              title={`Zone ${i + 1}: ${hrZones[`zone${i + 1}`]?.min || 0}-${hrZones[`zone${i + 1}`]?.max === Infinity ? '∞' : hrZones[`zone${i + 1}`]?.max || 0} bpm`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

    </div>
  );
};

export default TrainingChart;

