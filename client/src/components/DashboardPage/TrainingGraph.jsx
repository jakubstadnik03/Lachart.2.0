"use client";
import React, { useState, useEffect } from "react";
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
import { fetchMockTrainings } from "../../mock/mockApi";
import { DropdownMenu } from "../DropDownMenu";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const CustomTooltip = ({ tooltip, datasets }) => {
  if (!tooltip?.dataPoints) return null;

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;

  const label = tooltip.dataPoints[0]?.label || "N/A";
  const bpm = datasets[1]?.data?.[index] ?? "N/A";
  const w = datasets[0]?.data?.[index] ?? "N/A";

  return (
    <div
      className="absolute bg-white shadow-md p-2 rounded-md text-xs text-gray-800 border border-gray-200"
      style={{
        left: tooltip.caretX,
        top: tooltip.caretY,
        minWidth: "110px",
        transform: "translate(-50%, -120%)",
        position: "absolute",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <div className="font-semibold text-gray-900">{label}</div>
      <div className="text-blue-500">Power: {w} W</div>
      <div className="text-red-500">Heart Rate: {bpm} Bpm</div>
    </div>
  );
};

const TrainingGraph = () => {
  const [trainings, setTrainings] = useState([]);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    fetchMockTrainings().then((data) => {
      setTrainings(data);
      if (data.length > 0) {
        setSelectedTraining(data[0].trainingId);
      }
    });
  }, []);

  const training = trainings.find((t) => t.trainingId === selectedTraining);

  if (!training || !training.results) {
    return <div className="w-full max-w-2xl p-6 bg-white rounded-2xl shadow-lg text-center">No data available.</div>;
  }

  const filteredResults = training.results.filter(result => result.power && result.heartRate);

  if (filteredResults.length === 0) {
    return <div className="w-full max-w-2xl p-6 bg-white rounded-2xl shadow-lg text-center">Enter data to generate a graph.</div>;
  }

  const labels = filteredResults.map(result => `Interval ${result.interval}`);
  const powerData = filteredResults.map(result => result.power);
  const heartRateData = filteredResults.map(result => result.heartRate);

  const datasets = [
    {
      label: "Power (W)",
      data: powerData,
      borderColor: "#3F8CFE",
      pointStyle: "circle",
      pointRadius: 5,
      pointBackgroundColor: "#3F8CFE",
      tension: 0.4,
    },
    {
      label: "Heart Rate (BPM)",
      data: heartRateData,
      borderColor: "#E7515A",
      pointStyle: "circle",
      pointRadius: 5,
      pointBackgroundColor: "#E7515A",
      yAxisID: "y1",
      tension: 0.4,
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
      },
    },
    scales: {
      y: {
        title: { display: true, text: "Power (W)" },
        min: Math.min(...powerData) - 20,
        max: Math.max(...powerData) + 20,
      },
      y1: {
        title: { display: true, text: "Heart Rate (BPM)" },
        min: Math.min(...heartRateData) - 10,
        max: Math.max(...heartRateData) + 10,
        position: "right",
      },
    },
  };

  return (
    <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-md ">
      <div className="flex justify-between items-center">
        <DropdownMenu 
          selectedTraining={selectedTraining} 
          setSelectedTraining={setSelectedTraining} 
          trainingOptions={trainings.map(t => t.trainingId)} 
        />
        <h2 className="text-2xl font-bold">
          {training.title} <span className="text-xl text-gray-600 ml-4">({training.date})</span>
        </h2>
      </div>
      <p className="text-lg text-gray-500">{training.scenario}</p>
      <div className="relative" style={{ width: '100%', height: '400px' }}>
        <Line data={data} options={options} />
        {tooltip && <CustomTooltip tooltip={tooltip} datasets={datasets} />}
      </div>
    </div>
  );
};

export default TrainingGraph;
