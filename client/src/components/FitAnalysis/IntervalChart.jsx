import React, { useState, useMemo } from 'react';
import { formatDuration, formatDistance } from '../../utils/fitAnalysisUtils';

const IntervalChart = ({ laps = [], sport = 'cycling' }) => {
  const [selectedMetric, setSelectedMetric] = useState('power');

  // Prepare data for the chart
  const chartData = useMemo(() => {
    if (!laps || laps.length === 0) return { bars: [], maxValue: 0, minValue: 0, totalDuration: 0 };

    // Filter out laps with no power or very low power (< 30W) - these are likely when not pedaling
    // Higher threshold helps filter out intervals that include stopped time (0W periods)
    const filteredLaps = laps.filter((lap) => {
      const power = lap.average_watts || lap.avgPower || 0;
      // Always filter out laps with power < 30W, regardless of selected metric
      // This removes intervals when the bike is off, not being pedaled, or includes significant stopped time
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
        default:
          value = 0;
      }

      // Get duration for width calculation
      // Prefer moving_time over elapsed_time to exclude stopped time
      const elapsedTime = lap.elapsed_time || lap.totalElapsedTime || lap.totalTimerTime || 0;
      const movingTime = lap.moving_time || 0;
      
      // Use moving_time if available (excludes stopped time), otherwise use elapsed_time
      // But if moving_time is 0 or very small compared to elapsed_time, estimate effective duration
      let duration = movingTime > 0 ? movingTime : elapsedTime;
      
      // If we have power data, estimate effective duration based on average power
      // If average power is very low relative to what would be expected, the interval likely has a lot of zero-power time
      const power = lap.average_watts || lap.avgPower || 0;
      if (power > 0 && elapsedTime > 0 && movingTime === 0) {
        // Estimate: if average power is very low (< 50W), assume significant portion was at 0W
        // Rough estimate: effective duration = elapsed_time * (avg_power / expected_min_power)
        // For cycling, minimum sustainable power is around 50-100W
        const expectedMinPower = 50; // Minimum power for active pedaling
        if (power < expectedMinPower) {
          // Scale down duration based on how low the power is
          const powerRatio = power / expectedMinPower;
          duration = elapsedTime * Math.max(0.1, powerRatio); // At least 10% of elapsed time
        }
      }

      return {
        lapNumber: displayIndex,
        value: value,
        unit: unit,
        duration: duration,
        lap: lap
      };
    });

    const values = bars.map(b => b.value).filter(v => v > 0);
    const maxValue = values.length > 0 ? Math.max(...values) : 100;
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const totalDuration = bars.reduce((sum, b) => sum + b.duration, 0);

    // Group intervals by similar values (within 5% tolerance)
    const tolerance = (maxValue - minValue) * 0.05 || 1;
    const groups = [];
    bars.forEach((bar, index) => {
      if (bar.value <= 0) {
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

    return { bars, maxValue, minValue, totalDuration, groups };
  }, [laps, selectedMetric]);

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'power': return 'Power';
      case 'heartRate': return 'Heart Rate';
      case 'speed': return 'Speed';
      case 'cadence': return 'Cadence';
      default: return 'Power';
    }
  };

  const getMetricColor = () => {
    switch (selectedMetric) {
      case 'power': return '#9333ea'; // purple
      case 'heartRate': return '#f87171'; // red
      case 'speed': return '#14b8a6'; // teal
      case 'cadence': return '#6b7280'; // gray
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
    const range = maxValue - minValue;
    const step = range / 5;
    const labels = [];
    
    for (let i = 0; i <= 5; i++) {
      labels.push(Math.round(minValue + step * i));
    }
    
    return labels;
  };

  if (!laps || laps.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-gray-500 text-center">No interval data available</p>
      </div>
    );
  }

  const { bars, maxValue, minValue, totalDuration, groups } = chartData;
  const yAxisLabels = getYAxisLabels();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Activity Intervals</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedMetric('power')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedMetric === 'power'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Power
          </button>
          <button
            onClick={() => setSelectedMetric('heartRate')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedMetric === 'heartRate'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Heart Rate
          </button>
          <button
            onClick={() => setSelectedMetric('speed')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedMetric === 'speed'
                ? 'bg-teal-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Speed
          </button>
          <button
            onClick={() => setSelectedMetric('cadence')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedMetric === 'cadence'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cadence
          </button>
        </div>
      </div>

      <div className="relative" style={{ height: '400px' }}>
        {/* Y-axis labels - reversed order (max at top, min at bottom) */}
        <div className="absolute left-0 top-0 bottom-12 w-12 flex flex-col justify-between pr-2">
          {yAxisLabels.slice().reverse().map((label, i) => (
            <div
              key={i}
              className="text-xs text-gray-600 text-right"
            >
              {label} {chartData.bars[0]?.unit || ''}
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div className="ml-14 mr-4 relative" style={{ height: 'calc(100% - 48px)' }}>
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
          <div className="relative h-full flex items-end gap-0.5">
            {bars.map((bar, index) => {
              const height = maxValue > minValue 
                ? ((bar.value - minValue) / (maxValue - minValue)) * 100 
                : 0;
              const avgSpeed = bar.lap.average_speed ? (bar.lap.average_speed * 3.6).toFixed(1) : '-';
              
              // Calculate width based on duration
              const widthPercent = totalDuration > 0 
                ? (bar.duration / totalDuration) * 100 
                : (100 / bars.length);
              
              const barColor = getBarColor(bar, maxValue, minValue, groups);
              
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
                      height: `${height}%`,
                      backgroundColor: barColor,
                      minHeight: bar.value > 0 ? '2px' : '0'
                    }}
                    title={`Lap ${bar.lapNumber}\nMoving Time: ${formatDuration(bar.lap.elapsed_time || bar.lap.moving_time || bar.lap.totalElapsedTime || 0)}\nAvg. Speed: ${avgSpeed} km/h\nAvg. Power: ${Math.round(bar.lap.average_watts || bar.lap.avgPower || 0)} W\nAvg. HR: ${Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0)}`}
                  />
                  
                  {/* Tooltip on hover - positioned at the top of the bar */}
                  <div 
                    className="absolute left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                    style={{
                      bottom: `${height}%`,
                      marginBottom: '4px'
                    }}
                  >
                    <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[180px]">
                      <div className="space-y-1 text-xs">
                        <div className="font-semibold text-gray-900">
                          Lap {bar.lapNumber}
                        </div>
                        <div className="text-gray-600">
                          Moving Time: {formatDuration(bar.lap.elapsed_time || bar.lap.moving_time || bar.lap.totalElapsedTime || 0)}
                        </div>
                        <div className="text-teal-600 font-medium">
                          Avg. Speed: {avgSpeed} km/h
                        </div>
                        <div className="text-purple-600 font-medium">
                          Avg. Power: {Math.round(bar.lap.average_watts || bar.lap.avgPower || 0)} W
                        </div>
                        <div className="text-red-500 font-medium">
                          Avg. HR: {Math.round(bar.lap.average_heartrate || bar.lap.avgHeartRate || 0)}
                        </div>
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

        {/* X-axis labels */}
        <div className="ml-14 mr-4 mt-2 flex">
          {bars.map((bar, index) => {
            // Show every Nth label to avoid crowding
            const showLabel = bars.length <= 30 || index % Math.ceil(bars.length / 20) === 0 || index === bars.length - 1;
            const widthPercent = totalDuration > 0 
              ? (bar.duration / totalDuration) * 100 
              : (100 / bars.length);
            return (
              <div
                key={index}
                className="text-xs text-gray-600 text-center"
                style={{ 
                  width: `${widthPercent}%`,
                  opacity: showLabel ? 1 : 0 
                }}
              >
                {showLabel ? bar.lapNumber : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default IntervalChart;

