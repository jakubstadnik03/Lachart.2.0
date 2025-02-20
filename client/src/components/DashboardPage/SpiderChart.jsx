"use client";
import React, { useState } from "react";
import { Radar } from "react-chartjs-2";
import { DropdownMenu } from "../DropDownMenu";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

// Registrace modulů pro Chart.js
ChartJS.register(RadialLinearScale, PointElement, LineElement, Tooltip, Legend);

export default function SpiderChart({ trainings = [] }) {
  const [selectedSport, setSelectedSport] = useState("bike");

  if (!Array.isArray(trainings) || trainings.length === 0) {
    return <div className="text-gray-500 text-center">No data available</div>;
  }

  // Filtrování podle sportu
  const filteredTrainings = trainings.filter((t) => t.sport === selectedSport);
  
  // Získání unikátních měsíců ze vstupních dat
  const months = [...new Set(filteredTrainings.map(t => new Date(t.date).toLocaleString('default', { month: 'long' })))];
  const monthColors = ["#00AC07", "#7755FF", "#AC0000", "#3F8CFE"];

  // Strukturování dat podle měsíců
  const transformedData = filteredTrainings.reduce((acc, training) => {
    const month = new Date(training.date).toLocaleString('default', { month: 'long' });
    if (!acc[month]) acc[month] = { label: month };
    
    acc[month][training.title] = training.results.reduce((sum, r) => sum + r.power, 0) / training.results.length;
    return acc;
  }, {});

  const data = {
    labels: [...new Set(filteredTrainings.map((t) => t.title))],
    datasets: months.map((month, index) => ({
      label: month,
      data: Object.values(transformedData[month] || {}).slice(1),
      borderColor: monthColors[index],
      borderWidth: 2,
      pointBackgroundColor: monthColors[index],
      fill: false, // Zakázání vyplňování plochy
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: false,
        suggestedMin: 300,
        ticks: {
          font: { size: 14 },
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          font: { size: 16 },
          usePointStyle: true, // Použití koleček místo čtverečků
        },
      },
    },
  };

  const trainingOptions = ["bike", "swim", "run"];

  return (
    <div className="w-full h-[500px] flex flex-col items-center justify-center bg-white p-8 rounded-3xl shadow-md relative">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">Training Power Chart</h2>
      <div className="absolute top-5 right-5">
        <DropdownMenu selectedTraining={selectedSport} setSelectedTraining={setSelectedSport} trainingOptions={trainingOptions}/>
      </div>
      {filteredTrainings.length > 0 ? (
        <div className="w-[600px] h-[400px]">
          <Radar data={data} options={options} />
        </div>
      ) : (
        <div className="text-gray-500 mt-10 text-lg">No data available for {selectedSport}</div>
      )}
    </div>
  );
}
