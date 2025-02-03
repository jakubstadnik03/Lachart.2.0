import React, { useState } from "react";
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const LactateCurve = () => {
  const [showTooltip, setShowTooltip] = useState(false);

  const mockData = {
    _id: "test1",
    athleteId: "user2",
    coachId: "user1",
    sport: "cycling",
    date: "2024-11-22",
    description: "4x10min LT2",
    baseLactate: 1.2,
    weight: 75,
    results: [
      { power: 100, heartRate: 110, lactate: 1.0, glucose: 4.5, RPE: 5 },
      { power: 130, heartRate: 130, lactate: 1.5, glucose: 5.0, RPE: 6 },
      { power: 220, heartRate: 135, lactate: 2.5, glucose: 5.5, RPE: 8 },
      { power: 260, heartRate: 149, lactate: 3.5, glucose: 5.5, RPE: 10 },
      { power: 280, heartRate: 156, lactate: 4.0, glucose: 5.5, RPE: 8 },
      { power: 320, heartRate: 180, lactate: 10, glucose: 5.5, RPE: 8 },
    ],
  };

  // Získání dat z mockData
  const labels = mockData.results.map((result) => `${result.power}W`);
  const lactateData = mockData.results.map((result) => result.lactate);
  const heartRateData = mockData.results.map((result) => result.heartRate);

  // Data pro graf
  const data = {
    labels,
    datasets: [
      {
        label: "Lactate (mmol/L)",
        data: lactateData,
        borderColor: "#3F8CFE",
        backgroundColor: "#3F8CFE",
        tension: 0.4,
        pointStyle: "circle",
        pointRadius: 6,
        pointBackgroundColor: "#3F8CFE",
      },
      {
        label: "Heart Rate (BPM)",
        data: heartRateData,
        borderColor: "#E7515A",
        backgroundColor: "#E7515A",
        tension: 0.4,
        pointStyle: "circle",
        pointRadius: 6,
        pointBackgroundColor: "#E7515A",
        yAxisID: "y1", // Vlastní osa pro HeartRate
      },
    ],
  };

  // Možnosti zobrazení grafu
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
        },
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        type: "linear",
        position: "left",
        title: {
          display: true,
          text: "Lactate (mmol/L)",
        },
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
          borderDash: [5, 5], // Čárkovaná mřížka
        },
      },
      y1: {
        type: "linear",
        position: "right",
        title: {
          display: true,
          text: "Heart Rate (BPM)",
        },
        grid: {
          drawOnChartArea: false,
          color: "rgba(0, 0, 0, 0.1)",
          borderDash: [5, 5], // Čárkovaná mřížka
        },
      },
      x: {
        title: {
          display: true,
          text: "Power (W)",
        },
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
          borderDash: [5, 5], // Čárkovaná mřížka
        },
      },
    },
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow relative">
      {/* Nadpis */}
      <div className="mb-6 text-left">
        <h2 className="text-2xl font-bold">
          Lactate Curve
          <span className="text-xl text-gray-600 ml-4">({mockData.date})</span>
        </h2>
        <p className="text-lg text-gray-500">
          Base Lactate: <span className="text-blue-500 font-medium">{mockData.baseLactate} mmol/L</span>
        </p>
      </div>

      {/* Ikona otazníku */}
      <div className="absolute top-4 right-4">
        <button
          className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full shadow hover:bg-gray-300"
          title="Show description"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip(!showTooltip)}
        >
          <span className="text-gray-600 text-sm font-bold">?</span>
        </button>
        {showTooltip && (
          <div className="absolute top-8 right-0 w-64 bg-white p-4 rounded-lg shadow-lg border border-gray-200">
            <p className="text-sm text-gray-700">
              This graph shows the lactate curve and heart rate trends based on power output. Lactate levels (mmol/L) and heart rate (BPM) are displayed against power output (W).
            </p>
          </div>
        )}
      </div>

      {/* Graf */}
      <Line data={data} options={options} />
    </div>
  );
};

export default LactateCurve;
