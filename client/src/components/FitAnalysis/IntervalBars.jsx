import React from 'react';
import { prepareIntervalBarsData } from '../../utils/fitAnalysisUtils';

// Deduplicate FIT training laps
const deduplicateFitTrainingLaps = (laps = []) => {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const seen = new Map();
  const unique = [];

  const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return null;
      // Round to nearest second to handle small differences
      return Math.floor(date.getTime() / 1000);
    } catch {
      return null;
    }
  };

  laps.forEach((lap, index) => {
    // Strategy 1: Use _id if available (MongoDB ObjectId)
    if (lap._id) {
      const idStr = lap._id.toString();
      if (seen.has(`id_${idStr}`)) {
        console.log(`IntervalBars: Skipping duplicate lap by _id at index ${index}`);
        return;
      }
      seen.set(`id_${idStr}`, true);
      unique.push(lap);
      return;
    }
    
    // Strategy 2: Use startTime or start_date as primary identifier
    const startTime = lap.startTime || lap.start_time || lap.start_date;
    if (startTime) {
      const normalizedTime = normalizeTime(startTime);
      if (normalizedTime !== null) {
        const key = `time_${normalizedTime}`;
        if (seen.has(key)) {
          console.log(`IntervalBars: Skipping duplicate lap by startTime at index ${index}`);
          return;
        }
        seen.set(key, true);
        unique.push(lap);
        return;
      }
    }
    
    // Strategy 3: Use combination of properties
    const elapsedTime = Math.round(lap.totalElapsedTime || lap.total_elapsed_time || lap.elapsed_time || 0);
    const distance = Math.round((lap.totalDistance || lap.total_distance || lap.distance || 0) * 10) / 10;
    const power = Math.round((lap.avgPower || lap.avg_power || lap.average_watts || 0) * 10) / 10;
    const hr = Math.round((lap.avgHeartRate || lap.avg_heart_rate || lap.average_heartrate || 0) * 10) / 10;
    
    const key = `t${elapsedTime}_d${distance}_p${power}_hr${hr}`;
    
    if (seen.has(key)) {
      console.log(`IntervalBars: Skipping duplicate lap at index ${index}, key: ${key}`);
      return;
    }
    seen.set(key, index);
    unique.push(lap);
  });

  if (unique.length !== laps.length) {
    console.log(`IntervalBars: Removed ${laps.length - unique.length} duplicate laps. Original: ${laps.length}, Unique: ${unique.length}`);
  }

  return unique;
};

const IntervalBars = ({ training, chartData, zoomedMinTime, zoomedMaxTime, zoomedXScale, padding, graphHeight, effectiveMaxPower }) => {
  if (!training?.laps || training.laps.length === 0) return null;

  // Deduplicate laps before processing
  const uniqueLaps = React.useMemo(() => {
    return deduplicateFitTrainingLaps(training.laps);
  }, [training.laps]);

  if (uniqueLaps.length === 0) return null;

  // Get training start time from first record
  const trainingStartTime = chartData.records[0]?.timestamp 
    ? new Date(chartData.records[0].timestamp).getTime() 
    : Date.now();

  // Prepare interval bars data
  const allIntervalBars = prepareIntervalBarsData(uniqueLaps, chartData, trainingStartTime);

  if (allIntervalBars.length === 0) return null;

  // Get max power from intervals if chartData.maxPower is 0 or undefined
  const maxIntervalPower = allIntervalBars.length > 0 
    ? Math.max(...allIntervalBars.map(b => b.power))
    : chartData.maxPower || 100;
  const effectivePower = effectiveMaxPower || (chartData.maxPower > 0 ? chartData.maxPower : maxIntervalPower);

  return (
    <>
      {allIntervalBars.map((bar) => {
        // Check if interval is within zoom range
        if (bar.endTime < zoomedMinTime || bar.startTime > zoomedMaxTime) return null;

        // Calculate X positions (start and end of bar)
        const xStart = zoomedXScale(Math.max(bar.startTime, zoomedMinTime));
        const xEnd = zoomedXScale(Math.min(bar.endTime, zoomedMaxTime));

        if (xStart === null || xEnd === null) return null;

        const barX = xStart;
        const barWidth = Math.max(2, xEnd - xStart);

        // Calculate Y position (height based on power)
        const barTop = effectivePower > 0 
          ? padding.top + graphHeight - ((bar.power / effectivePower) * graphHeight)
          : padding.top + graphHeight;
        const barBottom = padding.top + graphHeight;
        const barHeight = Math.max(2, barBottom - barTop);

        // Color based on power intensity
        const powerRatio = effectivePower > 0 ? bar.power / effectivePower : 0;
        const baseR = 200;
        const baseG = 180;
        const baseB = 255;
        const r = Math.round(baseR - (powerRatio * 60));
        const g = Math.round(baseG - (powerRatio * 100));
        const b = Math.round(baseB - (powerRatio * 50));

        return (
          <rect
            key={`interval-bar-${bar.index}`}
            x={barX}
            y={barTop}
            width={barWidth}
            height={barHeight}
            fill={`rgba(${r}, ${g}, ${b}, 0.35)`}
            stroke={`rgba(${r}, ${g}, ${b}, 0.6)`}
            strokeWidth="1"
            rx="2"
            ry="2"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
    </>
  );
};

export default IntervalBars;

