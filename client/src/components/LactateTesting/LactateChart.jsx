import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { ChartBarIcon } from '@heroicons/react/24/outline';

const roundValue = (value, decimals = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (decimals === 0) {
    return Math.round(value);
  }
  return Number(value.toFixed(decimals));
};

const formatValue = (value, unit = '') => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value)}${unit}`;
};

const LactateChart = ({ lactateValues, historicalData }) => {
  const lactateChartData = useMemo(() => {
    if (!lactateValues.length) return [];

    return lactateValues.map((lv) => {
      const stepIndex = (lv.step ?? 1) - 1;
      const relevantData = historicalData.filter((hd) => hd.step === stepIndex);

      const calcAverage = (key) => {
        const values = relevantData
          .map((d) => d[key])
          .filter((val) => val !== null && val !== undefined);
        if (!values.length) return null;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      };

      const lastPoint = relevantData.length > 0 ? relevantData[relevantData.length - 1] : null;

      return {
        step: lv.step,
        power: roundValue(lv.power),
        lactate: roundValue(lv.lactate, 2),
        borg: lv.borg ? roundValue(lv.borg) : null,
        avgPower: roundValue(calcAverage('power')),
        avgHeartRate: roundValue(calcAverage('heartRate')),
        avgCadence: roundValue(calcAverage('cadence')),
        avgSpeed: roundValue(calcAverage('speed')),
        avgSmO2: roundValue(calcAverage('smo2')),
        avgVo2: roundValue(calcAverage('vo2')),
        avgThb: roundValue(calcAverage('thb')),
        avgVentilation: roundValue(calcAverage('ventilation')),
        endHeartRate: lastPoint?.heartRate ? roundValue(lastPoint.heartRate) : null,
        endCadence: lastPoint?.cadence ? roundValue(lastPoint.cadence) : null
      };
    }).sort((a, b) => (a.power || 0) - (b.power || 0));
  }, [lactateValues, historicalData]);

  const hasData = lactateChartData.length > 0;

  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
      <div className="bg-white/95 p-3 border border-gray-200 rounded-xl shadow-lg text-sm">
        <p className="font-semibold text-gray-800 mb-1">Step {data.step}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-gray-500">Power</span>
          <span className="font-semibold text-gray-900">{formatValue(data.power, ' W')}</span>

          <span className="text-gray-500">Lactate</span>
          <span className="font-semibold text-gray-900">
            {data.lactate !== null ? `${Number(data.lactate).toFixed(2)} mmol/L` : '—'}
          </span>

          <span className="text-gray-500">Avg HR</span>
          <span className="text-gray-900">{formatValue(data.avgHeartRate, ' bpm')}</span>

          <span className="text-gray-500">HR (interval end)</span>
          <span className="text-gray-900">{formatValue(data.endHeartRate, ' bpm')}</span>

          <span className="text-gray-500">Avg Cadence</span>
          <span className="text-gray-900">{formatValue(data.avgCadence, ' rpm')}</span>

          <span className="text-gray-500">Avg Speed</span>
          <span className="text-gray-900">{formatValue(data.avgSpeed, ' km/h')}</span>

          <span className="text-gray-500">Avg SmO₂</span>
          <span className="text-gray-900">{formatValue(data.avgSmO2, ' %')}</span>

          <span className="text-gray-500">Avg VO₂</span>
          <span className="text-gray-900">{formatValue(data.avgVo2)}</span>

          <span className="text-gray-500">Avg tHb</span>
          <span className="text-gray-900">{formatValue(data.avgThb)}</span>

          <span className="text-gray-500">Avg Ventilation</span>
          <span className="text-gray-900">{formatValue(data.avgVentilation)}</span>

          {data.borg && (
            <>
              <span className="text-gray-500">BORG</span>
              <span className="text-gray-900">{data.borg}</span>
            </>
          )}
        </div>
      </div>
    );
  };

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
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Lactate vs Power</h3>
            <div className="bg-white/60 backdrop-blur rounded-2xl border border-white/40 p-2">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={lactateChartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="power"
                    name="Power"
                    unit="W"
                    label={{ value: 'Power (W)', position: 'insideBottom', offset: -5 }}
                    stroke="#666"
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="lactate"
                    name="Lactate"
                    unit="mmol/L"
                    label={{ value: 'Lactate (mmol/L)', angle: -90, position: 'insideLeft' }}
                    stroke="#666"
                  />
                  <Tooltip content={renderTooltip} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="lactate"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={false}
                    name="Lactate Curve"
                    connectNulls
                  />
                  <Scatter
                    dataKey="lactate"
                    fill="#7c3aed"
                    name="Lactate Sample"
                    shape="circle"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

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
                  {formatValue(lactateChartData[0]?.power, ' W')} -{' '}
                  {formatValue(lactateChartData[lactateChartData.length - 1]?.power, ' W')}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Max Lactate</div>
                <div className="font-semibold text-gray-900">
                  {Math.max(...lactateValues.map((lv) => lv.lactate)).toFixed(2)} mmol/L
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

