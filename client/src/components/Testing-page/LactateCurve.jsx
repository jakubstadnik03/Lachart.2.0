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

  const isNearRightEdge = tooltip.caretX > window.innerWidth * 0.7;

  return (
    <div
      className="absolute bg-white shadow-md p-2 rounded-md text-xs text-gray-800 border border-gray-200"
      style={{
        left: tooltip.caretX,
        top: tooltip.caretY,
        minWidth: "110px",
        transform: isNearRightEdge ? "translate(-100%, -120%)" : "translate(-50%, -120%)",
        position: "absolute",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <div className="font-semibold text-gray-900">{interval}. {label}</div>
      <div className="text-blue-500">Lactate: {mmol} mmol/L</div>
      <div className="text-red-500">Heart Rate: {bpm} Bpm</div>
      <div
        className="absolute w-0 h-0 border-l-4 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-200"
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
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltip, setTooltip] = useState(null);

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
    const labels = validResults.map((result) =>
      mockData.sport === "run" ? convertPowerToPace(result.power, mockData.sport) : `${result.power}W`
    );

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
        pointBackgroundColor: "#3F8CFE",
      },
      {
        label: "Heart Rate (BPM)",
        data: heartRateData,
        borderColor: "#E7515A",
        backgroundColor: "#E7515A",
        pointStyle: "circle",
        pointRadius: 5,
        pointBackgroundColor: "#E7515A",
        yAxisID: "y1",
      },
    ];

    const data = { labels, datasets };

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
              setTooltip(context.tooltip);
            }
          },
          callbacks: {
            title: function(context) {
              const value = context[0].parsed.x;
              return `${mockData.sport === 'bike' ? 'Power' : 'Pace'}: ${convertPowerToPace(value, mockData.sport)}`;
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
            callback: function(value) {
              return convertPowerToPace(value, mockData.sport);
            }
          }
        },
      },
    };

    return (
      <div className="relative w-full  p-6 bg-white rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold">
          Lactate Curve <span className="text-xl text-gray-600 ml-4">({mockData.date})</span>
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
