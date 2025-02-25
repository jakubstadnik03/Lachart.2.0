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
import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";
// Registrace modulů pro Chart.js
ChartJS.register(RadialLinearScale, PointElement, LineElement, Tooltip, Legend);

export default function SpiderChart({ trainings = [], maxMonths = 4}) {
  const [selectedSport, setSelectedSport] = useState("bike");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  if (!Array.isArray(trainings) || trainings.length === 0) {
    return <div className="text-gray-500 text-center">No data available</div>;
  }

  // Filtrování podle sportu
  const filteredTrainings = trainings.filter(
    (t) => t.sport === selectedSport && new Date(t.date).getFullYear() === selectedYear
  );  
  // Získání unikátních měsíců ze vstupních dat a omezení jejich počtu
  const uniqueMonths = [...new Set(filteredTrainings.map(t => new Date(t.date).toLocaleString('default', { month: 'long' })))];
  const months = uniqueMonths.slice(0, maxMonths);
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
      borderColor: monthColors[index % monthColors.length],
      borderWidth: 2,
      pointBackgroundColor: monthColors[index % monthColors.length],
      fill: false, // Zakázání vyplňování plochy
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: false,
        suggestedMin: 200,
        ticks: {
          font: { size: 14 },
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom', // Přesunutí legendy dolů
        labels: {
          font: { size: 12 }, // Zmenšení fontu legendy
          usePointStyle: true, // Použití koleček místo čtverečků
        },
      },
    },
  };

  const trainingOptions = ["bike", "swim", "run"];

  return (
    <div className="w-full h-[500px] flex flex-col items-center  bg-white p-5 rounded-3xl shadow-md relative h-full">
     <div className="flex items-center w-full justify-between">
      <h2 className="text-lg font-semibold">Training Power Chart</h2>
      <div className="flex items-center ">
          <DropdownMenu selectedTraining={selectedSport} setSelectedTraining={setSelectedSport} trainingOptions={trainingOptions}/>
    
          <Menu as="div" className="relative inline-block text-left">
              <Menu.Button className="p-2 rounded-full hover:bg-gray-200">
                <EllipsisVerticalIcon className="h-6 w-6 text-gray-600" />
              </Menu.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-48 bg-white border border-gray-300 rounded-md shadow-lg focus:outline-none">
                  <div className="p-2">
                    <label className="block text-sm font-medium text-gray-700">Select Year</label>
                    <select
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring focus:ring-indigo-200"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                    >
                      {[2022, 2023, 2024, 2025].map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>                
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
      </div>
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
