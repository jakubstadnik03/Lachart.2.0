import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  Legend
} from 'recharts';

const METRIC_CONFIGS = {
  power: { label: 'Power', unit: 'W', color: '#2563eb', axis: 'left' },
  heartRate: { label: 'Heart Rate', unit: 'bpm', color: '#ef4444', axis: 'right' },
  cadence: { label: 'Cadence', unit: 'rpm', color: '#10b981', axis: 'right' },
  speed: { label: 'Speed', unit: 'km/h', color: '#f97316', axis: 'right' },
  smo2: { label: 'SmO₂', unit: '%', color: '#0ea5e9', axis: 'right' },
  vo2: { label: 'VO₂', unit: 'ml/kg/min', color: '#9333ea', axis: 'right' },
  thb: { label: 'tHb', unit: 'g/dL', color: '#a855f7', axis: 'right' },
  ventilation: { label: 'Ventilation', unit: 'L/min', color: '#14b8a6', axis: 'right' }
};

// Bar chart data for intervals (only work intervals, not recovery)
const prepareIntervalBarData = (intervalSummaries) => {
  if (!intervalSummaries || intervalSummaries.length === 0) return [];
  
  // Filter only work intervals for bar chart
  return intervalSummaries
    .filter((interval) => interval.type === 'work')
    .map((interval) => ({
      interval: `Interval ${interval.displayStep}`,
      step: interval.displayStep,
      avgPower: interval.avgPower,
      avgHeartRate: interval.avgHeartRate,
      avgCadence: interval.avgCadence,
      avgSpeed: interval.avgSpeed,
      lactate: interval.lactate,
      borg: interval.borg,
      duration: interval.duration
    }));
};

const DEFAULT_VISIBLE_METRICS = {
  power: true,
  heartRate: true,
  cadence: true,
  speed: true,
  smo2: false,
  vo2: false,
  thb: false,
  ventilation: false
};

const formatMetricValue = (metricKey, value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const cfg = METRIC_CONFIGS[metricKey];
  if (!cfg) return value;

  if (metricKey === 'speed') {
    return `${Number(value).toFixed(1)} ${cfg.unit}`;
  }

  if (metricKey === 'vo2' || metricKey === 'ventilation') {
    return `${Number(value).toFixed(1)} ${cfg.unit}`;
  }

  return `${Math.round(value)} ${cfg.unit}`;
};

const SessionMetricsChart = ({ historical, lactateValues, laps }) => {
  const [chartLayout, setChartLayout] = useState('combined'); // combined | grid
  const [visibleMetrics, setVisibleMetrics] = useState(DEFAULT_VISIBLE_METRICS);

  const formatTimeLabel = useCallback((seconds) => {
    if (seconds === null || seconds === undefined) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (minutes < 60) {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
  }, []);

  const intervalSummaries = useMemo(() => {
    if (!historical?.length && !laps?.length) return [];

    const hasStepData = historical?.some(
      (point) => point.step !== null && point.step !== undefined
    );

    const average = (samples, key) => {
      const values = samples
        .map((sample) => sample[key])
        .filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
      if (!values.length) return null;
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    };

    if (hasStepData) {
      const groups = new Map();
      historical.forEach((point, index) => {
        const step = point.step ?? 0;
        const time = point.time ?? index;
        if (!groups.has(step)) {
          groups.set(step, {
            step,
            startTime: time,
            endTime: time,
            samples: []
          });
        }
        const group = groups.get(step);
        group.samples.push(point);
        group.startTime = Math.min(group.startTime, time);
        group.endTime = Math.max(group.endTime, time);
      });

      const workIntervals = Array.from(groups.values())
        .sort((a, b) => a.step - b.step)
        .map((group) => {
          const lactateEntry = lactateValues?.find(
            (lv) => (lv.step ?? group.step + 1) === group.step + 1
          );

          // Filter out recovery samples (power = 0 or very low) - only use work interval samples
          // Work interval samples should have power > 0 (or at least some meaningful power)
          const workSamples = group.samples.filter(sample => {
            // Consider it a work sample if power > 10W (to filter out recovery/rest periods)
            return sample.power !== null && sample.power !== undefined && sample.power > 10;
          });

          // Calculate work interval duration from work samples only
          const workStartTime = workSamples.length > 0 
            ? Math.min(...workSamples.map(s => s.time ?? 0))
            : group.startTime ?? 0;
          const workEndTime = workSamples.length > 0
            ? Math.max(...workSamples.map(s => s.time ?? 0))
            : group.endTime ?? group.startTime ?? 0;

          return {
            step: group.step,
            displayStep: group.step + 1,
            startTime: workStartTime,
            endTime: workEndTime,
            duration: Math.max(workEndTime - workStartTime, 0),
            avgPower: average(workSamples, 'power'),
            avgHeartRate: average(workSamples, 'heartRate'),
            avgCadence: average(workSamples, 'cadence'),
            avgSpeed: average(workSamples, 'speed'),
            avgSmO2: average(workSamples, 'smo2'),
            avgVo2: average(workSamples, 'vo2'),
            avgThb: average(workSamples, 'thb'),
            avgVentilation: average(workSamples, 'ventilation'),
            lactate: lactateEntry?.lactate ?? null,
            borg: lactateEntry?.borg ?? null,
            type: 'work'
          };
        });

      // Add recovery intervals between work intervals
      const allIntervals = [];
      workIntervals.forEach((workInterval, index) => {
        // Add work interval
        allIntervals.push(workInterval);
        
        // Add recovery interval after work interval (except after last one)
        if (index < workIntervals.length - 1) {
          const nextWorkStart = workIntervals[index + 1].startTime;
          const recoveryStart = workInterval.endTime;
          const recoveryEnd = nextWorkStart;
          
          if (recoveryEnd > recoveryStart) {
            // Find recovery data points (between work intervals)
            const recoverySamples = historical.filter(
              (point) => {
                const time = point.time ?? 0;
                return time > recoveryStart && time < recoveryEnd && 
                       (point.step === null || point.step === undefined || point.step === workInterval.step);
              }
            );
            
            allIntervals.push({
              step: workInterval.step,
              displayStep: `Recovery ${workInterval.displayStep}`,
              startTime: recoveryStart,
              endTime: recoveryEnd,
              duration: recoveryEnd - recoveryStart,
              avgPower: average(recoverySamples, 'power'),
              avgHeartRate: average(recoverySamples, 'heartRate'),
              avgCadence: average(recoverySamples, 'cadence'),
              avgSpeed: average(recoverySamples, 'speed'),
              avgSmO2: average(recoverySamples, 'smo2'),
              avgVo2: average(recoverySamples, 'vo2'),
              avgThb: average(recoverySamples, 'thb'),
              avgVentilation: average(recoverySamples, 'ventilation'),
              lactate: null,
              borg: null,
              type: 'recovery'
            });
          }
        }
      });

      return allIntervals;
    }

    if (laps?.length) {
      let cursor = 0;
      return laps.map((lap, idx) => {
        const duration = Number(lap.totalElapsedTime) || 0;
        const startTime = cursor;
        const endTime = cursor + duration;
        cursor = endTime;

        const displayStep = lap.lapNumber ?? idx + 1;
        const lactateEntry = lactateValues?.find(
          (lv) => (lv.step ?? displayStep) === displayStep
        );

        return {
          step: displayStep - 1,
          displayStep,
          startTime,
          endTime,
          duration,
          avgPower: lap.avgPower ?? null,
          avgHeartRate: lap.avgHeartRate ?? null,
          avgCadence: lap.avgCadence ?? null,
          avgSpeed: lap.avgSpeed ?? lap.averageSpeed ?? null,
          avgSmO2: lap.avgSmO2 ?? null,
          avgVo2: lap.avgVo2 ?? null,
          avgThb: lap.avgThb ?? null,
          avgVentilation: lap.avgVentilation ?? null,
          lactate: lactateEntry?.lactate ?? lap.lactate ?? null,
          borg: lactateEntry?.borg ?? null
        };
      });
    }

    return [];
  }, [historical, lactateValues, laps]);

  const findIntervalForTime = useCallback(
    (time) => {
      if (!intervalSummaries.length) return null;
      return intervalSummaries.find(
        (interval) => time >= interval.startTime && time <= interval.endTime
      );
    },
    [intervalSummaries]
  );

  const chartData = useMemo(() => {
    if (!historical?.length) return [];

    return historical.map((point, index) => {
      const time = point.time ?? index;
      const interval = findIntervalForTime(time);

      return {
        time,
        power: point.power ?? null,
        heartRate: point.heartRate ?? null,
        cadence: point.cadence ?? null,
        speed: point.speed ?? null,
        smo2: point.smo2 ?? null,
        vo2: point.vo2 ?? null,
        thb: point.thb ?? null,
        ventilation: point.ventilation ?? null,
        intervalLabel: interval ? `Interval ${interval.displayStep}` : null,
        intervalSummary: interval
      };
    });
  }, [historical, findIntervalForTime]);

  const metricAvailability = useMemo(() => {
    const availability = {};
    Object.keys(METRIC_CONFIGS).forEach((key) => {
      availability[key] = chartData.some(
        (point) => point[key] !== null && point[key] !== undefined
      );
    });
    return availability;
  }, [chartData]);

  const selectedMetricKeys = useMemo(
    () =>
      Object.keys(visibleMetrics).filter(
        (key) => visibleMetrics[key] && metricAvailability[key]
      ),
    [visibleMetrics, metricAvailability]
  );

  useEffect(() => {
    if (selectedMetricKeys.length === 0) {
      const fallbackKey = Object.keys(METRIC_CONFIGS).find(
        (key) => metricAvailability[key]
      );
      if (fallbackKey) {
        setVisibleMetrics((prev) => ({ ...prev, [fallbackKey]: true }));
      }
    }
  }, [selectedMetricKeys.length, metricAvailability]);

  const handleMetricToggle = (key) => {
    setVisibleMetrics((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const maxTime = chartData.length
    ? Math.max(...chartData.map((point) => point.time ?? 0))
    : 0;

  const getTickPositions = () => {
    if (maxTime === 0) return [];
    return [0, maxTime * 0.25, maxTime * 0.5, maxTime * 0.75, maxTime];
  };

  const renderTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload || !payload.length) return null;
      const dataPoint = payload[0]?.payload;
      const interval = dataPoint?.intervalSummary;

      return (
        <div className="bg-white/95 p-3 border border-gray-200 rounded-xl shadow-lg text-sm min-w-[220px]">
          <div className="font-semibold text-gray-800 mb-1">
            Time {formatTimeLabel(label)}
          </div>
          <div className="space-y-1 mb-2">
            {selectedMetricKeys.map((metricKey) => {
              const cfg = METRIC_CONFIGS[metricKey];
              const value = dataPoint?.[metricKey];
              if (value === null || value === undefined) return null;
              return (
                <div
                  key={metricKey}
                  className="flex items-center justify-between text-gray-700"
                >
                  <span className="text-xs text-gray-500">{cfg.label}</span>
                  <span className="font-semibold">{formatMetricValue(metricKey, value)}</span>
                </div>
              );
            })}
          </div>
          {interval && interval.type === 'work' && (
            <div className="pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-1">
              <div className="font-semibold text-gray-800 mb-1">
                Interval #{interval.displayStep}
              </div>
              <div className="flex justify-between">
                <span>Duration</span>
                <span>{formatTimeLabel(interval.duration)}</span>
              </div>
              {interval.avgPower !== null && (
                <div className="flex justify-between">
                  <span>Avg Power</span>
                  <span>{formatMetricValue('power', interval.avgPower)}</span>
                </div>
              )}
              {interval.avgHeartRate !== null && (
                <div className="flex justify-between">
                  <span>Avg HR</span>
                  <span>{formatMetricValue('heartRate', interval.avgHeartRate)}</span>
                </div>
              )}
              {interval.avgCadence !== null && (
                <div className="flex justify-between">
                  <span>Avg Cadence</span>
                  <span>{formatMetricValue('cadence', interval.avgCadence)}</span>
                </div>
              )}
              {interval.avgSpeed !== null && (
                <div className="flex justify-between">
                  <span>Avg Speed</span>
                  <span>{formatMetricValue('speed', interval.avgSpeed)}</span>
                </div>
              )}
              {interval.lactate !== null && (
                <div className="flex justify-between">
                  <span>Lactate</span>
                  <span>{Number(interval.lactate).toFixed(2)} mmol/L</span>
                </div>
              )}
              {interval.borg !== null && (
                <div className="flex justify-between">
                  <span>Borg</span>
                  <span>{interval.borg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [formatTimeLabel, selectedMetricKeys]
  );

  const intervalBarData = useMemo(() => prepareIntervalBarData(intervalSummaries), [intervalSummaries]);

  const renderIntervalTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
      <div className="bg-white/95 p-3 border border-gray-200 rounded-xl shadow-lg text-sm min-w-[200px]">
        <div className="font-semibold text-gray-800 mb-2">{data.interval}</div>
        <div className="space-y-1">
          {data.avgPower !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Avg Power</span>
              <span className="font-semibold">{formatMetricValue('power', data.avgPower)}</span>
            </div>
          )}
          {data.avgHeartRate !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Avg HR</span>
              <span className="font-semibold">{formatMetricValue('heartRate', data.avgHeartRate)}</span>
            </div>
          )}
          {data.avgCadence !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Avg Cadence</span>
              <span className="font-semibold">{formatMetricValue('cadence', data.avgCadence)}</span>
            </div>
          )}
          {data.avgSpeed !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Avg Speed</span>
              <span className="font-semibold">{formatMetricValue('speed', data.avgSpeed)}</span>
            </div>
          )}
          {data.lactate !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Lactate</span>
              <span className="font-semibold">{Number(data.lactate).toFixed(2)} mmol/L</span>
            </div>
          )}
          {data.borg !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">BORG</span>
              <span className="font-semibold">{data.borg}</span>
            </div>
          )}
          {data.duration !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Duration</span>
              <span className="font-semibold">{formatTimeLabel(data.duration)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!chartData.length) {
    return null;
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Session Metrics</h3>
      
      {/* Interval Bars Chart */}
      {intervalBarData.length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-600 mb-2">Interval Summary (Work Intervals Only)</h4>
          <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={intervalBarData} margin={{ top: 10, right: 30, bottom: 60, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="interval" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  stroke="#666"
                  tick={{ fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="left"
                  stroke="#666"
                  label={{ value: 'Power (W)', angle: -90, position: 'insideLeft' }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="#666"
                  label={{ value: 'HR / Cadence / Speed', angle: 90, position: 'insideRight' }}
                />
                <Tooltip content={renderIntervalTooltip} />
                <Legend />
                <Bar 
                  yAxisId="left"
                  dataKey="avgPower" 
                  fill={METRIC_CONFIGS.power.color}
                  name="Avg Power (W)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  yAxisId="right"
                  dataKey="avgHeartRate" 
                  fill={METRIC_CONFIGS.heartRate.color}
                  name="Avg HR (bpm)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  yAxisId="right"
                  dataKey="avgCadence" 
                  fill={METRIC_CONFIGS.cadence.color}
                  name="Avg Cadence (rpm)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  yAxisId="right"
                  dataKey="avgSpeed" 
                  fill={METRIC_CONFIGS.speed.color}
                  name="Avg Speed (km/h)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
        <div className="flex gap-1 bg-white/70 border border-gray-200 rounded-xl p-1">
          {['combined', 'grid'].map((layout) => (
            <button
              key={layout}
              onClick={() => setChartLayout(layout)}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                chartLayout === layout
                  ? 'bg-primary text-white shadow'
                  : 'text-gray-600 hover:bg-white'
              }`}
            >
              {layout === 'combined' ? 'Combined' : 'Grid'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(METRIC_CONFIGS).map(([key, cfg]) => {
            const available = metricAvailability[key];
            const selected = visibleMetrics[key] && available;
            return (
              <button
                key={key}
                disabled={!available}
                onClick={() => handleMetricToggle(key)}
                className={`px-3 py-1 rounded-full border text-xs font-medium transition ${
                  !available
                    ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                    : selected
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-gray-200 text-gray-600 hover:bg-white'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-4">
        {chartLayout === 'combined' ? (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 80, bottom: 30, left: 60 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
              <XAxis
                dataKey="time"
                stroke="#666"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={getTickPositions()}
                tickFormatter={formatTimeLabel}
              />
              <YAxis
                yAxisId="left"
                stroke="#666"
                label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', offset: 10 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#666"
                label={{
                  value: 'HR / Cadence / Speed / Sensors',
                  angle: 90,
                  position: 'insideRight',
                  offset: 10
                }}
              />
              <YAxis yAxisId="shade" type="number" domain={[0, 1]} hide />
              {intervalSummaries.map((interval, index) => (
                <ReferenceArea
                  key={`interval-${interval.displayStep}-${index}`}
                  yAxisId="shade"
                  x1={interval.startTime}
                  x2={interval.endTime}
                  y1={0}
                  y2={1}
                  fill={interval.type === 'recovery' ? '#d1d5db' : (index % 2 === 0 ? '#bfdbfe' : '#fde68a')}
                  fillOpacity={interval.type === 'recovery' ? 0.12 : 0.18}
                  stroke={interval.type === 'recovery' ? '#9ca3af' : 'transparent'}
                  strokeWidth={interval.type === 'recovery' ? 1 : 0}
                  strokeDasharray={interval.type === 'recovery' ? '4 4' : '0'}
                  strokeOpacity={interval.type === 'recovery' ? 0.3 : 0}
                />
              ))}
              <Tooltip content={renderTooltip} />
              {selectedMetricKeys.map((metricKey) => {
                const cfg = METRIC_CONFIGS[metricKey];
                return (
                  <Line
                    key={metricKey}
                    type="monotone"
                    dataKey={metricKey}
                    stroke={cfg.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    yAxisId={cfg.axis === 'left' ? 'left' : 'right'}
                    name={`${cfg.label} ${cfg.unit ? `(${cfg.unit})` : ''}`}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {selectedMetricKeys.map((metricKey) => {
              const cfg = METRIC_CONFIGS[metricKey];
              return (
                <div
                  key={`session-metric-${metricKey}`}
                  className="bg-white/80 border border-white/50 rounded-2xl p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800">{cfg.label}</span>
                    <span className="text-xs text-gray-500">{cfg.unit}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="time"
                        stroke="#999"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        ticks={getTickPositions()}
                        tickFormatter={formatTimeLabel}
                      />
                      <YAxis stroke="#999" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255,255,255,0.95)',
                          border: '1px solid #eee'
                        }}
                        formatter={(value) =>
                          value === null || value === undefined ? '—' : formatMetricValue(metricKey, value)
                        }
                        labelFormatter={(label) => `Time: ${formatTimeLabel(label)}`}
                      />
                      <Line
                        type="monotone"
                        dataKey={metricKey}
                        stroke={cfg.color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionMetricsChart;

