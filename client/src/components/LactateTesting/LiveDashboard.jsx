import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  BoltIcon,
  HeartIcon,
  WifiIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const METRIC_CONFIGS = {
  power: { label: 'Power', unit: 'W', color: '#3b82f6', dataKey: 'power', axis: 'left' },
  speed: { label: 'Speed', unit: 'km/h', color: '#f97316', dataKey: 'speed', axis: 'left' },
  heartRate: { label: 'Heart Rate', unit: 'bpm', color: '#ef4444', dataKey: 'heartRate', axis: 'left' },
  cadence: { label: 'Cadence', unit: 'rpm', color: '#10b981', dataKey: 'cadence', axis: 'left' },
  smo2: { label: 'SmO₂', unit: '%', color: '#facc15', dataKey: 'smo2', axis: 'right' },
  thb: { label: 'THb', unit: 'μM', color: '#fb923c', dataKey: 'thb', axis: 'right' },
  vo2: { label: 'VO₂', unit: '', color: '#a855f7', dataKey: 'vo2', axis: 'right' }
};

const DEFAULT_VISIBLE_METRICS = {
  power: true,
  speed: false,
  heartRate: true,
  cadence: true,
  smo2: false,
  thb: false,
  vo2: false
};

const LiveDashboard = ({ liveData, devices, testState, historicalData, intervalTimer, protocol, currentStep }) => {
  const isActive = testState === 'running';
  const chartKeyRef = useRef(0);
  const [chartLayout, setChartLayout] = useState('single'); // single | grid
  const [visibleMetrics, setVisibleMetrics] = useState(DEFAULT_VISIBLE_METRICS);

  // Check which devices are connected
  const isDeviceConnected = (deviceType) => {
    return devices[deviceType]?.connected === true;
  };

  const hasValidData = (value) => {
    return value !== null && value !== undefined && value > 0;
  };

  // Prepare chart data - optimized to reduce re-renders
  const chartData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      return [];
    }

    const converted = historicalData.map((dataPoint) => {
      const timeValue = dataPoint.totalTime !== undefined && dataPoint.totalTime !== null 
        ? dataPoint.totalTime 
        : 0;
      
      return {
        time: timeValue,
        power: dataPoint.power !== null && dataPoint.power !== undefined ? dataPoint.power : null,
        speed: dataPoint.speed !== null && dataPoint.speed !== undefined ? dataPoint.speed : null,
        heartRate: dataPoint.heartRate !== null && dataPoint.heartRate !== undefined ? dataPoint.heartRate : null,
        cadence: dataPoint.cadence !== null && dataPoint.cadence !== undefined ? dataPoint.cadence : null,
        smo2: dataPoint.smo2 !== null && dataPoint.smo2 !== undefined ? dataPoint.smo2 : null,
        thb: dataPoint.thb !== null && dataPoint.thb !== undefined ? dataPoint.thb : null,
        vo2: dataPoint.vo2 !== null && dataPoint.vo2 !== undefined ? dataPoint.vo2 : null
      };
    });
    
    // Update key only when data length changes significantly (every 10 points) to reduce re-renders
    if (converted.length > 0 && converted.length % 10 === 0) {
      chartKeyRef.current = converted.length;
    }
    
    return converted;
  }, [historicalData]);

  // Calculate max time and format for X axis
  const maxTime = chartData.length > 0 ? Math.max(...chartData.map(d => d.time)) : 0;
  const useMinutes = maxTime >= 60; // Use minutes format if test is >= 1 minute
  
  // Calculate tick positions: 0, 1/4, 1/2, 3/4, end (5 ticks total)
  const getTickPositions = () => {
    if (maxTime === 0) return [];
    const ticks = [
      0,
      maxTime * 0.25,
      maxTime * 0.5,
      maxTime * 0.75,
      maxTime
    ];
    return ticks;
  };

  // Determine which metrics to show
  const hasBikeTrainer = isDeviceConnected('bikeTrainer');
  const hasHeartRate = isDeviceConnected('heartRate');
  const hasMoxy = isDeviceConnected('moxy');
  const hasCoreTemp = isDeviceConnected('coreTemp');
  const hasVo2Master = isDeviceConnected('vo2master');

  const hasPower = hasBikeTrainer && (hasValidData(liveData.power) || historicalData.some(d => hasValidData(d.power)));
  const hasSpeed = hasBikeTrainer && (hasValidData(liveData.speed) || historicalData.some(d => hasValidData(d.speed)));
  const hasCadence = hasBikeTrainer && (hasValidData(liveData.cadence) || historicalData.some(d => hasValidData(d.cadence)));
  const hasSmO2 = hasMoxy && (hasValidData(liveData.smo2) || historicalData.some(d => hasValidData(d.smo2)));
  const hasThb = hasMoxy && (hasValidData(liveData.thb) || historicalData.some(d => hasValidData(d.thb)));
  const hasVo2 = hasVo2Master && (hasValidData(liveData.vo2) || historicalData.some(d => hasValidData(d.vo2)));

  const metricAvailability = useMemo(() => ({
    power: hasPower,
    speed: hasSpeed,
    heartRate: hasHeartRate,
    cadence: hasCadence,
    smo2: hasSmO2,
    thb: hasThb,
    vo2: hasVo2
  }), [hasPower, hasSpeed, hasHeartRate, hasCadence, hasSmO2, hasThb, hasVo2]);

  const selectedMetricKeys = Object.keys(visibleMetrics).filter(
    (key) => visibleMetrics[key] && metricAvailability[key]
  );

  useEffect(() => {
    if (selectedMetricKeys.length === 0) {
      const fallbackKey = Object.keys(METRIC_CONFIGS).find((key) => metricAvailability[key]);
      if (fallbackKey) {
        setVisibleMetrics((prev) => ({ ...prev, [fallbackKey]: true }));
      }
    }
  }, [selectedMetricKeys.length, metricAvailability]);

  const handleMetricToggle = (metricKey) => {
    if (!metricAvailability[metricKey]) return;
    setVisibleMetrics((prev) => {
      const next = { ...prev, [metricKey]: !prev[metricKey] };
      const enabledKeys = Object.keys(next).filter((key) => next[key] && metricAvailability[key]);
      if (enabledKeys.length === 0) {
        return prev;
      }
      return next;
    });
  };

  const formatTimeLabel = useCallback(
    (value) => {
      if (useMinutes) {
        // Format as HH:MM or MM:SS or just minutes
        const totalMinutes = Math.floor(value / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const seconds = Math.floor(value % 60);
        
        if (hours > 0) {
          return `${hours}h ${minutes}min`;
        } else if (totalMinutes > 0) {
          return `${totalMinutes}min`;
        } else {
          return `${seconds}s`;
        }
      }
      return `${Math.round(value)}s`;
    },
    [useMinutes]
  );
  
  // Build metric cards - use Set to track added labels and avoid duplicates
  const metricCards = [];
  const addedLabels = new Set();
  
  if (hasBikeTrainer && hasPower) {
    metricCards.push({
      label: 'Power',
      value: `${(liveData.power || 0).toFixed(0)}`,
      unit: 'W',
      icon: BoltIcon,
      color: 'blue'
    });
    addedLabels.add('Power');
  } else if (hasBikeTrainer && hasSpeed && !addedLabels.has('Speed')) {
    metricCards.push({
      label: 'Speed',
      value: `${(liveData.speed || 0).toFixed(1)}`,
      unit: 'km/h',
      icon: BoltIcon,
      color: 'blue'
    });
    addedLabels.add('Speed');
  }
  
  if (hasHeartRate) {
    metricCards.push({
      label: 'Heart Rate',
      value: `${(liveData.heartRate || 0).toFixed(0)}`,
      unit: 'bpm',
      icon: HeartIcon,
      color: 'red'
    });
    addedLabels.add('Heart Rate');
  }

  if (hasBikeTrainer && hasCadence) {
    metricCards.push({
      label: 'Cadence',
      value: `${(liveData.cadence || 0).toFixed(0)}`,
      unit: 'rpm',
      icon: ChartBarIcon,
      color: 'green'
    });
    addedLabels.add('Cadence');
  }

  // Add Speed as additional metric if it's available and not already added
  if (hasBikeTrainer && hasSpeed && !addedLabels.has('Speed')) {
    metricCards.push({
      label: 'Speed',
      value: `${(liveData.speed || 0).toFixed(1)}`,
      unit: 'km/h',
      icon: WifiIcon,
      color: 'purple'
    });
    addedLabels.add('Speed');
  }

  // Additional metrics
  const additionalMetrics = [];
  if (hasMoxy && hasValidData(liveData.smo2)) {
    additionalMetrics.push({ label: 'SmO2', value: (liveData.smo2 || 0).toFixed(1), unit: '%' });
  }
  if (hasMoxy && hasValidData(liveData.thb)) {
    additionalMetrics.push({ label: 'THb', value: (liveData.thb || 0).toFixed(1), unit: 'μM' });
  }
  if (hasCoreTemp && hasValidData(liveData.coreTemp)) {
    additionalMetrics.push({ label: 'Core Temp', value: (liveData.coreTemp || 0).toFixed(1), unit: '°C' });
  }
  if (hasVo2Master && hasValidData(liveData.vo2)) {
    additionalMetrics.push({ label: 'VO2', value: (liveData.vo2 || 0).toFixed(1), unit: 'ml/min/kg' });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Status Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium text-gray-700">
            {isActive ? 'Recording' : 'Stopped'}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {historicalData.length} data points
        </div>
      </div>

      {/* Metric Cards */}
      {metricCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <motion.div
                key={metric.label}
                className="bg-white/80 backdrop-blur rounded-xl border border-gray-200 p-4"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 text-${metric.color}-500`} />
                  <span className="text-xs text-gray-500">{metric.label}</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metric.value} <span className="text-sm text-gray-500">{metric.unit}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Additional Metrics */}
      {additionalMetrics.length > 0 && (
        <div className="p-4 bg-white/60 backdrop-blur rounded-2xl border border-white/40">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Additional Metrics</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {additionalMetrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-xs text-gray-600">{metric.label}</div>
                <div className="text-sm font-semibold text-gray-900">
                  {metric.value} {metric.unit}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Chart */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Real-Time Chart - Full Training
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex gap-1 bg-white/70 border border-gray-200 rounded-xl p-1">
              {['single', 'grid'].map((layout) => (
                <button
                  key={layout}
                  onClick={() => setChartLayout(layout)}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    chartLayout === layout
                      ? 'bg-primary text-white shadow'
                      : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {layout === 'single' ? 'Combined' : 'Grid'}
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
        </div>
        <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-4">
          {chartData.length > 0 ? (
            chartLayout === 'single' ? (
              <ResponsiveContainer width="100%" height={400} key={`chart-${chartKeyRef.current}`}>
                <LineChart 
                  data={chartData} 
                  margin={{ top: 5, right: 20, left: 10, bottom: 30 }}
                  syncId="live-dashboard-chart"
                >
                  <XAxis 
                    dataKey="time" 
                    stroke="#666"
                    strokeWidth={1}
                    type="number"
                    scale="linear"
                    domain={['dataMin', 'dataMax']}
                    allowDuplicatedCategory={false}
                    ticks={getTickPositions()}
                    tickFormatter={formatTimeLabel}
                    tick={{ fill: '#666', fontSize: 12 }}
                  />
                  <YAxis 
                    yAxisId="left"
                    label={{ value: selectedMetricKeys.filter(key => METRIC_CONFIGS[key].axis === 'left').map(key => METRIC_CONFIGS[key].label).join(' / ') || 'Metrics', angle: -90, position: 'insideLeft' }}
                    stroke="#666"
                  />
                  {selectedMetricKeys.some(key => METRIC_CONFIGS[key].axis === 'right') && (
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      label={{ value: selectedMetricKeys.filter(key => METRIC_CONFIGS[key].axis === 'right').map(key => METRIC_CONFIGS[key].label).join(' / ') || 'Secondary', angle: 90, position: 'insideRight' }}
                      stroke="#666"
                    />
                  )}
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
                    formatter={(value, name) => {
                      if (value === null || value === undefined) return ['--', name];
                      return [typeof value === 'number' ? value.toFixed(1).replace(/\.0$/, '') : value, name];
                    }}
                    labelFormatter={(label) => `Time: ${formatTimeLabel(label)}`}
                  />
                  <Legend />
                  {selectedMetricKeys.map((metricKey) => {
                    const cfg = METRIC_CONFIGS[metricKey];
                    return (
                      <Line 
                        key={metricKey}
                        yAxisId={cfg.axis}
                        type="monotone" 
                        dataKey={cfg.dataKey} 
                        stroke={cfg.color} 
                        strokeWidth={2}
                        dot={false}
                        name={`${cfg.label} ${cfg.unit ? `(${cfg.unit})` : ''}`}
                        isAnimationActive={false}
                        animationDuration={0}
                        connectNulls={true}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {selectedMetricKeys.map((metricKey) => {
                  const cfg = METRIC_CONFIGS[metricKey];
                  return (
                    <div key={`panel-${metricKey}`} className="bg-white/80 border border-white/50 rounded-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">{cfg.label}</span>
                        <span className="text-xs text-gray-500">{cfg.unit}</span>
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <XAxis
                            dataKey="time"
                            stroke="#999"
                            type="number"
                            scale="linear"
                            domain={['dataMin', 'dataMax']}
                            ticks={getTickPositions()}
                            tickFormatter={formatTimeLabel}
                          />
                          <YAxis
                            stroke="#999"
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #eee' }}
                            formatter={(value) => (value === null || value === undefined ? '—' : Math.round(value))}
                            labelFormatter={(label) => `Time: ${formatTimeLabel(label)}`}
                          />
                          <Line
                            type="monotone"
                            dataKey={cfg.dataKey}
                            stroke={cfg.color}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                            animationDuration={0}
                            connectNulls
                            name={cfg.label}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-96 text-gray-500">
              <div className="text-center">
                <ChartBarIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Waiting for data...</p>
                <p className="text-xs mt-1">Start the test to begin recording</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default LiveDashboard;
