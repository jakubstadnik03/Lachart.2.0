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
import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";
// Registrace modulů pro Chart.js
ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function SpiderChart({ trainings = [], userTrainings = [], selectedSport, setSelectedSport }) {
  // Get available sports from trainings (normalize to lowercase)
  const availableSports = [...new Set(trainings.map(t => (t.sport || '').toLowerCase()))].filter(Boolean);
  
  // Initialize selectedSport with localStorage or default to 'all'
  const [internalSelectedSport, setInternalSelectedSport] = useState(() => {
    if (selectedSport) return selectedSport;
    const saved = localStorage.getItem('spiderChart_selectedSport');
    if (saved && (saved === 'all' || availableSports.includes(saved))) {
      return saved;
    }
    return 'all';
  });
  
  // Use external selectedSport if provided, otherwise use internal
  const currentSelectedSport = selectedSport || internalSelectedSport;
  const setCurrentSelectedSport = (value) => {
    if (setSelectedSport) {
      setSelectedSport(value);
    } else {
      setInternalSelectedSport(value);
    }
    localStorage.setItem('spiderChart_selectedSport', value);
  };
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTrainings, setSelectedTrainings] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMonthsExpanded, setIsMonthsExpanded] = useState(false);

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
    } else if (sport === 'swim') {
      return formatPace(roundedValue);
    } else {
      return formatPace(roundedValue);
    }
  };

  // Parse pace from mm:ss format to seconds
  const parsePaceToSeconds = (paceValue) => {
    if (!paceValue) return null;
    if (typeof paceValue === 'number') return paceValue;
    if (typeof paceValue === 'string') {
      const parts = paceValue.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        if (!isNaN(minutes) && !isNaN(seconds)) {
          return minutes * 60 + seconds;
        }
      }
      const num = Number(paceValue);
      if (!isNaN(num)) return num;
    }
    return null;
  };

  // Funkce pro výpočet průměrné hodnoty tréninku
  const calculateTrainingValue = (training, sport) => {
    if (!training.results || training.results.length === 0) return 0;
    
    // Pro kolo bereme průměrný výkon
    if (sport === 'bike' || sport === 'Bike') {
      const powers = training.results.map(r => Number(r.power)).filter(p => !isNaN(p) && p > 0);
      if (powers.length === 0) return 0;
      const value = powers.reduce((sum, p) => sum + p, 0) / powers.length;
      return value;
    } else {
      // Pro běh a plavání: power obsahuje pace v mm:ss formátu
      const paces = training.results
        .map(r => parsePaceToSeconds(r.power))
        .filter(p => p !== null && p > 0);
      if (paces.length === 0) return 0;
      const value = paces.reduce((sum, p) => sum + p, 0) / paces.length;
      return value;
    }
  };

  if (!Array.isArray(trainings) || trainings.length === 0) {
    return <div className="text-gray-500 text-center">No data available</div>;
  }

  // Připravíme options pro dropdown sportu - pouze sporty, které mají tréninky
  const sportOptions = [
    { value: 'all', label: 'All Sports' },
    ...availableSports.map(sport => {
      const value = (sport || '').toLowerCase();
      const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
      return ({
        value,
        label
      });
    })
  ];

  // Filtrování podle sportu a roku
  const filteredTrainings = trainings.filter(
    (t) => (currentSelectedSport === 'all' || (t.sport || '').toLowerCase() === currentSelectedSport) && 
    new Date(t.date).getFullYear() === selectedYear &&
    (selectedTrainings.length === 0 || selectedTrainings.includes(t.title))
  );

  // Získání unikátních názvů tréninků pro daný sport a rok
  const trainingOptions = [...new Set(trainings
    .filter(t => (currentSelectedSport === 'all' || (t.sport || '').toLowerCase() === currentSelectedSport) && new Date(t.date).getFullYear() === selectedYear)
    .map(t => t.title)
  )].map(title => ({
    value: title,
    label: title
  }));

  // Získání unikátních měsíců ze vstupních dat seřazených chronologicky
  const monthData = filteredTrainings.map(t => ({
    month: new Date(t.date).toLocaleString('default', { month: 'long' }),
    date: new Date(t.date),
    year: new Date(t.date).getFullYear()
  }));
  
  // Seřadit měsíce chronologicky (nejnovější první)
  const sortedMonths = [...new Map(
    monthData
      .sort((a, b) => b.date - a.date) // Seřadit podle data (nejnovější první)
      .map(item => [item.month + '-' + item.year, item])
  ).values()].map(item => item.month);
  
  // Odstranit duplicity a zachovat pořadí
  const uniqueMonths = [...new Set(sortedMonths)];
  const months = uniqueMonths; // Zobrazit všechny měsíce s daty
  
  // Rozšířená paleta barev pro více měsíců
  const monthColors = [
    "#00AC07", // Zelená
    "#7755FF", // Fialová
    "#AC0000", // Červená
    "#3F8CFE", // Modrá
    "#FF9500", // Oranžová
    "#00D4AA", // Tyrkysová
    "#FF6B9D", // Růžová
    "#8B5A2B", // Hnědá
    "#9B59B6", // Fialová 2
    "#E74C3C", // Červená 2
    "#3498DB", // Modrá 2
    "#1ABC9C", // Zelená 2
    "#F39C12", // Oranžová 2
    "#E67E22", // Oranžová 3
    "#16A085", // Zelená 3
    "#27AE60", // Zelená 4
  ];

  // Strukturování dat podle měsíců a tréninků
  const transformedData = {};
  
  // Inicializace struktury pro každý měsíc
  months.forEach(month => {
    transformedData[month] = {};
    // Inicializace hodnot pro každý trénink v měsíci
    trainingOptions.forEach(training => {
      transformedData[month][training.value] = null;
    });
  });

  // console.log('Filtered trainings:', filteredTrainings);
  // console.log('Training options:', trainingOptions);

  // Naplnění dat
  filteredTrainings.forEach(training => {
    const month = new Date(training.date).toLocaleString('default', { month: 'long' });
    if (transformedData[month]) {
      // Use training's sport for calculation when 'all' is selected
      const sportForCalculation = currentSelectedSport === 'all' ? training.sport : currentSelectedSport;
      const value = calculateTrainingValue(training, sportForCalculation);
      if (value > 0) {
        // Pokud už existuje hodnota pro tento trénink v měsíci, vezmeme průměr
        if (transformedData[month][training.title] !== null) {
          transformedData[month][training.title] = 
            (transformedData[month][training.title] + value) / 2;
        } else {
          transformedData[month][training.title] = value;
        }
      }
    }
  });

  // Filter out months with no data (all values are null or 0) a seřadit podle původního pořadí
  const allMonthsWithData = months.filter(month => 
    transformedData[month] && 
    Object.values(transformedData[month]).some(value => value !== null && value > 0)
  );
  
  // Pokud nejsou vybrané žádné měsíce, zobrazit všechny
  // Pokud jsou vybrané měsíce, zobrazit pouze vybrané
  const monthsWithData = selectedMonths.length > 0 
    ? allMonthsWithData.filter(month => selectedMonths.includes(month))
    : allMonthsWithData;

  // Calculate minimum value for the scale
  const getMinScaleValue = () => {
    if (currentSelectedSport !== 'bike' && currentSelectedSport !== 'all') return 0;
    
    // Get all non-null values from the data
    const allValues = Object.values(transformedData)
      .flatMap(month => Object.values(month))
      .filter(value => value !== null && value > 0);
    
    if (allValues.length === 0) return 0;
    
    const minValue = Math.min(...allValues);
    // Subtract 100W and round down to nearest hundred
    return Math.floor((minValue - 100) / 100) * 100;
  };

  const data = {
    labels: trainingOptions.map(t => t.label),
    datasets: monthsWithData.map((month, index) => ({
      label: month,
      data: trainingOptions.map(training => transformedData[month][training.value] || null),
      borderColor: monthColors[index % monthColors.length],
      backgroundColor: monthColors[index % monthColors.length] + '20',
      borderWidth: 2,
      pointBackgroundColor: monthColors[index % monthColors.length],
      fill: true,
      tension: 0,
      spanGaps: true,
      showLine: true,
      pointRadius: 4,
      pointHoverRadius: 8,
      pointHitRadius: 8,
      pointBorderWidth: 2,
      pointStyle: 'circle',
      borderJoinStyle: 'miter',
      borderDash: [],
    })),
  };

  // console.log('Chart data:', data);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    elements: {
      line: {
        borderWidth: 2,
        tension: 0,
        borderJoinStyle: 'miter',
      }
    },
    scales: {
      r: {
        beginAtZero: false,
        suggestedMin: getMinScaleValue(),
        ticks: {
          font: { size: 14 },
          callback: (value) => {
            // For 'all' sport, determine format based on available data
            const sportForFormat = currentSelectedSport === 'all' ? 'bike' : currentSelectedSport;
            return formatValue(value, sportForFormat);
          },
        },
        pointLabels: {
          font: {
            size: 11,
          },
          padding: 6,
          maxWidth: 100,
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
          font: { size: 11 },
          usePointStyle: true,
          padding: 2,
          boxWidth: 10,
        },
        padding: 2,
        margin: 0,
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
            const value = context.raw;
            if (value === null || value === 0) return `${context.dataset.label}: No data`;
            // For 'all' sport, determine format based on available data
            const sportForFormat = currentSelectedSport === 'all' ? 'bike' : currentSelectedSport;
            return `${context.dataset.label}: ${formatValue(value, sportForFormat)}`;
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
    <div className="w-full h-full flex flex-col items-center bg-white p-1 sm:p-2 rounded-3xl shadow-md relative">
      <div className="flex flex-col sm:flex-row items-center w-full justify-between gap-1 sm:gap-0 mb-2">
        <h2 className="text-base sm:text-lg font-semibold">Training Power Chart</h2>
        <div className="flex items-center gap-2">
          {/* Dropdown pro výběr sportu */}
          <DropdownMenu
            selectedValue={currentSelectedSport}
            options={sportOptions}
            onChange={(value) => {
              setCurrentSelectedSport(value);
              setSelectedTrainings([]);
              setSelectedMonths([]);
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
                    <div className="relative mt-1">
                      <select
                        className="w-full border border-gray-300 rounded-md px-3 py-1 text-xs sm:text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8 shadow-sm"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                        value={selectedYear}
                        onChange={(e) => {
                          setSelectedYear(Number(e.target.value));
                          setSelectedTrainings([]);
                          setSelectedMonths([]);
                        }}
                      >
                        {[2022, 2023, 2024, 2025].map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700">Select Months</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (selectedMonths.length === allMonthsWithData.length) {
                              setSelectedMonths([]);
                            } else {
                              setSelectedMonths([...allMonthsWithData]);
                            }
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          {selectedMonths.length === allMonthsWithData.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                          onClick={() => setIsMonthsExpanded(!isMonthsExpanded)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          {isMonthsExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                    </div>
                    <div className={`mt-1 space-y-1 ${isMonthsExpanded ? 'max-h-60 overflow-y-auto' : 'max-h-0 overflow-hidden'} transition-all duration-200 shadow-sm focus:ring focus:ring-indigo-200 text-xs sm:text-sm`}>
                      {allMonthsWithData.map((month) => (
                        <div key={month} className="flex items-center">
                          <input
                            type="checkbox"
                            id={`month-${month}`}
                            checked={selectedMonths.includes(month)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMonths([...selectedMonths, month]);
                              } else {
                                setSelectedMonths(selectedMonths.filter(m => m !== month));
                              }
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label
                            htmlFor={`month-${month}`}
                            className="ml-2 text-xs sm:text-sm text-gray-700 flex items-center"
                          >
                            <span 
                              className="w-1.5 h-1.5 rounded-full mr-2"
                              style={{ 
                                backgroundColor: monthColors[allMonthsWithData.indexOf(month) % monthColors.length] 
                              }}
                            ></span>
                            {month}
                          </label>
                        </div>
                      ))}
                    </div>
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
        <div className="w-full h-[280px] sm:h-[320px] lg:h-[380px]">
          <Radar data={data} options={options} />
        </div>
      ) : (
        <div className="text-gray-500 mt-10 text-sm sm:text-lg">No data available for {currentSelectedSport}</div>
      )}
    </div>
  );
}
