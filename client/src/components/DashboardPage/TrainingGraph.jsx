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
  const power = tooltip.dataPoints[0]?.raw || "N/A";
  const heartRate = tooltip.dataPoints[1]?.raw || "N/A";
  const lactate = datasets[index]?.lactate || "N/A";

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
      }}
    >
      <div className="font-bold text-gray-900 mb-1">Interval {label}</div>
      <div className="flex items-center gap-2 text-blue-600">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        Power: {power} W
      </div>
      <div className="flex items-center gap-2 text-red-600">
        <span className="w-2 h-2 rounded-full bg-red-500"></span>
        Heart Rate: {heartRate} Bpm
      </div>
      <div className="flex items-center gap-2 text-purple-600">
        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
        Lactate: {lactate} mmol/L
      </div>
    </div>
  );
};

const TrainingGraph = () => {
  const [trainings, setTrainings] = useState([]);
  const [titles, setTitles] = useState([]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [ranges, setRanges] = useState({ power: { min: 0, max: 0 }, heartRate: { min: 0, max: 0 } });

  useEffect(() => {
    const loadTrainings = async () => {
      try {
        setLoading(true);
        const data = await fetchMockTrainings();
        if (data && data.length > 0) {
          setTrainings(data);
          // Získání unikátních titulů
          const uniqueTitles = [...new Set(data.map(t => t.title))];
          setTitles(uniqueTitles);
          setSelectedTitle(uniqueTitles[0]);
          // Nastavení prvního tréninku s vybraným titulem
          const firstTrainingWithTitle = data.find(t => t.title === uniqueTitles[0]);
          if (firstTrainingWithTitle) {
            setSelectedTraining(firstTrainingWithTitle.trainingId);
          }
        } else {
          setError("No trainings found");
        }
      } catch (err) {
        console.error("Error loading trainings:", err);
        setError("Failed to load trainings");
      } finally {
        setLoading(false);
      }
    };
    loadTrainings();
  }, []);

  // Když se změní vybraný titul, aktualizujeme vybraný trénink
  useEffect(() => {
    if (selectedTitle && trainings.length > 0) {
      const trainingsWithTitle = trainings.filter(t => t.title === selectedTitle);
      if (trainingsWithTitle.length > 0) {
        setSelectedTraining(trainingsWithTitle[0].trainingId);
      }
    }
  }, [selectedTitle, trainings]);

  // Přepočítání rozsahů při změně vybraného tréninku
  useEffect(() => {
    if (selectedTraining && trainings.length > 0) {
      const selectedData = trainings.find(t => t.trainingId === selectedTraining);
      if (selectedData && selectedData.results) {
        const powers = selectedData.results.map(r => r.power);
        const heartRates = selectedData.results.map(r => r.heartRate);

        setRanges({
          power: {
            min: Math.floor(Math.min(...powers) / 20) * 20,
            max: Math.ceil(Math.max(...powers) / 20) * 20
          },
          heartRate: {
            min: Math.floor(Math.min(...heartRates) / 5) * 5,
            max: Math.ceil(Math.max(...heartRates) / 5) * 5
          }
        });
      }
    }
  }, [selectedTraining, trainings]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!trainings.length) return <div>No trainings available</div>;

  const selectedTrainingData = trainings.find(t => t.trainingId === selectedTraining);
  const trainingsWithSelectedTitle = trainings.filter(t => t.title === selectedTitle);
  
  if (!selectedTrainingData || !selectedTrainingData.results) {
    return <div>No data available for selected training</div>;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "center",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 10,
          padding: 20,
          font: { size: 14 },
        }
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
        position: 'left',
        title: { display: false },
        min: ranges.power.min,
        max: ranges.power.max,
        ticks: {
          stepSize: 20,
          callback: (value) => `${value}W`,
          display: true,
          autoSkip: false,
        },
        grid: {
          color: 'rgba(0,0,0,0.1)',
          drawTicks: false,
        },
        border: {
          display: false,
        }
      },
      y1: {
        position: 'right',
        title: { display: false },
        min: ranges.heartRate.min,
        max: ranges.heartRate.max,
        ticks: {
          stepSize: 5,
          callback: (value) => `${value}Bpm`,
          display: true,
          autoSkip: false,
        },
        grid: {
          display: false,
        },
        border: {
          display: false,
        }
      },
      x: {
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
        ticks: {
          font: { size: 14 },
        }
      }
    },
  };

  return (
    <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-lg border border-blue-100">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4 items-center">
          <select 
            className="border rounded-lg px-3 py-1 text-gray-600"
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
          >
            {titles.map((title, index) => (
              <option key={`title-${index}-${title}`} value={title}>
                {title}
              </option>
            ))}
          </select>
          <select 
            className="border rounded-lg px-3 py-1 text-gray-600"
            value={selectedTraining}
            onChange={(e) => setSelectedTraining(e.target.value)}
          >
            {trainingsWithSelectedTitle.map(training => (
              <option key={`training-${training.trainingId}-${training.date}`} value={training.trainingId}>
                {training.date}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="relative" style={{ height: '400px' }}>
        <Line 
          data={{
            labels: selectedTrainingData.results.map(r => r.interval.toString()),
            datasets: [
              {
                label: "Power",
                data: selectedTrainingData.results.map(r => r.power),
                borderColor: "#3B82F6",
                backgroundColor: "#3B82F6",
                pointStyle: "circle",
                pointRadius: 6,
                borderWidth: 2,
                tension: 0.4,
              },
              {
                label: "Heartrate",
                data: selectedTrainingData.results.map(r => r.heartRate),
                borderColor: "#EF4444",
                backgroundColor: "#EF4444",
                pointStyle: "circle",
                pointRadius: 6,
                borderWidth: 2,
                yAxisID: "y1",
                tension: 0.4,
              }
            ]
          }} 
          options={options} 
        />
        {tooltip && <CustomTooltip tooltip={tooltip} datasets={selectedTrainingData.results} />}
      </div>
    </div>
  );
};

export default TrainingGraph;
