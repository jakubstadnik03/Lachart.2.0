import React, { useState, useMemo, useEffect } from 'react';
import { formatDuration, formatDistance } from '../../utils/fitAnalysisUtils';

const IntervalChart = ({ laps = [], sport = 'cycling', records = [], user = null }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
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
    if (isRun || isSwim) return false;
    if (!laps || laps.length === 0) return false;
    return laps.some(lap => {
      const power = lap.average_watts || lap.avgPower || 0;
      return power > 0;
    });
  }, [laps, isRun, isSwim]);

  // For running and swimming, default to pace; for cycling with power data, default to power; otherwise heartRate
  const [selectedMetric, setSelectedMetric] = useState(
    isRun || isSwim ? 'pace' : (hasPowerData ? 'power' : 'heartRate')
  );
  
  // Debug log
  console.log('IntervalChart - sport:', sport, 'isRun:', isRun, 'isSwim:', isSwim, 'records length:', records?.length);

  // Create kilometer intervals for running if no laps or if laps don't have distance-based intervals
  const processedLaps = useMemo(() => {
    if (!isRun || !records || records.length === 0) return laps;
    
    // For running, always create km intervals if there are no laps, or if laps don't have km-based intervals
    // Check if laps already have distance-based intervals (km splits)
    const hasKmIntervals = laps.length > 0 && laps.some(lap => {
      const distance = lap.distance || 0;
      // Check if distance is close to a round km (within 50m)
      return distance > 0 && Math.abs(distance % 1000) < 50;
    });
    
    // If we have km intervals in laps, use them
    if (hasKmIntervals) return laps;
    
    // If we have laps but they're not km intervals, still create km intervals from records
    // (This ensures km intervals are always shown for running)
    
    // Create km intervals from records
    const kmLaps = [];
    let currentKmRecords = [];
    let kmNumber = 1;
    let lastKmDistance = 0;
    
    const startTime = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : Date.now();
    
    records.forEach((record, i) => {
      // Get distance in meters
      const distance = record.distance || 0;
      
      if (distance >= kmNumber * 1000 && distance > lastKmDistance) {
        // We've reached a new km
        if (currentKmRecords.length > 0) {
          // Calculate stats for this km
          const speeds = currentKmRecords.map(r => {
            // Convert speed to km/h if needed
            const s = r.speed || 0;
            return s > 0 ? (s > 10 ? s : s * 3.6) : 0; // If speed < 10, assume it's m/s
          }).filter(v => v > 0);
          const heartRates = currentKmRecords.map(r => r.heartRate).filter(v => v && v > 0);
          const cadences = currentKmRecords.map(r => r.cadence).filter(v => v && v > 0);
          
          const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
          const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;
          const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : 0;
          
          const firstRecord = currentKmRecords[0];
          const lastRecord = currentKmRecords[currentKmRecords.length - 1];
          const firstTime = firstRecord.timestamp ? new Date(firstRecord.timestamp).getTime() : startTime;
          const lastTime = lastRecord.timestamp ? new Date(lastRecord.timestamp).getTime() : startTime;
          const elapsedTime = (lastTime - firstTime) / 1000;
          
          kmLaps.push({
            distance: kmNumber * 1000, // meters
            elapsed_time: elapsedTime,
            moving_time: elapsedTime,
            average_speed: avgSpeed / 3.6, // Convert km/h to m/s for consistency
            avgSpeed: avgSpeed,
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
        const speeds = currentKmRecords.map(r => {
          const s = r.speed || 0;
          return s > 0 ? (s > 10 ? s : s * 3.6) : 0;
        }).filter(v => v > 0);
        const heartRates = currentKmRecords.map(r => r.heartRate).filter(v => v && v > 0);
        const cadences = currentKmRecords.map(r => r.cadence).filter(v => v && v > 0);
        
        const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
        const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;
        const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : 0;
        
        const firstRecord = currentKmRecords[0];
        const firstTime = firstRecord.timestamp ? new Date(firstRecord.timestamp).getTime() : startTime;
        const lastTime = lastRecord.timestamp ? new Date(lastRecord.timestamp).getTime() : startTime;
        const elapsedTime = (lastTime - firstTime) / 1000;
        
        kmLaps.push({
          distance: lastDistance,
          elapsed_time: elapsedTime,
          moving_time: elapsedTime,
          average_speed: avgSpeed / 3.6,
          avgSpeed: avgSpeed,
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

    const bars = filteredLaps.map((lap, originalIndex) => {
      // Find the original index in the full laps array
      const originalLapIndex = laps.findIndex(l => l === lap);
      const displayIndex = originalLapIndex + 1;
      
      let value = 0;
      let unit = '';

      switch (selectedMetric) {
        case 'power':
          value = lap.average_watts || lap.avgPower || 0;
          unit = 'W';
          break;
        case 'heartRate':
          value = lap.average_heartrate || lap.avgHeartRate || 0;
          unit = 'bpm';
          break;
        case 'speed':
          const speed = lap.average_speed || lap.avgSpeed || 0;
          value = speed * 3.6; // Convert m/s to km/h
          unit = 'km/h';
          break;
        case 'cadence':
          value = lap.average_cadence || lap.avgCadence || 0;
          unit = 'rpm';
          break;
        case 'pace':
          // Calculate pace from speed (m/s)
          const speedMps = lap.average_speed || (lap.avgSpeed ? lap.avgSpeed / 3.6 : 0) || 0;
          if (speedMps > 0) {
            if (isSwim) {
              value = Math.round(100 / speedMps); // seconds per 100m for swimming
              unit = 's/100m';
            } else {
              value = Math.round(1000 / speedMps); // seconds per km for running
              unit = 's/km';
            }
          } else {
            value = 0;
            unit = isSwim ? 's/100m' : 's/km';
          }
          break;
        default:
          value = 0;
      }

      // Get distance for width calculation (use distance instead of duration)
      const distance = lap.distance || 0; // distance in meters
      
      // Check if this is a pause (speed = 0 or very low, pace = 0)
      const speedMps = lap.average_speed || (lap.avgSpeed ? lap.avgSpeed / 3.6 : 0) || 0;
      const isPause = speedMps <= 0.1 || value === 0 || (selectedMetric === 'pace' && value === 0);
      
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
    const totalDistance = bars.reduce((sum, b) => sum + b.distance, 0); // Total distance instead of duration

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
  }, [processedLaps, selectedMetric, isRun, isSwim, laps]);

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'power': return 'Power';
      case 'heartRate': return 'Heart Rate';
      case 'speed': return 'Speed';
      case 'cadence': return 'Cadence';
      case 'pace': return 'Pace';
      default: return 'Power';
    }
  };

  const getMetricColor = () => {
    switch (selectedMetric) {
      case 'power': return '#9333ea'; // purple
      case 'heartRate': return '#f87171'; // red
      case 'speed': return '#14b8a6'; // teal
      case 'cadence': return '#6b7280'; // gray
      case 'pace': return '#f59e0b'; // amber
      default: return '#9333ea';
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
      const saturation = 0.3 + (normalizedValue * 0.7);
      const lightness = 0.5 + (normalizedValue * 0.3);
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
    
    // Adjust saturation: higher value = more saturated (darker), lower = less saturated (lighter)
    const saturation = 0.3 + (normalizedValue * 0.7); // Range from 0.3 to 1.0
    const lightness = 0.5 + (normalizedValue * 0.3); // Range from 0.5 to 0.8
    
    // Convert to HSL and adjust
    const hsl = rgbToHsl(r, g, b);
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
      }
    }
    return { h: h * 360, s, l };
  };

  const getYAxisLabels = () => {
    const { maxValue, minValue } = chartData;
    
    // For pace: set top value to be 10% smaller than the minimum pace (90% of minValue), bottom to be 10% larger (110% of maxValue)
    // For cadence: normal orientation (min at bottom, max at top) with 20% padding
    // For other metrics: set bottom value to be 20% less than the minimum value (80% of minValue)
    let adjustedMinValue, adjustedMaxValue;
    if ((isRun || isSwim) && selectedMetric === 'pace') {
      adjustedMinValue = minValue * 0.9; // Top: 10% smaller than fastest pace (smallest value)
      adjustedMaxValue = maxValue * 1.1; // Bottom: 10% larger than slowest pace
    } else if (selectedMetric === 'cadence') {
      // For cadence: normal orientation - min at bottom, max at top
      adjustedMinValue = minValue * 0.8; // Bottom: 20% smaller than minimum
      adjustedMaxValue = maxValue * 1.2; // Top: 20% larger than maximum
    } else {
      adjustedMinValue = minValue * 0.8; // Other metrics: 20% smaller
      adjustedMaxValue = maxValue;
    }
    
    const range = adjustedMaxValue - adjustedMinValue;
    const step = range / 5;
    const labels = [];
    
    for (let i = 0; i <= 5; i++) {
      labels.push(Math.round(adjustedMinValue + step * i));
    }
    
    // For pace: labels are [minValue * 0.9, ..., maxValue * 1.1] - fastest-10% at top, slowest+10% at bottom (reversed)
    // For cadence: labels are [minValue * 0.8, ..., maxValue * 1.2] - smallest at bottom, largest at top (normal)
    // For other metrics: labels are [minValue * 0.8, ..., maxValue] - smallest at top, largest at bottom (reversed)
    if ((isRun || isSwim) && selectedMetric === 'pace') {
      return { labels, adjustedMinValue, adjustedMaxValue, reversed: true };
    }
    
    if (selectedMetric === 'cadence') {
      // Normal orientation for cadence: min at bottom, max at top
      return { labels, adjustedMinValue, adjustedMaxValue, reversed: false };
    }
    
    return { labels, adjustedMinValue, adjustedMaxValue: maxValue, reversed: false };
  };

  // Calculate total time for X-axis labels (must be before early return)
  const totalTime = useMemo(() => {
    if (!processedLaps || processedLaps.length === 0) return 0;
    return processedLaps.reduce((sum, lap) => sum + (lap.elapsed_time || lap.moving_time || 0), 0);
  }, [processedLaps]);

  if (!processedLaps || processedLaps.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-gray-500 text-center">No interval data available</p>
      </div>
    );
  }

  const { bars, maxValue, minValue, totalDistance, groups } = chartData;
  const { labels: yAxisLabels, adjustedMinValue, adjustedMaxValue, reversed } = getYAxisLabels();

  return (
    <div className={`relative bg-white ${isMobile ? 'rounded-lg p-2' : 'rounded-2xl p-2 sm:p-4'} shadow-lg overflow-hidden`}>
      <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} gap-2 mb-2 sm:mb-4`}>
        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-gray-900`}>Activity Intervals</h3>
        <div className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'flex-wrap' : ''}`}>
          {(isRun || isSwim) && (
          <button
              onClick={() => setSelectedMetric('pace')}
            className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'pace'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
              Pace
          </button>
          )}
          {/* Only show power button if power data exists and it's not running or swimming */}
          {hasPowerData && !isRun && !isSwim && (
          <button
            onClick={() => setSelectedMetric('power')}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'power'
                ? 'bg-purple-600 text-white'
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
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Heart Rate
          </button>
          <button
            onClick={() => setSelectedMetric('speed')}
            className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} font-medium rounded-lg transition-colors ${
              selectedMetric === 'speed'
                ? 'bg-teal-500 text-white'
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

      <div className="relative w-full" style={{ height: isMobile ? '250px' : '400px' }}>
        {/* Y-axis labels - for pace: fastest (min) at top, slowest (max) at bottom; for cadence: min at bottom, max at top */}
        <div className={`absolute left-0 top-0 bottom-12 ${isMobile ? 'w-8' : 'w-12'} flex flex-col justify-between ${isMobile ? 'pr-1' : 'pr-2'} z-10`}>
          {yAxisLabels.map((label, i) => {
            // For cadence and other normal metrics: reverse the order (first label at bottom, last at top)
            // For pace (reversed): first label at top, last at bottom
            const displayIndex = (selectedMetric === 'cadence' || !reversed) 
              ? yAxisLabels.length - 1 - i  // Normal: reverse the array order (min at bottom, max at top)
              : i; // Reversed (pace): keep original order (min at top, max at bottom)
            const labelValue = yAxisLabels[displayIndex];
            
            // Format pace as MM:SS
            let displayLabel = labelValue;
            if (selectedMetric === 'pace' && labelValue > 0) {
              const minutes = Math.floor(labelValue / 60);
              const seconds = labelValue % 60;
              displayLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
            }
            
            return (
            <div
              key={i}
              className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-right`}
            >
                {displayLabel} {!isMobile && (chartData.bars[0]?.unit || '')}
            </div>
            );
          })}
        </div>

        {/* Chart area */}
        <div className={`${isMobile ? 'ml-10' : 'ml-14'} ${isMobile ? 'mr-2' : 'mr-4'} relative overflow-x-hidden overflow-y-hidden`} style={{ height: isMobile ? 'calc(100% - 36px)' : 'calc(100% - 48px)' }}>
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
          <div className="relative h-full flex items-end gap-0.5" style={{ minWidth: isMobile ? '100%' : 'auto' }}>
            {bars.map((bar, index) => {
              // For pace, reverse the height calculation (smaller pace = faster = higher bar)
              const height = adjustedMaxValue > adjustedMinValue 
                ? reversed
                  ? ((adjustedMaxValue - bar.value) / (adjustedMaxValue - adjustedMinValue)) * 100
                  : ((bar.value - adjustedMinValue) / (adjustedMaxValue - adjustedMinValue)) * 100
                : 0;
              const avgSpeed = bar.lap.average_speed ? (bar.lap.average_speed * 3.6).toFixed(1) : '-';
              
              // Calculate pace for running/swimming
              const paceSeconds = (isRun || isSwim) && bar.lap.average_speed && bar.lap.average_speed > 0 
                ? (isSwim ? Math.round(100 / bar.lap.average_speed) : Math.round(1000 / bar.lap.average_speed))
                : ((isRun || isSwim) && bar.lap.avgSpeed && bar.lap.avgSpeed > 0 
                  ? (isSwim ? Math.round(100 / (bar.lap.avgSpeed / 3.6)) : Math.round(1000 / (bar.lap.avgSpeed / 3.6)))
                  : 0);
              const paceMinutes = Math.floor(paceSeconds / 60);
              const paceSecs = paceSeconds % 60;
              const paceUnit = isSwim ? '/100m' : '/km';
              const paceFormatted = paceSeconds > 0 ? `${paceMinutes}:${String(paceSecs).padStart(2, '0')}${paceUnit}` : '-';
              
              // Calculate width based on distance
              const widthPercent = totalDistance > 0 
                ? (bar.distance / totalDistance) * 100 
                : (100 / bars.length);
              
              const barColor = getBarColor(bar, maxValue, minValue, groups);
              
              // For pauses, set minimum height (2px) and gray color
              const barHeight = bar.isPause ? 2 : height;
              
              // Tooltip title
              const tooltipTitle = (isRun || isSwim)
                ? `Lap ${bar.lapNumber}\nMoving Time: ${formatDuration(bar.lap.elapsed_time || bar.lap.moving_time || bar.lap.totalElapsedTime || 0)}\nPace: ${paceFormatted}\nAvg. Speed: ${avgSpeed} km/h\nAvg. HR: ${Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0)}`
                : `Lap ${bar.lapNumber}\nMoving Time: ${formatDuration(bar.lap.elapsed_time || bar.lap.moving_time || bar.lap.totalElapsedTime || 0)}\nAvg. Speed: ${avgSpeed} km/h\nAvg. Power: ${Math.round(bar.lap.average_watts || bar.lap.avgPower || 0)} W\nAvg. HR: ${Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0)}`;
              
              return (
                <div
                  key={index}
                  className="group relative cursor-pointer flex items-end"
                  style={{ 
                    width: `${widthPercent}%`,
                    height: '100%'
                  }}
                >
                  <div
                    className="w-full rounded-t transition-all hover:opacity-80"
                    style={{
                      height: `${barHeight}%`,
                      backgroundColor: barColor,
                      minHeight: bar.isPause ? '2px' : (bar.value > 0 ? '2px' : '0')
                    }}
                    title={tooltipTitle}
                  />
                  
                  {/* Tooltip on hover - positioned at the top of the bar */}
                  <div 
                    className="absolute left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[99999]"
                    style={{
                      bottom: `${barHeight}%`,
                      marginBottom: '4px'
                    }}
                  >
                    <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[180px]">
                      <div className="space-y-1 text-xs">
                        <div className="font-semibold text-gray-900">
                          {(isRun || isSwim) ? (isSwim ? `100m ${bar.lapNumber}` : `Km ${bar.lapNumber}`) : `Lap ${bar.lapNumber}`}
                        </div>
                        <div className="text-gray-600">
                          Distance: {bar.distance > 0 ? (bar.distance >= 1000 ? `${(bar.distance / 1000).toFixed(2)} km` : `${bar.distance.toFixed(0)} m`) : '-'}
                        </div>
                        <div className="text-gray-600">
                          Moving Time: {formatDuration(bar.lap.elapsed_time || bar.lap.moving_time || bar.lap.totalElapsedTime || 0)}
                        </div>
                        {(isRun || isSwim) ? (
                          <>
                            <div className="text-amber-600 font-medium">
                              Pace: {paceFormatted}
                            </div>
                            <div className="text-teal-600 font-medium">
                              Avg. Speed: {avgSpeed} km/h
                            </div>
                          </>
                        ) : (
                        <div className="text-teal-600 font-medium">
                          Avg. Speed: {avgSpeed} km/h
                        </div>
                        )}
                        {!isRun && !isSwim && (
                        <div className="text-purple-600 font-medium">
                          Avg. Power: {Math.round(bar.lap.average_watts || bar.lap.avgPower || 0)} W
                        </div>
                        )}
                        <div className="text-red-500 font-medium">
                          Avg. HR: {Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0)}
                        </div>
                        {bar.maxHeartRate > 0 && (
                        <div className="text-red-600 font-semibold">
                          Max. HR: {Math.round(bar.maxHeartRate)}
                        </div>
                        )}
                      </div>
                    </div>
                    {/* Arrow pointing down to the bar */}
                    <div
                      className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid white',
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* X-axis labels - show cumulative distance/time instead of individual intervals */}
        <div className={`${isMobile ? 'ml-10' : 'ml-14'} ${isMobile ? 'mr-2' : 'mr-4'} mt-2 flex items-center justify-between`}>
          {/* Show only start, middle, and end labels with cumulative values */}
          {bars.length > 0 && (
            <>
              {/* Start label */}
              <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-left`}>
                0{totalDistance >= 1000 ? 'km' : 'm'}
              </div>
              
              {/* Middle label (if enough bars) */}
              {bars.length > 2 && (
                <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-center`}>
                  {totalDistance >= 2000 
                    ? `${(totalDistance / 2000).toFixed(1)}km`
                    : totalDistance >= 1000
                    ? `${(totalDistance / 1000).toFixed(1)}km`
                    : `${Math.round(totalDistance / 2)}m`}
                </div>
              )}
              
              {/* End label with total distance and time */}
              <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-600 text-right`}>
                {totalDistance >= 1000 
                  ? `${(totalDistance / 1000).toFixed(1)}km`
                  : `${Math.round(totalDistance)}m`}
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
  );
};

export default IntervalChart;

