import React, { useState, useRef, useMemo, useCallback } from 'react';
import { prepareTrainingChartData, formatDuration } from '../../utils/fitAnalysisUtils';

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


const TrainingChart = ({ training, userProfile, onHover, onLeave }) => {
  const [smoothing, setSmoothing] = useState(0.5); // Default 50%
  const [showPower, setShowPower] = useState(true);
  const [showHeartRate, setShowHeartRate] = useState(true);
  const [showSpeed, setShowSpeed] = useState(true);
  const [showCadence, setShowCadence] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [cursorX, setCursorX] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [zoomRange, setZoomRange] = useState({ min: 0, max: 1 }); // 0-1 range of distance to show
  const svgRef = useRef(null);
  const containerRef = useRef(null);

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
    
    // Convert to distance-based data - use actual distance from records if available
    let cumulativeDistance = 0;
    const distanceData = records.map((record, i) => {
      // Use distance from record if available (in meters), otherwise calculate from speed
      if (record.distance !== undefined && record.distance !== null && record.distance > 0) {
        cumulativeDistance = record.distance / 1000; // Convert meters to km
      } else if (i > 0) {
        const prevRecord = records[i - 1];
        const timeDiff = record.timeFromStart - prevRecord.timeFromStart;
        const avgSpeed = record.speed || prevRecord.speed || 0;
        cumulativeDistance += (avgSpeed / 3.6) * timeDiff; // Convert km/h to m/s, then to km
      }
      
      return {
        distance: cumulativeDistance,
        time: record.timeFromStart,
        speed: record.speed || 0, // Already in km/h from prepareTrainingChartData
        heartRate: record.heartRate || 0,
        power: record.power || 0,
        cadence: record.cadence || 0
      };
    });

    const maxDistance = distanceData[distanceData.length - 1]?.distance || 0;

    // Calculate smoothing window size based on smoothing value (0-1)
    // 0% = no smoothing (1 point), 50% = ~10s (assuming 1s intervals), 100% = ~20s
    const smoothingWindowSize = Math.max(1, Math.round(1 + smoothing * 19)); // 1 to 20 seconds
    
    // Apply moving average filter
    const powerValues = distanceData.map(d => d.power);
    const hrValues = distanceData.map(d => d.heartRate);
    const speedValues = distanceData.map(d => d.speed);
    const cadenceValues = distanceData.map(d => d.cadence);

    const filteredPower = applyMovingAverage(powerValues, smoothingWindowSize);
    const filteredHr = applyMovingAverage(hrValues, smoothingWindowSize);
    const filteredSpeed = applyMovingAverage(speedValues, smoothingWindowSize);
    const filteredCadence = applyMovingAverage(cadenceValues, smoothingWindowSize);
    
    // Create filtered points
    const filteredPoints = distanceData.map((d, i) => ({
      ...d,
      power: filteredPower[i] || 0,
      heartRate: filteredHr[i] || 0,
      speed: filteredSpeed[i] || 0,
      cadence: filteredCadence[i] || 0
    }));
    
    // Calculate max values from FILTERED data - this ensures smoothness changes are reflected
    // Ensure at least 1 to avoid division by zero
    const maxSpeed = Math.max(...filteredSpeed.filter(v => v > 0), 1);
    const maxHeartRate = Math.max(...filteredHr.filter(v => v > 0), 1);
    const maxPower = Math.max(...filteredPower.filter(v => v > 0), 1);
    const maxCadence = Math.max(...filteredCadence.filter(v => v > 0), 100); // Default to 100 rpm if no data
    
    return {
      points: filteredPoints,
      maxDistance,
      maxSpeed,
      maxHeartRate,
      maxPower,
      maxCadence
    };
  }, [chartData, smoothing]);

  // Chart dimensions
  const chartHeight = 400;
  const padding = { top: 40, right: 40, bottom: 50, left: 80 };
  const svgWidth = 1200;
  const svgHeight = chartHeight;
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  // Scale functions with zoom support
  const xScale = useCallback((distance) => {
    if (!processedData || processedData.maxDistance === 0) return 0;
    // Apply zoom range
    const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
    const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
    const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
    
    if (distance < zoomedMinDistance || distance > zoomedMaxDistance) return null;
    
    const normalizedDistance = (distance - zoomedMinDistance) / zoomedRange;
    return padding.left + normalizedDistance * graphWidth;
  }, [processedData, graphWidth, padding.left, zoomRange]);

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
    if (!processedData || processedData.maxCadence === 0) return padding.top + graphHeight;
    return padding.top + graphHeight - ((cadence / processedData.maxCadence) * effectiveGraphHeight);
  }, [processedData, effectiveGraphHeight, graphHeight, padding.top]);

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
    if (!processedData || processedData.points.length === 0) return '';
    const points = processedData.points
      .map(p => {
        const x = xScale(p.distance);
        const y = cadenceYScale(p.cadence);
        if (x === null || isNaN(x) || y === null || isNaN(y)) return null;
        return { x, y };
      })
      .filter(p => p !== null && p.x !== null && p.y !== null);
    if (points.length === 0) return '';
    
    // Always use straight lines - smoothing is applied to data, not to the curve
    return `M ${points[0].x},${points[0].y} L ${points.slice(1).map(p => `${p.x},${p.y}`).join(' L ')}`;
  }, [processedData, xScale, cadenceYScale]);

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

  // Handle mouse down for drag selection
  const handleMouseDown = useCallback((e) => {
    if (!containerRef.current || !processedData) return;
    if (e.button !== 0) return; // Only left mouse button
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relativeX = x - padding.left;
    
    if (relativeX < 0 || relativeX > graphWidth) return;
    
    setIsDragging(true);
    setDragStart({ x, relativeX });
    setDragEnd({ x, relativeX });
    setCursorX(null);
    setHoveredPoint(null);
  }, [processedData, graphWidth, padding.left]);

  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current || !processedData) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relativeX = x - padding.left;
    
    // If dragging, update drag end
    if (isDragging && dragStart) {
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
    // This ensures tooltip shows values for the point closest to the cursor visually
    let closestPoint = null;
    let minDist = Infinity;
    
    // Clamp relativeX to valid range for comparison
    const clampedRelativeX = Math.max(0, Math.min(relativeX, graphWidth));
    
    // Find closest point by comparing pixel X positions
    for (const point of processedData.points) {
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
  }, [processedData, graphWidth, padding.left, onHover, onLeave, isDragging, dragStart, zoomRange, xScale]);

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
    }
    
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, processedData, graphWidth, zoomRange]);

  const handleMouseLeave = useCallback(() => {
    setCursorX(null);
    setHoveredPoint(null);
    if (onLeave) onLeave();
  }, [onLeave]);

  if (!chartData || !processedData) {
    console.log('TrainingChart: Missing data', { chartData: !!chartData, processedData: !!processedData, training: !!training });
    return null;
  }

  return (
    <div className="relative bg-white rounded-2xl p-4 shadow-lg">
      {/* Header with Legend and Smoothness Control */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        {/* Legend with toggle buttons */}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <button
            onClick={() => setShowPower(!showPower)}
            className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
              showPower ? 'bg-purple-100' : 'bg-gray-100 opacity-50'
            }`}
          >
            <div className={`w-4 h-4 rounded-full ${showPower ? 'bg-purple-600' : 'bg-gray-400'}`}></div>
            <span className={showPower ? 'text-gray-700' : 'text-gray-400'}>Power</span>
          </button>
          <button
            onClick={() => setShowHeartRate(!showHeartRate)}
            className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
              showHeartRate ? 'bg-red-100' : 'bg-gray-100 opacity-50'
            }`}
          >
            <div className={`w-4 h-4 rounded-full ${showHeartRate ? 'bg-red-400' : 'bg-gray-400'}`}></div>
            <span className={showHeartRate ? 'text-gray-700' : 'text-gray-400'}>Heart Rate</span>
          </button>
          <button
            onClick={() => setShowSpeed(!showSpeed)}
            className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
              showSpeed ? 'bg-teal-100' : 'bg-gray-100 opacity-50'
            }`}
          >
            <div className={`w-4 h-4 rounded-full ${showSpeed ? 'bg-teal-500' : 'bg-gray-400'}`}></div>
            <span className={showSpeed ? 'text-gray-700' : 'text-gray-400'}>Speed</span>
          </button>
          <button
            onClick={() => setShowCadence(!showCadence)}
            className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
              showCadence ? 'bg-gray-200' : 'bg-gray-100 opacity-50'
            }`}
          >
            <div className={`w-4 h-4 rounded-full ${showCadence ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
            <span className={showCadence ? 'text-gray-700' : 'text-gray-400'}>Cadence</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Smoothness Control */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Smoothness:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="text-xs text-gray-500 w-16">
              {smoothing === 0 ? 'Raw' : `${Math.round(1 + smoothing * 19)}s avg`}
            </span>
          </div>
          
          {/* Reset Zoom Button */}
          {(zoomRange.min > 0 || zoomRange.max < 1) && (
            <button
              onClick={() => setZoomRange({ min: 0, max: 1 })}
              className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
            >
              Reset Zoom
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={containerRef}
        className="relative border border-gray-200 rounded-lg bg-white overflow-hidden"
        style={{ height: `${chartHeight}px`, cursor: isDragging ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={(e) => {
          handleMouseLeave();
          if (isDragging) {
            handleMouseUp(e);
          }
        }}
      >
        {/* Drag selection rectangle */}
        {isDragging && dragStart && dragEnd && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-200/20 pointer-events-none z-40"
            style={{
              left: `${padding.left + Math.min(dragStart.relativeX, dragEnd.relativeX)}px`,
              top: `${padding.top}px`,
              width: `${Math.abs(dragEnd.relativeX - dragStart.relativeX)}px`,
              height: `${graphHeight}px`
            }}
          />
        )}
        <svg
          ref={svgRef}
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="absolute inset-0"
          preserveAspectRatio="none"
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

          {/* Area fills */}
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
          {showPower && (
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
          {showPower && (
            <path
              d={powerPath}
              fill="none"
              stroke="#9333ea"
              strokeWidth="1.5"
            />
          )}
          {showCadence && (
            <path
              d={cadencePath}
              fill="none"
              stroke="#6b7280"
              strokeWidth="1.5"
              strokeDasharray="4,4"
            />
          )}

          {/* X-axis labels (distance) with zoom support */}
          {Array.from({ length: 11 }).map((_, i) => {
            if (!processedData) return null;
            const zoomedMinDistance = processedData.maxDistance * zoomRange.min;
            const zoomedMaxDistance = processedData.maxDistance * zoomRange.max;
            const zoomedRange = zoomedMaxDistance - zoomedMinDistance;
            const distance = zoomedMinDistance + (zoomedRange / 10) * i;
            const x = xScale(distance);
            if (x === null) return null;
            return (
              <g key={`x-label-${i}`}>
                <text
                  x={x}
                  y={svgHeight - padding.bottom + 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-600"
                >
                  {distance.toFixed(1)} km
                </text>
              </g>
            );
          })}

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
                  className="text-xs fill-gray-600"
                >
                  {percentage}%
                </text>
              </g>
            );
          })}
          
          {/* Secondary Y-axis labels on the right - show actual values for each visible metric */}
          {Array.from({ length: 6 }).map((_, i) => {
            const ratio = 1 - (i / 5);
            const y = padding.top + (graphHeight / 5) * i;
            const labels = [];
            
            if (showPower) {
              labels.push({ value: Math.round(processedData.maxPower * ratio), unit: 'W', color: '#9333ea' });
            }
            if (showHeartRate) {
              labels.push({ value: Math.round(processedData.maxHeartRate * ratio), unit: 'bpm', color: '#f87171' });
            }
            if (showSpeed) {
              labels.push({ value: Math.round(processedData.maxSpeed * ratio), unit: 'km/h', color: '#14b8a6' });
            }
            if (showCadence) {
              labels.push({ value: Math.round(processedData.maxCadence * ratio), unit: 'rpm', color: '#6b7280' });
            }
            
            return (
              <g key={`y-label-right-${i}`}>
                {labels.map((label, idx) => (
                  <text
                    key={`${i}-${idx}`}
                    x={padding.left + graphWidth + 10 + (idx * 60)}
                    y={y + 4}
                    textAnchor="start"
                    className="text-xs"
                    fill={label.color}
                  >
                    {label.value} {label.unit}
                  </text>
                ))}
              </g>
            );
          })}

          {/* Cursor line - only show when not dragging */}
          {cursorX !== null && !isDragging && (() => {
            // Convert container X position to SVG viewBox X position
            // SVG has viewBox="0 0 1200 400" and preserveAspectRatio="none"
            // So we need to scale the position
            const containerWidth = containerRef.current?.offsetWidth || svgWidth;
            const scaleX = svgWidth / containerWidth;
            const svgX = cursorX * scaleX;
            
            return (
              <line
                x1={svgX}
                y1={padding.top}
                x2={svgX}
                y2={padding.top + graphHeight}
                stroke="#000"
                strokeWidth="1.5"
              />
            );
          })()}
        </svg>

        {/* Tooltip - only show when not dragging */}
        {hoveredPoint && cursorX !== null && !isDragging && (() => {
          // Calculate tooltip position - align with cursor line
          const containerWidth = containerRef.current?.offsetWidth || svgWidth;
          const tooltipWidth = 200;
          const offset = 15;
          let tooltipLeft = cursorX + offset; // Offset from cursor line
          
          // Keep tooltip within container bounds
          if (tooltipLeft + tooltipWidth > containerWidth - 10) {
            tooltipLeft = cursorX - tooltipWidth - offset; // Show on left side of cursor
          }
          if (tooltipLeft < 10) {
            tooltipLeft = 10; // Minimum left margin
          }
          
          // Calculate actual point X position for better alignment
          const pointX = xScale(hoveredPoint.distance);
          const actualPointX = pointX !== null ? pointX : cursorX;
          
          // Use actual data point position for tooltip alignment
          // This ensures tooltip is aligned with the data point, not just the cursor
          tooltipLeft = actualPointX + offset;
          if (tooltipLeft + tooltipWidth > containerWidth - 10) {
            tooltipLeft = actualPointX - tooltipWidth - offset;
          }
          if (tooltipLeft < 10) {
            tooltipLeft = 10;
          }
          
          const hrZone = hrZones && hoveredPoint.heartRate > 0 
            ? getHeartRateZone(hoveredPoint.heartRate, hrZones) 
            : null;
          
          return (
            <div
              className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 pointer-events-none"
              style={{
                left: `${tooltipLeft}px`,
                top: '10px',
                minWidth: '180px'
              }}
            >
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-gray-900">
                  Distance: {hoveredPoint.distance.toFixed(1)} km
                </div>
                <div className="text-gray-600">
                  Time: {formatDuration(hoveredPoint.time)}
                </div>
                {hoveredPoint.power > 0 && (
                  <div className="text-purple-600 font-medium">
                    Power: {Math.round(hoveredPoint.power)} W
                  </div>
                )}
                {hoveredPoint.heartRate > 0 && (
                  <div className="text-red-500 font-medium">
                    Heart Rate: {Math.round(hoveredPoint.heartRate)} bpm
                    {hrZone && ` (Zone ${hrZone})`}
                  </div>
                )}
                {hoveredPoint.speed > 0 && (
                  <div className="text-teal-600 font-medium">
                    Speed: {hoveredPoint.speed.toFixed(1)} km/h
                  </div>
                )}
                {hoveredPoint.cadence > 0 && (
                  <div className="text-gray-600">
                    Cadence: {Math.round(hoveredPoint.cadence)} rpm
                  </div>
                )}
                {/* Zone indicators */}
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                  {powerZones && hoveredPoint.power > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-1">Power zone</div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const zone = getPowerZone(hoveredPoint.power, powerZones);
                          return (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded ${
                                zone === i + 1 ? 'bg-purple-600 border-2 border-purple-800' : 'bg-gray-200 border border-gray-300'
                              }`}
                              title={`Zone ${i + 1}: ${powerZones[`zone${i + 1}`]?.min || 0}-${powerZones[`zone${i + 1}`]?.max === Infinity ? '∞' : powerZones[`zone${i + 1}`]?.max || 0} W`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {hrZones && hoveredPoint.heartRate > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-1">Heart rate</div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const zone = getHeartRateZone(hoveredPoint.heartRate, hrZones);
                          return (
                            <div
                              key={`hr-zone-${i + 1}`}
                              className={`w-3 h-3 rounded ${
                                zone === i + 1
                                  ? 'bg-red-500 border-2 border-red-700'
                                  : 'bg-gray-200 border border-gray-300'
                              }`}
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

