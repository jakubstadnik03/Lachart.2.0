import React, { useState, useEffect } from 'react';
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
import { convertPowerToPace } from '../../utils/paceConverter';
import { HelpCircle, Info } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Enhanced tooltip component with more detailed information
const CustomTooltip = ({ tooltip, datasets, sport }) => {
  if (!tooltip?.dataPoints) return null;

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;

  const interval = index + 1;
  const power = tooltip.dataPoints[0]?.label || "N/A";
  const bpm = datasets[1]?.data?.[index] ?? "N/A";
  const mmol = datasets[0]?.data?.[index] ?? "N/A";

  return (
    <div
      className="absolute bg-white/95 backdrop-blur-sm shadow-lg p-4 rounded-xl text-sm border border-gray-100"
      style={{
        left: tooltip.caretX,
        top: tooltip.caretY,
        transform: "translate(-50%, -120%)",
        position: "absolute",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 50
      }}
    >
      <div className="font-bold text-gray-900 mb-2">Interval {interval}</div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="w-2 h-2 rounded-full bg-gray-500"></span>
          {sport === 'bike' ? 'Power' : 'Pace'}: {power}
        </div>
        <div className="flex items-center gap-2 text-blue-600">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Lactate: {mmol} mmol/L
        </div>
        <div className="flex items-center gap-2 text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          Heart Rate: {bpm} Bpm
        </div>
      </div>
      <div
        className="absolute w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-8 border-t-white"
        style={{
          left: "50%",
          bottom: "-8px",
          transform: "translateX(-50%)",
        }}
      ></div>
    </div>
  );
};

// Info tooltip component
const InfoTooltip = ({ content }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Info size={16} />
      </button>
      {isVisible && (
        <div className="absolute z-50 bg-white text-sm px-4 py-2 rounded-lg shadow-lg -top-2 left-6 transform -translate-y-full max-w-xs border border-gray-100">
          {content}
          <div className="absolute w-2 h-2 bg-white border-l border-b border-gray-100 transform rotate-45 -left-1 top-1/2 -translate-y-1/2"></div>
        </div>
      )}
    </div>
  );
};

const LactateCurve = ({ mockData, demoMode = false }) => {
  const [tooltip, setTooltip] = useState(null);
  const [showGuide, setShowGuide] = useState(demoMode);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  if (!mockData || !mockData.results || mockData.results.length === 0) {
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <HelpCircle size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-500 text-center">
            Add test results to see the lactate curve
          </p>
          {demoMode && (
            <p className="text-gray-400 text-sm text-center mt-2">
              Fill in the test form above with your interval data
            </p>
          )}
        </div>
      </div>
    );
  }

  // Filter out rows with empty or invalid values
  const validResults = mockData.results.filter(result => 
    result &&
    result.power !== '' &&
    result.lactate !== '' &&
    !isNaN(Number(result.power)) &&
    !isNaN(Number(result.lactate))
  );

  if (validResults.length < 2) {
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <Info size={48} className="text-yellow-400 mb-4" />
          <p className="text-gray-600 text-center">
            Need at least 2 valid data points to create the curve
          </p>
          <p className="text-gray-400 text-sm text-center mt-2">
            Make sure to enter both power/pace and lactate values
          </p>
        </div>
      </div>
    );
  }

  try {
    const powerData = validResults.map((result) => result.power);
    const lactateData = validResults.map((result) => result.lactate);
    const heartRateData = validResults.map((result) => result.heartRate);

    const datasets = [
      {
        label: "Lactate (mmol/L)",
        data: lactateData,
        borderColor: "#3F8CFE",
        backgroundColor: "#3F8CFE",
        pointStyle: "circle",
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: "#3F8CFE",
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
      },
    ];

    const data = { 
      labels: powerData.map(power => 
        mockData.sport === "bike" ? `${power}W` : convertPowerToPace(power, mockData.sport)
      ), 
      datasets 
    };

    const options = {
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
          enabled: false,
          external: (context) => {
            if (context.tooltip.opacity === 0) {
              setTooltip(null);
            } else {
              setTooltip({
                ...context.tooltip,
                dataPoints: context.tooltip.dataPoints.map(point => ({
                  ...point,
                  datasetIndex: point.datasetIndex,
                  dataIndex: point.dataIndex,
                  label: point.label,
                  value: point.raw
                }))
              });
            }
          }
        },
      },
      scales: {
        y: {
          title: { display: true, text: "Lactate (mmol/L)" },
          min: 0,
          max: Math.ceil(Math.max(...lactateData) + 1),
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
          max: Math.max(...heartRateData) + 10,
          position: "right",
          ticks: { display: true },
          grid: {
            drawOnChartArea: true,
            color: "rgba(0, 0, 0, 0)",
            borderDash: [4, 4],
          },
        },
        x: {
          title: {
            display: true,
            text: mockData.sport === 'bike' ? "Power (W)" : "Pace (min/km)"
          },
          border: { dash: [6, 6] },
          grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
          },
          ticks: {
            callback: function(value, index) {
              const power = powerData[index];
              return mockData.sport === 'bike' ? `${power}W` : convertPowerToPace(power, mockData.sport);
            }
          }
        },
      },
    };

    return (
      <div className="relative w-full p-6 bg-white rounded-2xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              Lactate Curve 
              {demoMode && (
                <InfoTooltip content="This graph shows the relationship between your power/pace and lactate levels, helping identify your training zones." />
              )}
              <span className="text-xl text-gray-600 ml-2">({formatDate(mockData.date)})</span>
            </h2>
            <p className="text-lg text-gray-500 flex items-center gap-2">
              Base Lactate: 
              <span className="text-blue-500 font-medium">{mockData.baseLactate} mmol/L</span>
              {demoMode && (
                <InfoTooltip content="Your resting lactate level before the test." />
              )}
            </p>
          </div>
          {demoMode && (
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-primary hover:text-primary-dark transition-colors"
            >
              <HelpCircle size={24} />
            </button>
          )}
        </div>

        {demoMode && showGuide && (
          <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <h3 className="font-semibold mb-2">How to Read This Graph:</h3>
            <ul className="space-y-2">
              <li>• Blue line shows lactate concentration at different intensities</li>
              <li>• Red line shows heart rate response</li>
              <li>• Hover over points to see detailed values</li>
              <li>• Sharp increases in lactate indicate threshold points</li>
            </ul>
          </div>
        )}

        <div className="relative" style={{ width: '100%', height: '400px' }}>
          <Line data={data} options={{
            ...options,
            plugins: {
              ...options.plugins,
              tooltip: {
                ...options.plugins.tooltip,
                enabled: false,
                external: demoMode ? (context) => {
                  if (context.tooltip.opacity === 0) {
                    setTooltip(null);
                  } else {
                    setTooltip({
                      ...context.tooltip,
                      dataPoints: context.tooltip.dataPoints.map(point => ({
                        ...point,
                        datasetIndex: point.datasetIndex,
                        dataIndex: point.dataIndex,
                        label: point.label,
                        value: point.raw
                      }))
                    });
                  }
                } : null
              }
            }
          }} />
          {demoMode && tooltip && <CustomTooltip tooltip={tooltip} datasets={datasets} sport={mockData.sport} />}
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error calculating lactate curve:', error);
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-red-500 mb-4">⚠️</div>
          <p className="text-red-500 text-center">Error calculating lactate curve</p>
          {demoMode && (
            <p className="text-gray-400 text-sm text-center mt-2">
              Please check your input data and try again
            </p>
          )}
        </div>
      </div>
    );
  }
};

export default LactateCurve;
