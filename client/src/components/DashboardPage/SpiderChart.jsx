"use client";
import React, { useState } from "react";
import { Radar } from "react-chartjs-2";
import { DropdownMenu } from "../DropDownMenu";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

// Registrace modulů pro Chart.js
ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function SpiderChart({ trainings = [] }) {
  const [selectedSport, setSelectedSport] = useState("bike");

  if (!Array.isArray(trainings) || trainings.length === 0) {
    return <div className="text-gray-500 text-center">No data available</div>;
  }

  // Filtrování podle sportu
  const filteredTrainings = trainings.filter((t) => t.sport === selectedSport);

  const labels = filteredTrainings.map((t) => t.title || "Unknown");

  const dataValues = filteredTrainings.map((t) => {
    if (!t.results || t.results.length === 0) return 0;
    const totalPower = t.results.reduce((sum, res) => sum + res.power, 0);
    return Math.round(totalPower / t.results.length); // Průměrný výkon
  });

  const data = {
    labels,
    datasets: [
      {
        label: "Power (W)",
        data: dataValues,
        backgroundColor: "rgba(75,192,192,0.2)",
        borderColor: "rgba(75,192,192,1)",
        borderWidth: 2,
        pointBackgroundColor: "rgba(75,192,192,1)",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        suggestedMin: 0,
        ticks: {
          font: { size: 14 }, // Zvětšení čísel na osách
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          font: { size: 16 }, // Zvětšení popisků legendy
        },
      },
    },
  };
  const trainingOptions = ["bike", "swim", "run"]

  return (
    <div className="w-full h-[500px] flex flex-col items-center justify-center bg-white p-8 rounded-3xl shadow-md relative">
      {/* Titulek */}
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">Training Power Chart</h2>

      {/* Dropdown pro výběr sportu */}
      <div className="absolute top-5 right-5">
       
      <DropdownMenu selectedTraining={selectedSport} setSelectedTraining={setSelectedSport} trainingOptions={trainingOptions}/>
      </div>


      {/* Větší graf */}
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
