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

export default function SpiderChart({ trainings = [], userTrainings = [] }) {
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTrainings, setSelectedTrainings] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Funkce pro formátování času do formátu mm:ss
  const formatPace = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}/km`;
  };

  // Funkce pro formátování hodnoty podle sportu
  const formatValue = (value, sport) => {
    const roundedValue = Math.round(value);
    if (sport === 'bike') {
      return `${roundedValue}W`;
    } else {
      return formatPace(roundedValue);
    }
  };

  if (!Array.isArray(trainings) || trainings.length === 0) {
    return <div className="text-gray-500 text-center">No data available</div>;
  }

  // Připravíme options pro dropdown sportu
  const sportOptions = [
    { value: 'bike', label: 'Bike' },
    { value: 'swim', label: 'Swim' },
    { value: 'run', label: 'Run' }
  ];

  // Filtrování podle sportu a roku
  const filteredTrainings = trainings.filter(
    (t) => t.sport === selectedSport && 
    new Date(t.date).getFullYear() === selectedYear &&
    (selectedTrainings.length === 0 || selectedTrainings.includes(t.title))
  );

  // Získání unikátních názvů tréninků pro daný sport a rok
  const trainingOptions = [...new Set(trainings
    .filter(t => t.sport === selectedSport && new Date(t.date).getFullYear() === selectedYear)
    .map(t => t.title)
  )].map(title => ({
    value: title,
    label: title
  }));

  // Získání unikátních měsíců ze vstupních dat a omezení jejich počtu
  const uniqueMonths = [...new Set(filteredTrainings.map(t => new Date(t.date).toLocaleString('default', { month: 'long' })))];
  const months = uniqueMonths.slice(0, 4);
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
      fill: false,
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
          callback: (value) => formatValue(value, selectedSport),
        },
        pointLabels: {
          font: {
            size: 12,
          },
          padding: 10,
          maxWidth: 120,
          callback: function(value) {
            if (value.length > 15) {
              return value.substring(0, 15) + '...';
            }
            return value;
          }
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 12 },
          usePointStyle: true,
          padding: 10,
          boxWidth: 12,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#111827',
        titleFont: { weight: 'bold', size: 14 },
        bodyColor: '#111827',
        bodyFont: { size: 13 },
        borderColor: '#F3F4F6',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        callbacks: {
          label: (context) => {
            const value = formatValue(context.raw, selectedSport);
            return `${context.dataset.label}: ${value}`;
          },
          labelPointStyle: (context) => {
            return {
              pointStyle: 'circle',
              rotation: 0
            };
          }
        }
      }
    },
  };

  return (
    <div className="w-full h-full flex flex-col items-center bg-white p-2 sm:p-4 rounded-3xl shadow-md relative">
      <div className="flex flex-col sm:flex-row items-center w-full justify-between gap-1 sm:gap-0 mb-2">
        <h2 className="text-base sm:text-lg font-semibold">Training Power Chart</h2>
        <div className="flex items-center gap-2">
          {/* Dropdown pro výběr sportu */}
          <DropdownMenu
            selectedValue={selectedSport}
            options={sportOptions}
            onChange={(value) => {
              setSelectedSport(value);
              setSelectedTrainings([]);
            }}
            displayKey="label"
            valueKey="value"
          />
          
          {/* Menu pro výběr roku a tréninků */}
          <Menu as="div" className="relative inline-block text-left">
            <Menu.Button className="p-2 rounded-full hover:bg-gray-200">
              <EllipsisVerticalIcon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
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
              <Menu.Items className="absolute right-0 mt-2 w-56 sm:w-64 bg-white border border-gray-300 rounded-md shadow-lg focus:outline-none">
                <div className="p-2 space-y-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700">Select Year</label>
                    <select
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring focus:ring-indigo-200 text-xs sm:text-sm"
                      value={selectedYear}
                      onChange={(e) => {
                        setSelectedYear(Number(e.target.value));
                        setSelectedTrainings([]);
                      }}
                    >
                      {[2022, 2023, 2024, 2025].map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700">Select Trainings</label>
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                    <div className={`mt-1 space-y-1 ${isExpanded ? 'max-h-60 overflow-y-auto' : 'max-h-0 overflow-hidden'} transition-all duration-200 shadow-sm focus:ring focus:ring-indigo-200 text-xs sm:text-sm`}>
                      {trainingOptions.map((training) => (
                        <div key={training.value} className="flex items-center">
                          <input
                            type="checkbox"
                            id={training.value}
                            checked={selectedTrainings.includes(training.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTrainings([...selectedTrainings, training.value]);
                              } else {
                                setSelectedTrainings(selectedTrainings.filter(t => t !== training.value));
                              }
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label
                            htmlFor={training.value}
                            className="ml-2 text-xs sm:text-sm text-gray-700 flex items-center"
                          >
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2"></span>
                            {training.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
      {filteredTrainings.length > 0 ? (
        <div className="w-full h-[400px] ">
          <Radar data={data} options={options} />
        </div>
      ) : (
        <div className="text-gray-500 mt-10 text-sm sm:text-lg">No data available for {selectedSport}</div>
      )}
    </div>
  );
}
