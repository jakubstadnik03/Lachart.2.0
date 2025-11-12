import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ScatterChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { ChartBarIcon } from '@heroicons/react/24/outline';

const LactateChart = ({ lactateValues, historicalData, protocol }) => {
  // Prepare lactate curve data
  const lactateCurveData = useMemo(() => {
    return lactateValues.map(lv => ({
      power: lv.power,
      lactate: lv.lactate,
      borg: lv.borg,
      step: lv.step,
      time: lv.time
    })).sort((a, b) => a.power - b.power);
  }, [lactateValues]);

  // Prepare multi-sensor comparison data
  const multiSensorData = useMemo(() => {
    if (lactateValues.length === 0) return [];

    return lactateValues.map(lv => {
      // Find average values for this power level from historical data
      const relevantData = historicalData.filter(hd => 
        Math.abs(hd.power - lv.power) < 10 // Within 10W
      );

      const avgSmO2 = relevantData.length > 0
        ? relevantData.reduce((sum, d) => sum + (d.smo2 || 0), 0) / relevantData.length
        : null;

      const avgHR = relevantData.length > 0
        ? relevantData.reduce((sum, d) => sum + (d.heartRate || 0), 0) / relevantData.length
        : null;

      const avgVO2 = relevantData.length > 0
        ? relevantData.reduce((sum, d) => sum + (d.vo2 || 0), 0) / relevantData.length
        : null;

      return {
        power: lv.power,
        lactate: lv.lactate,
        borg: lv.borg,
        smo2: avgSmO2,
        heartRate: avgHR,
        vo2: avgVO2
      };
    }).sort((a, b) => a.power - b.power);
  }, [lactateValues, historicalData]);

  const hasData = lactateValues.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6"
    >
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <ChartBarIcon className="w-6 h-6" />
        Lactate Curve Analysis
      </h2>

      {!hasData ? (
        <div className="text-center py-12 text-gray-500 bg-white/60 border border-white/40 rounded-2xl">
          <p>No lactate values entered yet.</p>
          <p className="text-sm mt-2">Add lactate values after each work interval to see the curve.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Primary Lactate Curve */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Lactate vs Power</h3>
            <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-2">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart data={lactateCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="power" 
                  name="Power" 
                  unit="W"
                  label={{ value: 'Power (W)', position: 'insideBottom', offset: -5 }}
                  stroke="#666"
                />
                <YAxis 
                  dataKey="lactate" 
                  name="Lactate" 
                  unit="mmol/L"
                  label={{ value: 'Lactate (mmol/L)', angle: -90, position: 'insideLeft' }}
                  stroke="#666"
                />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                          <p className="font-semibold">Step {data.step}</p>
                          <p>Power: {data.power} W</p>
                          <p>Lactate: {data.lactate} mmol/L</p>
                          {data.borg && <p>BORG: {data.borg}</p>}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter 
                  dataKey="lactate" 
                  fill="#8b5cf6" 
                  shape="circle"
                  name="Lactate"
                />
              </ScatterChart>
            </ResponsiveContainer>
            </div>
          </div>

          {/* Multi-Sensor Comparison */}
          {multiSensorData.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Multi-Sensor Comparison</h3>
              <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-2">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={multiSensorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="power" 
                    name="Power"
                    unit="W"
                    label={{ value: 'Power (W)', position: 'insideBottom', offset: -5 }}
                    stroke="#666"
                  />
                  <YAxis 
                    yAxisId="left"
                    label={{ value: 'Lactate (mmol/L)', angle: -90, position: 'insideLeft' }}
                    stroke="#666"
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right"
                    label={{ value: 'Other Metrics', angle: 90, position: 'insideRight' }}
                    stroke="#666"
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
                  />
                  <Legend />
                  <Scatter 
                    yAxisId="left"
                    dataKey="lactate" 
                    fill="#8b5cf6" 
                    name="Lactate (mmol/L)"
                    shape="circle"
                  />
                  {multiSensorData.some(d => d.smo2) && (
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="smo2" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 4 }}
                      name="SmO2 (%)"
                      connectNulls
                    />
                  )}
                  {multiSensorData.some(d => d.heartRate) && (
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="heartRate" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      dot={{ fill: '#ef4444', r: 4 }}
                      name="HR (bpm)"
                      connectNulls
                    />
                  )}
                  {multiSensorData.some(d => d.vo2) && (
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="vo2" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      name="VO2 (ml/min/kg)"
                      connectNulls
                    />
                  )}
                  {multiSensorData.some(d => d.borg) && (
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="borg" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={{ fill: '#f59e0b', r: 4 }}
                      name="BORG (RPE)"
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Data Summary */}
          <div className="mt-4 pt-4 border-t border-white/40">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Test Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Lactate Values</div>
                <div className="font-semibold text-gray-900">{lactateValues.length}</div>
              </div>
              <div>
                <div className="text-gray-600">Power Range</div>
                <div className="font-semibold text-gray-900">
                  {lactateCurveData[0]?.power || 0} - {lactateCurveData[lactateCurveData.length - 1]?.power || 0} W
                </div>
              </div>
              <div>
                <div className="text-gray-600">Max Lactate</div>
                <div className="font-semibold text-gray-900">
                  {Math.max(...lactateValues.map(lv => lv.lactate)).toFixed(1)} mmol/L
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default LactateChart;

