import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  BoltIcon,
  HeartIcon,
  WifiIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const LiveDashboard = ({ liveData, devices, testState, historicalData }) => {
  const isActive = testState === 'running';

  // Prepare chart data from all historical data (from test start)
  const chartData = React.useMemo(() => {
    if (!historicalData || historicalData.length === 0) {
      // If no historical data yet, show current live data point
      return [{
        time: 0,
        power: liveData.power || 0,
        heartRate: liveData.heartRate || 0,
        cadence: liveData.cadence || 0
      }];
    }

    // Convert historical data to chart format
    // Time is relative to test start (in seconds)
    return historicalData.map((dataPoint, index) => ({
      time: Math.floor((dataPoint.totalTime || index) / 60), // Convert to minutes for better readability
      power: dataPoint.power || 0,
      heartRate: dataPoint.heartRate || 0,
      cadence: dataPoint.cadence || 0,
      smo2: dataPoint.smo2 || null,
      vo2: dataPoint.vo2 || null
    }));
  }, [historicalData, liveData]);

  const metricCards = [
    {
      label: 'Power',
      value: `${liveData.power?.toFixed(0) || 0}`,
      unit: 'W',
      icon: BoltIcon,
      color: 'blue'
    },
    {
      label: 'Heart Rate',
      value: `${liveData.heartRate?.toFixed(0) || 0}`,
      unit: 'bpm',
      icon: HeartIcon,
      color: 'red'
    },
    {
      label: 'Cadence',
      value: `${liveData.cadence?.toFixed(0) || 0}`,
      unit: 'rpm',
      icon: ChartBarIcon,
      color: 'green'
    },
    {
      label: 'SmO2',
      value: `${liveData.smo2?.toFixed(1) || '--'}`,
      unit: '%',
      icon: WifiIcon,
      color: 'purple'
    }
  ];

  const additionalMetrics = [
    { label: 'THb', value: liveData.thb?.toFixed(1) || '--', unit: '' },
    { label: 'Core Temp', value: liveData.coreTemp?.toFixed(1) || '--', unit: '°C' },
    { label: 'VO2', value: liveData.vo2?.toFixed(1) || '--', unit: 'ml/min/kg' },
    { label: 'VCO2', value: liveData.vco2?.toFixed(1) || '--', unit: 'ml/min' },
    { label: 'Ventilation', value: liveData.ventilation?.toFixed(1) || '--', unit: 'L/min' }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-md p-6"
    >
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <ChartBarIcon className="w-6 h-6" />
        Live Dashboard
      </h2>

      {/* Main Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {metricCards.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: isActive ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 0.3, repeat: isActive ? Infinity : 0, repeatDelay: 1 }}
              className={`p-4 rounded-lg border-2 ${
                metric.color === 'blue' ? 'border-blue-500 bg-blue-50' :
                metric.color === 'red' ? 'border-red-500 bg-red-50' :
                metric.color === 'green' ? 'border-green-500 bg-green-50' :
                'border-purple-500 bg-purple-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${
                  metric.color === 'blue' ? 'text-blue-600' :
                  metric.color === 'red' ? 'text-red-600' :
                  metric.color === 'green' ? 'text-green-600' :
                  'text-purple-600'
                }`} />
                <span className="text-sm font-medium text-gray-600">{metric.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${
                  metric.color === 'blue' ? 'text-blue-700' :
                  metric.color === 'red' ? 'text-red-700' :
                  metric.color === 'green' ? 'text-green-700' :
                  'text-purple-700'
                }`}>
                  {metric.value}
                </span>
                <span className="text-sm text-gray-500">{metric.unit}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Additional Metrics */}
      {additionalMetrics.some(m => m.value !== '--') && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
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
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="time" 
              label={{ value: 'Time (minutes)', position: 'insideBottom', offset: -5 }}
              stroke="#666"
              type="number"
              scale="linear"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis 
              yAxisId="left"
              label={{ value: 'Power / HR / Cadence', angle: -90, position: 'insideLeft' }}
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
                if (name === 'Power (W)') return [`${value.toFixed(0)} W`, name];
                if (name === 'HR (bpm)') return [`${value.toFixed(0)} bpm`, name];
                if (name === 'Cadence (rpm)') return [`${value.toFixed(0)} rpm`, name];
                if (name === 'SmO2 (%)') return [`${value.toFixed(1)}%`, name];
                if (name === 'VO2') return [`${value.toFixed(1)} ml/min/kg`, name];
                return [value, name];
              }}
            />
            <Legend />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="power" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
              name="Power (W)"
              isAnimationActive={false}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="heartRate" 
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
              name="HR (bpm)"
              isAnimationActive={false}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="cadence" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={false}
              name="Cadence (rpm)"
              isAnimationActive={false}
            />
            {chartData.some(d => d.smo2 !== null && d.smo2 !== undefined) && (
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
            {chartData.some(d => d.vo2 !== null && d.vo2 !== undefined) && (
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
        <p className="text-xs text-gray-500 mt-2">
          Showing all data points from test start ({chartData.length} data points)
        </p>
      </div>

      {/* Connection Status */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">Connected Devices:</span>
          {Object.entries(devices).filter(([_, state]) => state.connected).length > 0 ? (
            <div className="flex gap-2">
              {Object.entries(devices).map(([key, state]) => 
                state.connected && (
                  <span key={key} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
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

