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
  Legend
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
        <div className="font-semibold text-gray-900">{label}</div>
        <div className="text-blue-500">Power: {w} W</div>
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
  
const TrainingGraph = ({ trainingId }) => {
  const [training, setTraining] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    fetchMockTrainings().then((data) => {
      const training = data.find((t) => t.trainingId === trainingId);
      setTraining(training);
    });
  }, [trainingId]);

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
        border: { dash: [6, 6] },

        grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
            drawTicks: true,
        },
      },
      y1: {
        title: { display: true, text: "Heart Rate (BPM)" },
        min: Math.min(...heartRateData) - 10,
        max: Math.max(...heartRateData) + 10,
        position: "right",
        grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
            drawTicks: true,
          drawOnChartArea: false,
        },
      },
      x: {
        title: { display: true, text: "Interval" },
        grid: {
            color: "rgba(0, 0, 0, 0)",
            drawTicks: true,
        },
      },
    },
  };

  return (
        <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-md ">
       <div className="flex justify-between items-center">
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
