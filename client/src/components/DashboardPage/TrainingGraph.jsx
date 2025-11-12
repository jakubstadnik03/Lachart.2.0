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

  // Funkce pro formátování délky intervalu
  const formatLength = (duration) => {
    if (!duration) return null;
    if (typeof duration === 'string') {
      if (duration.includes('km') || duration.includes('m') || duration.includes('min')) {
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
  
  // Power/Pace
  if (dataPoint.power && dataPoint.power !== 0) {
    metrics.push({
      label: sport === 'bike' ? 'Power' : 'Pace',
      value: dataPoint.power,
      formattedValue: sport === 'bike' ? `${dataPoint.power}` : formatPace(dataPoint.power),
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
  
  // Duration
  if (dataPoint.duration && dataPoint.duration !== 0) {
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
  setSelectedTraining 
}) => {
  const [selectedSport, setSelectedSport] = useState('bike');
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
    // console.log('handleSportChange called with:', newSport);
    // console.log('Current selectedSport:', selectedSport);
    
    // Nejprve aktualizujeme sport
    setSelectedSport(newSport);
    // console.log('setSelectedSport called with:', newSport);
    
    // Pak aktualizujeme data pro nový sport
    const sportTrainings = trainingList.filter(t => t.sport === newSport);
    // console.log('Filtered sportTrainings:', sportTrainings);
    
    const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
    // console.log('Unique titles for new sport:', uniqueTitles);
    
    if (sportTrainings.length > 0) {
      const firstTitle = uniqueTitles[0];
      const firstTraining = sportTrainings.find(t => t.title === firstTitle)?._id;
      
      // console.log('Setting first title:', firstTitle);
      // console.log('Setting first training:', firstTraining);
      
      if (firstTitle) {
        setSelectedTitle(firstTitle);
        if (firstTraining) {
          setSelectedTraining(firstTraining);
        }
      }
    } else {
      console.log('No trainings found for sport:', newSport);
      setSelectedTitle(null);
      setSelectedTraining(null);
    }
  };

  // Handler pro změnu názvu tréninku
  const handleTitleChange = (newTitle) => {
    const sportTrainings = trainingList.filter(t => t.sport === selectedSport);
    const trainingsWithTitle = sportTrainings.filter(t => t.title === newTitle);
    
    // Seřadíme tréninky podle data od nejnovějšího
    trainingsWithTitle.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Vybereme nejnovější trénink
    const newestTraining = trainingsWithTitle[0]?._id;
    
    setSelectedTitle(newTitle);
    setSelectedTraining(newestTraining);
  };

  // Handler pro změnu konkrétního tréninku podle data
  const handleTrainingChange = (trainingId) => {
    setSelectedTraining(trainingId);
  };

  useEffect(() => {
    if (!trainingList || trainingList.length === 0) return;
    
    setLoading(false);
    const sportTrainings = trainingList.filter(t => t.sport === selectedSport);
    
    if (sportTrainings.length === 0) {
      setSelectedTitle(null);
      setSelectedTraining(null);
      return;
    }

    // Seřadíme všechny tréninky podle data od nejnovějšího
    const sortedTrainings = [...sportTrainings].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
    });

    const newestTraining = sortedTrainings[0];
    
    // Nastavíme název a trénink na nejnovější
    if (newestTraining) {
      setSelectedTitle(newestTraining.title);
      setSelectedTraining(newestTraining._id);
    }
  }, [selectedSport, trainingList, setSelectedTitle, setSelectedTraining]);

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
  if (!trainingList.length) return <div>No trainings available</div>;

  const selectedTrainingData = trainingList.find(t => t._id === selectedTraining);
  const sportTrainings = trainingList.filter(t => t.sport === selectedSport);
  const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];

  // Pokud nejsou k dispozici žádné tréninky pro vybraný sport, zobrazíme prázdný graf
  if (sportTrainings.length === 0) {
    return (
      <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-500">No trainings for {selectedSport}</h2>
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
                      <select 
                        className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                        value={selectedSport}
                        onChange={(e) => handleSportChange(e.target.value)}
                      >
                        {['bike', 'run', 'swim'].map((sport) => (
                          <option key={sport} value={sport}>
                            {sport.charAt(0).toUpperCase() + sport.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative" style={{ height: '300px' }}>
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            No training data available for {selectedSport}
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
                      <select 
                        className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                        value={selectedSport}
                        onChange={(e) => handleSportChange(e.target.value)}
                      >
                        {['bike', 'run', 'swim'].map((sport) => (
                          <option key={sport} value={sport}>
                            {sport.charAt(0).toUpperCase() + sport.slice(1)}
                          </option>
                        ))}
                      </select>
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
          stepSize: Math.round((ranges.power.max - ranges.power.min) / 4),
          callback: (value) => formatPowerValue(value, selectedSport),
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
                      value={selectedSport}
                      onChange={(e) => handleSportChange(e.target.value)}
                    >
                      {['bike', 'run', 'swim'].map((sport) => (
                        <option key={sport} value={sport}>
                          {sport.charAt(0).toUpperCase() + sport.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Training title selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Training</label>
                    <select 
                      className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                      value={selectedTitle}
                      onChange={(e) => handleTitleChange(e.target.value)}
                    >
                      {uniqueTitles.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))}
                    </select>
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
                label: selectedSport === 'bike' ? "Power" : "Pace",
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
              power: formatPowerValue(r.power, selectedSport)
            }))} 
            sport={selectedSport}
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
