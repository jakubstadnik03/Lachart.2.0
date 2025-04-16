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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const CustomTooltip = ({ tooltip, datasets }) => {
  if (!tooltip?.dataPoints) return null;

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;

  const interval = index + 1;
  const label = tooltip.dataPoints[0]?.label || "N/A";
  const bpm = datasets[1]?.data?.[index] ?? "N/A";
  const mmol = datasets[0]?.data?.[index] ?? "N/A";

  return (
    <div
      className="absolute bg-white/95 backdrop-blur-sm shadow-lg p-3 rounded-xl text-sm border border-gray-100"
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
      <div className="font-bold text-gray-900 mb-1">Interval {interval}</div>
      <div className="flex items-center gap-2 text-blue-600">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        Lactate: {mmol} mmol/L
      </div>
      <div className="flex items-center gap-2 text-red-600">
        <span className="w-2 h-2 rounded-full bg-red-500"></span>
        Heart Rate: {bpm} Bpm
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

const LactateCurve = ({ mockData }) => {
  const [tooltip, setTooltip] = useState(null);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-');
  };

  if (!mockData || !mockData.results || mockData.results.length === 0) {
    return <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
      <p className="text-gray-500 text-center">Add test results to see the lactate curve</p>
    </div>;
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
    return <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
      <p className="text-gray-500 text-center">Need at least 2 valid data points to create the curve</p>
    </div>;
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
          },
          callbacks: {
            title: function(context) {
              const value = powerData[context[0].dataIndex];
              return mockData.sport === 'bike' ? `Power: ${value}W` : `Pace: ${convertPowerToPace(value, mockData.sport)}`;
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
        <h2 className="text-2xl font-bold">
          Lactate Curve <span className="text-xl text-gray-600 ml-4">({formatDate(mockData.date)})</span>
        </h2>
        <p className="text-lg text-gray-500">
          Base Lactate: <span className="text-blue-500 font-medium">{mockData.baseLactate} mmol/L</span>
        </p>
        <div className="relative" style={{ width: '100%', height: '400px' }}>
          <Line data={data} options={options} />
          {tooltip && <CustomTooltip tooltip={tooltip} datasets={datasets} />}
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error calculating lactate curve:', error);
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <p className="text-red-500 text-center">Error calculating lactate curve</p>
      </div>
    );
  }
};

export default LactateCurve;
