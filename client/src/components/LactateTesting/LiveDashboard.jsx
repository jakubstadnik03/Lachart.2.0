import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  BoltIcon,
  HeartIcon,
  WifiIcon,
  ChartBarIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

const LiveDashboard = ({ liveData, devices, testState, historicalData, intervalTimer, protocol, currentStep }) => {
  const isActive = testState === 'running';

  // Check which devices are connected and have valid data
  const isDeviceConnected = (deviceType) => {
    return devices[deviceType]?.connected === true;
  };

  const hasValidData = (value) => {
    return value !== null && value !== undefined && value > 0;
  };

  // Prepare chart data from all historical data (from test start)
  // This will update in real-time as new data points are added
  const chartData = React.useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      // If no historical data yet, return empty array (will show empty chart)
      return [];
    }

    // Convert historical data to chart format
    // Time is relative to test start (in seconds)
    // Always use totalTime from dataPoint to ensure accurate time tracking
    const converted = historicalData.map((dataPoint, index) => {
      // Use totalTime if available, otherwise calculate from index
      // This ensures time is always accurate even if data collection started late
      const timeValue = dataPoint.totalTime !== undefined && dataPoint.totalTime !== null 
        ? dataPoint.totalTime 
        : index;
      
      // Always include values, even if 0/null - this allows curves to be drawn from the start
      // Recharts will handle null values by not drawing points, but we want to show the curve
      return {
        time: timeValue,
        power: dataPoint.power !== undefined && dataPoint.power !== null && dataPoint.power > 0 ? dataPoint.power : (dataPoint.power === 0 ? 0 : null),
        speed: dataPoint.speed !== undefined && dataPoint.speed !== null && dataPoint.speed > 0 ? (dataPoint.speed * 3.6) : (dataPoint.speed === 0 ? 0 : null), // Convert m/s to km/h
        heartRate: dataPoint.heartRate !== undefined && dataPoint.heartRate !== null && dataPoint.heartRate > 0 ? dataPoint.heartRate : (dataPoint.heartRate === 0 ? 0 : null),
        cadence: dataPoint.cadence !== undefined && dataPoint.cadence !== null && dataPoint.cadence > 0 ? dataPoint.cadence : (dataPoint.cadence === 0 ? 0 : null),
        smo2: dataPoint.smo2 !== undefined && dataPoint.smo2 !== null && dataPoint.smo2 > 0 ? dataPoint.smo2 : null,
        vo2: dataPoint.vo2 !== undefined && dataPoint.vo2 !== null && dataPoint.vo2 > 0 ? dataPoint.vo2 : null
      };
    });
    
    // Debug logging
    if (converted.length > 0 && converted.length % 10 === 0) {
      console.log(`[LiveDashboard] Chart data updated: ${converted.length} points, latest time: ${converted[converted.length - 1].time}s`);
    }
    
    return converted;
  }, [historicalData]);

  // Determine which metrics to show based on connected devices
  const hasBikeTrainer = isDeviceConnected('bikeTrainer');
  const hasHeartRate = isDeviceConnected('heartRate');
  const hasMoxy = isDeviceConnected('moxy');
  const hasCoreTemp = isDeviceConnected('coreTemp');
  const hasVo2Master = isDeviceConnected('vo2master');

  // Check if we have power or speed data
  const hasSpeed = hasBikeTrainer && (hasValidData(liveData.speed) || historicalData.some(d => hasValidData(d.speed)));
  const hasPower = hasBikeTrainer && (hasValidData(liveData.power) || historicalData.some(d => hasValidData(d.power)));
  
  // Build metric cards - only show connected devices
  const metricCards = [];
  
  // Power or Speed (from bikeTrainer)
  if (hasBikeTrainer) {
    if (hasPower) {
      metricCards.push({
        label: 'Power',
        value: `${(liveData.power || 0).toFixed(0)}`,
        unit: 'W',
        icon: BoltIcon,
        color: 'blue'
      });
    } else if (hasSpeed) {
      metricCards.push({
        label: 'Speed',
        value: `${(liveData.speed || 0).toFixed(1)}`,
        unit: 'km/h',
        icon: BoltIcon,
        color: 'blue'
      });
    }
  }
  
  // Heart Rate
  if (hasHeartRate) {
    metricCards.push({
      label: 'Heart Rate',
      value: `${(liveData.heartRate || 0).toFixed(0)}`,
      unit: 'bpm',
      icon: HeartIcon,
      color: 'red'
    });
  }
  
  // Cadence (from bikeTrainer)
  if (hasBikeTrainer && (hasValidData(liveData.cadence) || historicalData.some(d => hasValidData(d.cadence)))) {
    metricCards.push({
      label: 'Cadence',
      value: `${(liveData.cadence || 0).toFixed(0)}`,
      unit: 'rpm',
      icon: ChartBarIcon,
      color: 'green'
    });
  }
  
  // Interval Time
  if (isActive && protocol?.steps && protocol.steps.length > 0) {
    const currentStepData = protocol.steps[currentStep];
    const intervalDuration = currentStepData?.duration || protocol.workDuration || 0;
    const remainingTime = Math.max(0, intervalDuration - (intervalTimer || 0));
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    
    metricCards.push({
      label: 'Interval Time',
      value: `${minutes}:${seconds.toString().padStart(2, '0')}`,
      unit: '',
      icon: ClockIcon,
      color: 'orange'
    });
  }

  // Additional metrics - only if device is connected
  const additionalMetrics = [];
  if (hasMoxy && hasValidData(liveData.smo2)) {
    additionalMetrics.push({ label: 'SmO2', value: liveData.smo2.toFixed(1), unit: '%' });
  }
  if (hasMoxy && hasValidData(liveData.thb)) {
    additionalMetrics.push({ label: 'THb', value: liveData.thb.toFixed(1), unit: '' });
  }
  if (hasCoreTemp && hasValidData(liveData.coreTemp)) {
    additionalMetrics.push({ label: 'Core Temp', value: liveData.coreTemp.toFixed(1), unit: '°C' });
  }
  if (hasVo2Master && hasValidData(liveData.vo2)) {
    additionalMetrics.push({ label: 'VO2', value: liveData.vo2.toFixed(1), unit: 'ml/min/kg' });
  }
  if (hasVo2Master && hasValidData(liveData.vco2)) {
    additionalMetrics.push({ label: 'VCO2', value: liveData.vco2.toFixed(1), unit: 'ml/min' });
  }
  if (hasVo2Master && hasValidData(liveData.ventilation)) {
    additionalMetrics.push({ label: 'Ventilation', value: liveData.ventilation.toFixed(1), unit: 'L/min' });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6"
    >
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <ChartBarIcon className="w-6 h-6" />
        Live Dashboard
      </h2>

      {/* Main Metrics */}
      {metricCards.length > 0 && (
        <div className={`grid grid-cols-2 ${metricCards.length > 2 ? 'md:grid-cols-4' : metricCards.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-4 mb-6`}>
          {metricCards.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: isActive ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 0.3, repeat: isActive ? Infinity : 0, repeatDelay: 1 }}
              className={`p-4 rounded-2xl border border-white/40 bg-white/60 backdrop-blur`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 text-gray-700`} />
                <span className="text-sm font-medium text-gray-600">{metric.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold text-gray-900`}>
                  {metric.value}
                </span>
                <span className="text-sm text-gray-500">{metric.unit}</span>
              </div>
            </motion.div>
          );
        })}
        </div>
      )}

      {/* Additional Metrics */}
      {additionalMetrics.some(m => m.value !== '--') && (
        <div className="mb-6 p-4 bg-white/60 backdrop-blur rounded-2xl border border-white/40">
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

      {/* Live Chart - Full Training History */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Real-Time Chart - Full Training (from start)
        </h3>
        <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-2">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400} key={`chart-container-${chartData.length}`}>
            <LineChart 
              data={chartData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              syncId="live-dashboard-chart"
            >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="time" 
              label={{ value: 'Time (MM:SS)', position: 'insideBottom', offset: -5 }}
              stroke="#666"
              type="number"
              scale="linear"
              domain={chartData.length > 0 ? ['dataMin', 'dataMax'] : [0, 1]}
              tickFormatter={(value) => {
                const minutes = Math.floor(value / 60);
                const seconds = Math.floor(value % 60);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
              }}
            />
            <YAxis 
              yAxisId="left"
              label={{ value: hasPower ? 'Power / HR / Cadence' : 'Speed / HR / Cadence', angle: -90, position: 'insideLeft' }}
              stroke="#666"
            />
            <YAxis 
              yAxisId="right" 
              orientation="right"
              label={{ value: 'SmO2 / VO2', angle: 90, position: 'insideRight' }}
              stroke="#666"
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
              formatter={(value, name) => {
                if (name === 'Speed (km/h)') {
                  return [`${value?.toFixed(1) || 0} km/h`, 'Speed (km/h)'];
                }
                if (name === 'Power (W)') {
                  return [`${value?.toFixed(0) || 0} W`, 'Power (W)'];
                }
                if (name === 'HR (bpm)') return [`${value?.toFixed(0) || 0} bpm`, name];
                if (name === 'Cadence (rpm)') return [`${value?.toFixed(0) || 0} rpm`, name];
                if (name === 'SmO2 (%)') return [`${value?.toFixed(1) || 0}%`, name];
                if (name === 'VO2') return [`${value?.toFixed(1) || 0} ml/min/kg`, name];
                return [value, name];
              }}
            />
            <Legend />
            {/* Power or Speed line - only if device is connected */}
            {hasBikeTrainer && (hasPower || hasSpeed) && (
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey={hasSpeed ? "speed" : "power"} 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
                name={hasSpeed ? "Speed (km/h)" : "Power (W)"}
                isAnimationActive={false}
                connectNulls={true}
                activeDot={{ r: 4 }}
              />
            )}
            {/* Heart Rate line - only if device is connected */}
            {hasHeartRate && (
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="heartRate" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={false}
                name="HR (bpm)"
                isAnimationActive={false}
                connectNulls={true}
                activeDot={{ r: 4 }}
              />
            )}
            {/* Cadence line - only if bikeTrainer is connected */}
            {hasBikeTrainer && (
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="cadence" 
                stroke="#10b981" 
                strokeWidth={2}
                dot={false}
                name="Cadence (rpm)"
                isAnimationActive={false}
                connectNulls={true}
                activeDot={{ r: 4 }}
              />
            )}
            {/* SmO2 line - only if moxy is connected */}
            {hasMoxy && chartData.some(d => d.smo2 !== null && d.smo2 !== undefined) && (
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="smo2" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                dot={false}
                name="SmO2 (%)"
                isAnimationActive={false}
                connectNulls
              />
            )}
            {/* VO2 line - only if vo2master is connected */}
            {hasVo2Master && chartData.some(d => d.vo2 !== null && d.vo2 !== undefined) && (
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="vo2" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={false}
                name="VO2 (ml/min/kg)"
                isAnimationActive={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">Waiting for data...</p>
              <p className="text-sm">Start the test to begin recording data</p>
            </div>
          </div>
        )}
        </div>
        {chartData.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Showing all data points from test start ({chartData.length} data points, {chartData.length > 0 ? `${Math.floor(chartData[chartData.length - 1].time / 60)}:${String(Math.floor(chartData[chartData.length - 1].time % 60)).padStart(2, '0')}` : '0:00'})
          </p>
        )}
      </div>

      {/* Connection Status */}
      <div className="mt-4 pt-4 border-t border-white/40">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">Connected Devices:</span>
          {Object.entries(devices).filter(([_, state]) => state.connected).length > 0 ? (
            <div className="flex gap-2">
              {Object.entries(devices).map(([key, state]) => 
                state.connected && (
                  <span key={key} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs border border-emerald-200">
                    {key}
                  </span>
                )
              )}
            </div>
          ) : (
            <span className="text-gray-400">None</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default LiveDashboard;

