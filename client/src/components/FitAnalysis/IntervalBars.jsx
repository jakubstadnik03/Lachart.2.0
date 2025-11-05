import React from 'react';
import { prepareIntervalBarsData } from '../../utils/fitAnalysisUtils';

const IntervalBars = ({ training, chartData, zoomedMinTime, zoomedMaxTime, zoomedXScale, padding, graphHeight, effectiveMaxPower }) => {
  if (!training?.laps || training.laps.length === 0) return null;

  // Get training start time from first record
  const trainingStartTime = chartData.records[0]?.timestamp 
    ? new Date(chartData.records[0].timestamp).getTime() 
    : Date.now();

  // Prepare interval bars data
  const allIntervalBars = prepareIntervalBarsData(training.laps, chartData, trainingStartTime);

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

