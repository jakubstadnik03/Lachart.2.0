"use client";
import React, { useState, useEffect, useRef } from "react";
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
import { DropdownMenu } from "../DropDownMenu";
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const CustomTooltip = ({ tooltip, datasets, sport }) => {
  if (!tooltip?.dataPoints) return null;

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;

  const label = tooltip.dataPoints[0]?.label;
  const dataPoint = datasets[index];
  
  if (!dataPoint) return null;
  
  // Funkce pro formátování času do formátu mm:ss
  const formatPace = (seconds) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}/km`;
  };

  // Funkce pro formátování vzdálenosti
  const formatDistance = (distance) => {
    if (!distance) return null;
    if (typeof distance === 'string') {
      // Pokud už obsahuje jednotky, vrať to tak jak je
      if (distance.includes('km') || distance.includes('m')) {
        return distance;
      }
    }
    const numDistance = parseFloat(distance);
    if (!isNaN(numDistance)) {
      // Pokud je menší než 1 km, zobraz v metrech
      if (numDistance < 1) {
        return `${Math.round(numDistance * 1000)}m`;
      }
      return `${numDistance.toFixed(2)}km`;
    }
    return null;
  };

  // Funkce pro formátování délky intervalu (čas)
  const formatLength = (duration) => {
    if (!duration) return null;
    if (typeof duration === 'string') {
      // Pokud už obsahuje jednotky nebo formát MM:SS, vrať to tak jak je
      if (duration.includes('km') || duration.includes('m') || duration.includes('min') || duration.includes(':')) {
        return duration;
      }
    }
    const numDuration = parseFloat(duration);
    if (!isNaN(numDuration)) {
      // Převod sekund na mm:ss formát
      const minutes = Math.floor(numDuration / 60);
      const seconds = Math.floor(numDuration % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return null;
  };

  // Seznam metrik k zobrazení
  const metrics = [];
  
  // Power/Pace - pro run sport zobrazujeme Pace, pro bike Power
  if (dataPoint.power && dataPoint.power !== 0) {
    const isRun = sport === 'run';
    metrics.push({
      label: isRun ? 'Pace' : 'Power',
      value: dataPoint.power,
      formattedValue: isRun ? formatPace(dataPoint.power) : `${dataPoint.power}W`,
      color: 'blue',
    });
  }
  
  // Heart Rate
  if (dataPoint.heartRate && dataPoint.heartRate !== 0) {
    metrics.push({
      label: 'Heart Rate',
      value: dataPoint.heartRate,
      formattedValue: `${dataPoint.heartRate} Bpm`,
      color: 'red',
    });
  }
  
  // Duration/Distance - podle durationType
  if (dataPoint.duration && dataPoint.duration !== 0) {
    const durationType = dataPoint.durationType || 'time';
    if (durationType === 'distance') {
      // Pokud je durationType 'distance', zobrazujeme to jako Distance
      const formattedDistance = formatDistance(dataPoint.duration);
      if (formattedDistance) {
        metrics.push({
          label: 'Distance',
          value: dataPoint.duration,
          formattedValue: formattedDistance,
          color: 'green',
        });
      }
    } else {
      // Pokud je durationType 'time', zobrazujeme to jako Duration
      const formattedDuration = formatLength(dataPoint.duration);
      if (formattedDuration) {
        metrics.push({
          label: 'Duration',
          value: dataPoint.duration,
          formattedValue: formattedDuration,
          color: 'green',
        });
      }
    }
  }
  
  // Lactate
  if (dataPoint.lactate && dataPoint.lactate !== 0) {
    metrics.push({
      label: 'Lactate',
      value: dataPoint.lactate,
      formattedValue: `${dataPoint.lactate} mmol/L`,
      color: 'purple',
    });
  }
  
  // RPE
  if (dataPoint.rpe && dataPoint.rpe !== 0) {
    metrics.push({
      label: 'RPE',
      value: dataPoint.rpe,
      formattedValue: `${dataPoint.rpe}`,
      color: 'orange',
    });
  }

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
        zIndex: 50
      }}
    >
      <div className="font-bold text-gray-900 mb-1">Interval {label}</div>
      
      {metrics.map((metric, i) => (
        <div key={i} className={`flex items-center gap-2 text-${metric.color}-600`}>
          <span className={`w-2 h-2 rounded-full bg-${metric.color}-500`}></span>
          {metric.label}: {metric.formattedValue}
        </div>
      ))}
      
      <div
        className="absolute w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-8 border-t-white"
        style={{
          left: "50%",
          bottom: "-8px",
          transform: "translateX(-50%)",
        }}
      ></div>
    </div>
  );
};

const TrainingGraph = ({ 
  trainingList = [],
  selectedTitle, 
  setSelectedTitle, 
  selectedTraining, 
  setSelectedTraining,
  selectedSport,
  setSelectedSport
}) => {
  // Get available sports from trainings
  const availableSports = [...new Set(trainingList.map(t => t.sport))].filter(Boolean);
  
  // Initialize selectedSport with localStorage or default to 'all'
  const [internalSelectedSport, setInternalSelectedSport] = useState(() => {
    if (selectedSport) return selectedSport;
    const saved = localStorage.getItem('trainingGraph_selectedSport');
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
    localStorage.setItem('trainingGraph_selectedSport', value);
  };
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [ranges, setRanges] = useState({ power: { min: 0, max: 0 }, heartRate: { min: 0, max: 0 } });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // Funkce pro formátování času do formátu mm:ss
  const formatPace = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}/km`;
  };

  // Funkce pro formátování hodnoty podle sportu
  const formatPowerValue = (value, sport) => {
    if (sport === 'bike') {
      return `${value}W`;
    } else {
      return formatPace(value);
    }
  };

  // Handler pro změnu sportu
  const handleSportChange = (newSport) => {
    // Nejprve aktualizujeme sport
    setCurrentSelectedSport(newSport);
    
    // Pak aktualizujeme data pro nový sport
    const sportTrainings = newSport === 'all' 
      ? trainingList 
      : trainingList.filter(t => t.sport === newSport);
    
    const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
    
    if (sportTrainings.length > 0) {
      const firstTitle = uniqueTitles[0];
      const firstTraining = sportTrainings.find(t => t.title === firstTitle)?._id;
      
      if (firstTitle) {
        setSelectedTitle(firstTitle);
        if (firstTraining) {
          setSelectedTraining(firstTraining);
        }
      }
    } else {
      setSelectedTitle(null);
      setSelectedTraining(null);
    }
  };

  // Handler pro změnu názvu tréninku
  const handleTitleChange = (newTitle) => {
    const sportTrainings = currentSelectedSport === 'all' 
      ? trainingList 
      : trainingList.filter(t => t.sport === currentSelectedSport);
    const trainingsWithTitle = sportTrainings.filter(t => t.title === newTitle);
    
    // Seřadíme tréninky podle data od nejnovějšího
    trainingsWithTitle.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Vybereme nejnovější trénink
    const newestTraining = trainingsWithTitle[0]?._id;
    
    if (setSelectedTitle) setSelectedTitle(newTitle);
    if (setSelectedTraining && newestTraining) setSelectedTraining(newestTraining);
  };

  // Handler pro změnu konkrétního tréninku podle data
  const handleTrainingChange = (trainingId) => {
    setSelectedTraining(trainingId);
    // Aktualizujeme také selectedTitle, aby se synchronizovalo s TrainingStats
    const training = trainingList.find(t => t._id === trainingId);
    if (training && setSelectedTitle) {
      setSelectedTitle(training.title);
    }
  };

  useEffect(() => {
    if (!trainingList || trainingList.length === 0) return;
    
    setLoading(false);
    const sportTrainings = currentSelectedSport === 'all' 
      ? trainingList 
      : trainingList.filter(t => t.sport === currentSelectedSport);
    
    if (sportTrainings.length === 0) {
      if (setSelectedTitle) setSelectedTitle(null);
      if (setSelectedTraining) setSelectedTraining(null);
      return;
    }

    // Pokud už máme vybraný trénink a je stále platný, necháme ho
    if (selectedTraining) {
      const currentTraining = trainingList.find(t => t._id === selectedTraining);
      if (currentTraining && (currentSelectedSport === 'all' || currentTraining.sport === currentSelectedSport)) {
        // Trénink je stále platný, aktualizujeme pouze title pokud se změnil
        if (setSelectedTitle && currentTraining.title !== selectedTitle) {
          setSelectedTitle(currentTraining.title);
        }
        return;
      }
    }

    // Pokud máme vybraný title, zkusíme najít trénink s tímto názvem
    if (selectedTitle) {
      const trainingsWithTitle = sportTrainings
        .filter(t => t.title === selectedTitle)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      if (trainingsWithTitle.length > 0) {
        if (setSelectedTraining) {
          setSelectedTraining(trainingsWithTitle[0]._id);
        }
        return;
      }
    }

    // Jinak nastavíme nejnovější trénink
    const sortedTrainings = [...sportTrainings].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
    });

    const newestTraining = sortedTrainings[0];
    
    // Nastavíme název a trénink na nejnovější
    if (newestTraining) {
      if (setSelectedTitle) setSelectedTitle(newestTraining.title);
      if (setSelectedTraining) setSelectedTraining(newestTraining._id);
    }
  }, [currentSelectedSport, trainingList, selectedTraining, selectedTitle, setSelectedTitle, setSelectedTraining]);

  // Sloučíme dva useEffects do jednoho pro optimalizaci
  useEffect(() => {
    if (!trainingList) return;
    
    if (selectedTraining && trainingList.length > 0) {
      const selectedData = trainingList.find(t => t._id === selectedTraining);
      if (selectedData?.results) {
        const powers = selectedData.results.map(r => r.power);
        const heartRates = selectedData.results.map(r => r.heartRate);

        setRanges({
          power: {
            min: Math.floor(Math.min(...powers) - 20),
            max: Math.ceil(Math.max(...powers) + 20)
          },
          heartRate: {
            min: Math.floor(Math.min(...heartRates) - 5),
            max: Math.ceil(Math.max(...heartRates) + 5)
          }
        });
      }
    }

    // Přidáme handler pro kliknutí mimo menu do stejného useEffect
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedTraining, trainingList]);

  if (!trainingList) return <div>Loading trainings...</div>;
  if (loading) return <div>Loading...</div>;
  // Always render the component structure, even if empty

  const selectedTrainingData = trainingList.find(t => t._id === selectedTraining);
  const sportTrainings = currentSelectedSport === 'all' 
    ? (trainingList || [])
    : (trainingList || []).filter(t => t.sport === currentSelectedSport);
  const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];

  // Pokud nejsou k dispozici žádné tréninky pro vybraný sport, zobrazíme prázdný graf
  if (!trainingList || trainingList.length === 0 || sportTrainings.length === 0) {
    return (
      <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-500">No trainings for {currentSelectedSport}</h2>
          <div className="flex items-center gap-4">
            {/* Settings menu */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
              </button>
              
              {isSettingsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-2">
                    {/* Sport selector */}
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
                      <div className="relative">
                      <select 
                          className="w-full border border-gray-300 rounded-lg px-3 py-1 text-gray-600 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                          style={{ WebkitAppearance: 'none', appearance: 'none' }}
                        value={currentSelectedSport}
                        onChange={(e) => handleSportChange(e.target.value)}
                      >
                          <option value="all">All Sports</option>
                        {availableSports.map((sport) => (
                          <option key={sport} value={sport}>
                            {sport.charAt(0).toUpperCase() + sport.slice(1)}
                          </option>
                        ))}
                      </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative" style={{ height: '300px' }}>
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            No training data available for {currentSelectedSport === 'all' ? 'all sports' : currentSelectedSport}
          </div>
        </div>
      </div>
    );
  }

  // Pokud není vybrán žádný trénink nebo nemá výsledky, zobrazíme prázdný graf
  if (!selectedTrainingData?.results) {
    return (
      <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-500">Select a training</h2>
          <div className="flex items-center gap-4">
            {/* Settings menu */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
              </button>
              
              {isSettingsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-2">
                    {/* Sport selector */}
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
                      <div className="relative">
                      <select 
                          className="w-full border border-gray-300 rounded-lg px-3 py-1 text-gray-600 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                          style={{ WebkitAppearance: 'none', appearance: 'none' }}
                        value={currentSelectedSport}
                        onChange={(e) => handleSportChange(e.target.value)}
                      >
                          <option value="all">All Sports</option>
                        {availableSports.map((sport) => (
                          <option key={sport} value={sport}>
                            {sport.charAt(0).toUpperCase() + sport.slice(1)}
                          </option>
                        ))}
                      </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative" style={{ height: '300px' }}>
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Please select a training to view data
          </div>
        </div>
      </div>
    );
  }

  // Filtrujeme tréninky podle vybraného názvu
  const trainingsWithSelectedTitle = sportTrainings.filter(t => t.title === selectedTitle);
  
  // Formátujeme data pro dropdown
  const trainingOptions = trainingsWithSelectedTitle
    ?.sort((a, b) => new Date(b.date) - new Date(a.date)) // Seřadíme od nejnovějšího po nejstarší
    .map(training => ({
      value: training._id,
      label: new Date(training.date).toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    })) || [];


  const sportForScale = currentSelectedSport === 'all' && selectedTrainingData 
    ? selectedTrainingData.sport 
    : currentSelectedSport;
  const isRunScale = sportForScale === 'run';

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
        // For running we treat "faster" (lower pace value) as visually higher,
        // so we reverse the Y axis.
        reverse: isRunScale,
        ticks: {
          stepSize: Math.round((ranges.power.max - ranges.power.min) / 4),
          callback: (value) => {
            return formatPowerValue(value, sportForScale);
          },
          display: true,
          autoSkip: false,
        },
        border: { dash: [6, 6] },
        grid: {
          color: "rgba(0, 0, 0, 0.15)",
          borderDash: [4, 4],
        },
    
      },
      y1: {
        position: 'right',
        title: { display: false },
        min: ranges.heartRate.min,
        max: ranges.heartRate.max,
        ticks: {
          stepSize: Math.round((ranges.heartRate.max - ranges.heartRate.min) / 4),
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
    <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold">{selectedTitle}</h2>
        <div className="flex items-center gap-4">
          {/* Dropdown pro výběr data tréninku */}
          <DropdownMenu
            selectedValue={selectedTraining}
            options={trainingOptions}
            onChange={handleTrainingChange}
          />
          
          {/* Settings menu */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
            </button>
            
            {isSettingsOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-2">
                  {/* Sport selector */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
                    <select 
                      className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                      value={currentSelectedSport}
                      onChange={(e) => handleSportChange(e.target.value)}
                    >
                      {availableSports.map((sport) => (
                        <option key={sport} value={sport}>
                          {sport.charAt(0).toUpperCase() + sport.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Training title selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Training</label>
                    <div className="relative">
                    <select 
                        className="w-full border border-gray-300 rounded-lg px-3 py-1 text-gray-600 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                      value={selectedTitle}
                      onChange={(e) => handleTitleChange(e.target.value)}
                    >
                      {uniqueTitles.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))}
                    </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '300px' }}>
        <Line 
          data={{
            labels: selectedTrainingData.results.map(r => r.interval.toString()),
            datasets: [
              {
                label: (currentSelectedSport === 'bike' || currentSelectedSport === 'all') ? "Power" : "Pace",
                data: selectedTrainingData.results.map(r => r.power),
                borderColor: "#3B82F6",
                backgroundColor: "#3B82F6",
                pointStyle: "circle",
                pointRadius: 6,
                pointHoverRadius: 10,
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
                pointHoverRadius: 10,
                borderWidth: 2,
                yAxisID: "y1",
                tension: 0.4,
              }
            ]
          }} 
          options={options} 
        />
        {tooltip && (
          <CustomTooltip 
            tooltip={tooltip} 
            datasets={selectedTrainingData.results.map(r => ({
              ...r,
              // Keep original power value for tooltip formatting
              power: r.power
            }))} 
            sport={currentSelectedSport === 'all' ? selectedTrainingData.sport : currentSelectedSport}
          />
        )}
      </div>

      {/* Popis tréninku */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="">
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Specifics:</span>
            <div className="flex gap-2">
              <span className="text-sm text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                {selectedTrainingData.specifics.specific}
              </span>
              <span className="text-sm text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                {selectedTrainingData.specifics.weather}
              </span>
            </div>
          </div>

          {selectedTrainingData.comments && (
            <div className="flex items-start gap-2 mt-2">
              <span className="text-sm font-medium text-gray-500">Comments:</span>
              <span className="text-sm text-gray-900">{selectedTrainingData.comments}</span>
            </div>
          )}

          {selectedTrainingData.description && (
            <div className="flex items-start gap-2 mt-2">
              <span className="text-sm font-medium text-gray-500">Description:</span>
              <span className="text-sm text-gray-900">{selectedTrainingData.description}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingGraph;
