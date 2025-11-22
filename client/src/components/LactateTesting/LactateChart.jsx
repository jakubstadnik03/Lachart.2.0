import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { ChartBarIcon } from '@heroicons/react/24/outline';
import SessionMetricsChart from './SessionMetricsChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const formatValue = (value, unit = '') => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value)}${unit}`;
};

const LactateChart = ({ lactateValues, historicalData, laps }) => {
  const chartData = useMemo(() => {
    if (!lactateValues.length) return { labels: [], datasets: [] };

    // Sort by power
    const sortedValues = [...lactateValues].sort((a, b) => (a.power || 0) - (b.power || 0));

    const powerData = [];
    const lactateData = [];
    const heartRateData = [];

    sortedValues.forEach((lv) => {
      const stepIndex = (lv.step ?? 1) - 1;
      const relevantData = historicalData.filter((hd) => hd.step === stepIndex);

      // Filter only work interval samples (power > 10W)
      const workSamples = relevantData.filter(sample => 
        sample.power !== null && sample.power !== undefined && sample.power > 10
      );

      // Calculate max heart rate from work interval
      const maxHeartRate = workSamples.length > 0
        ? Math.max(...workSamples.map(d => d.heartRate).filter(hr => hr !== null && hr !== undefined))
        : null;

      powerData.push(Math.round(lv.power || 0));
      lactateData.push(lv.lactate || 0);
      // Only add HR if we have valid data (not 0 or null)
      heartRateData.push(maxHeartRate && maxHeartRate > 0 ? maxHeartRate : null);
    });

    return {
      labels: powerData.map(p => `${Math.round(p)}W`),
      datasets: [
        {
          label: "Lactate (mmol/L)",
          data: lactateData,
          borderColor: "#3F8CFE",
          backgroundColor: "#3F8CFE",
          pointStyle: "circle",
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: "#3F8CFE",
          yAxisID: "y",
        },
        {
          label: "Heart Rate (BPM)",
          data: heartRateData,
          borderColor: "#E7515A",
          backgroundColor: "#E7515A",
          pointStyle: "circle",
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: "#E7515A",
          yAxisID: "y1",
          spanGaps: false, // Don't connect null values
        },
      ]
    };
  }, [lactateValues, historicalData]);

  const hasData = lactateValues.length > 0;

  const chartOptions = useMemo(() => {
    const sortedValues = [...lactateValues].sort((a, b) => (a.power || 0) - (b.power || 0));
    const lactateData = sortedValues.map(lv => lv.lactate || 0);
    const heartRateData = sortedValues.map((lv) => {
      const stepIndex = (lv.step ?? 1) - 1;
      const relevantData = historicalData.filter((hd) => hd.step === stepIndex);
      const workSamples = relevantData.filter(sample => 
        sample.power !== null && sample.power !== undefined && sample.power > 10
      );
      const maxHeartRate = workSamples.length > 0
        ? Math.max(...workSamples.map(d => d.heartRate).filter(hr => hr !== null && hr !== undefined))
        : null;
      return maxHeartRate || 0;
    });

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            pointRadius: 4,
            font: { size: 12 },
          },
        },
        tooltip: {
          enabled: true,
          mode: 'nearest',
          intersect: true,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#111827',
          titleFont: { weight: 'bold', size: 14 },
          bodyColor: '#111827',
          bodyFont: { size: 13 },
          borderColor: '#F3F4F6',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          callbacks: {
            title: (context) => {
              const index = context[0].dataIndex;
              const sortedValues = [...lactateValues].sort((a, b) => (a.power || 0) - (b.power || 0));
              const lv = sortedValues[index];
              if (lv) {
                return `Step ${lv.step} - ${Math.round(lv.power)}W`;
              }
              return '';
            },
            label: (context) => {
              const label = context.dataset.label;
              const value = context.parsed.y;
              const index = context.dataIndex;
              const sortedValues = [...lactateValues].sort((a, b) => (a.power || 0) - (b.power || 0));
              const lv = sortedValues[index];
              
              if (label === "Lactate (mmol/L)") {
                if (lv) {
                  return `${label}: ${value.toFixed(2)} mmol/L | Power: ${Math.round(lv.power)}W`;
                }
                return `${label}: ${value.toFixed(2)} mmol/L`;
              } else if (label === "Heart Rate (BPM)") {
                if (value === null || value === undefined || value === 0) return null;
                return `${label}: ${Math.round(value)} bpm`;
              }
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: "Lactate (mmol/L)" },
          min: 0,
          max: Math.ceil(Math.max(...lactateData, 0) + 1),
          ticks: { display: true },
          border: { dash: [6, 6] },
          grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
            drawTicks: true,
          },
        },
        y1: {
          title: { display: true, text: "Heart Rate (BPM)" },
          min: 100,
          max: Math.max(...heartRateData, 0) + 10 || 200,
          position: "right",
          ticks: { display: true },
          grid: {
            drawOnChartArea: true,
            color: "rgba(0, 0, 0, 0)",
            borderDash: [4, 4],
          },
        },
        x: {
          title: { display: true, text: "Power (W)" },
          border: { dash: [6, 6] },
          grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
          },
          ticks: {
            callback: function(value, index) {
              const sortedValues = [...lactateValues].sort((a, b) => (a.power || 0) - (b.power || 0));
              if (sortedValues[index]) {
                return `${Math.round(sortedValues[index].power)}W`;
              }
              return '';
            }
          }
        },
      },
    };
  }, [lactateValues, historicalData]);

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
            <div className="relative w-full max-w-full overflow-x-auto p-2 md:p-4 bg-white/60 backdrop-blur rounded-2xl border border-white/40">
              <div style={{ width: '100%', minWidth: 0, maxWidth: '100vw', height: '400px' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>

          {/* Session Metrics Chart with bars for intervals */}
          {historicalData && historicalData.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/40">
              <SessionMetricsChart 
                historical={historicalData}
                lactateValues={lactateValues}
                laps={laps || []}
              />
            </div>
          )}

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
                  {(() => {
                    const sortedValues = [...lactateValues].sort((a, b) => (a.power || 0) - (b.power || 0));
                    if (sortedValues.length === 0) return '—';
                    return `${formatValue(sortedValues[0]?.power, ' W')} - ${formatValue(sortedValues[sortedValues.length - 1]?.power, ' W')}`;
                  })()}
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

