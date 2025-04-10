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

  const label = tooltip.dataPoints[0]?.label || "N/A";
  const power = datasets[index]?.power || "N/A";
  const heartRate = datasets[index]?.heartRate || "N/A";
  const lactate = datasets[index]?.lactate || "N/A";
  const duration = datasets[index]?.duration || "N/A";

  // Funkce pro formátování délky intervalu
  const formatLength = (duration) => {
    if (!duration) return "N/A";
    if (duration.includes('km') || duration.includes('m') || duration.includes('min')) {
      return duration;
    }
    const numDuration = parseFloat(duration);
    if (!isNaN(numDuration)) {
      switch (sport) {
        case 'run':
          return `${numDuration}km`;
        case 'swim':
          return `${numDuration}m`;
        case 'bike':
          return `${numDuration} min`;
        default:
          return duration;
      }
    }
    return duration;
  };

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
      <div className="flex items-center gap-2 text-blue-600">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        {sport === 'bike' ? 'Power' : 'Pace'}: {power}
      </div>
      <div className="flex items-center gap-2 text-red-600">
        <span className="w-2 h-2 rounded-full bg-red-500"></span>
        Heart Rate: {heartRate} Bpm
      </div>
      <div className="flex items-center gap-2 text-purple-600">
        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
        Lactate: {lactate} mmol/L
      </div>
      <div className="flex items-center gap-2 text-green-600">
        <span className="w-2 h-2 rounded-full bg-green-500"></span>
        Duration: {formatLength(duration)}
      </div>
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
  const [error, setError] = useState(null);
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
    console.log('handleSportChange called with:', newSport);
    console.log('Current selectedSport:', selectedSport);
    
    // Nejprve aktualizujeme sport
    setSelectedSport(newSport);
    console.log('setSelectedSport called with:', newSport);
    
    // Pak aktualizujeme data pro nový sport
    const sportTrainings = trainingList.filter(t => t.sport === newSport);
    console.log('Filtered sportTrainings:', sportTrainings);
    
    const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
    console.log('Unique titles for new sport:', uniqueTitles);
    
    if (sportTrainings.length > 0) {
      const firstTitle = uniqueTitles[0];
      const firstTraining = sportTrainings.find(t => t.title === firstTitle)?._id;
      
      console.log('Setting first title:', firstTitle);
      console.log('Setting first training:', firstTraining);
      
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
    const firstTraining = trainingsWithTitle[0]?._id;
    
    setSelectedTitle(newTitle);
    setSelectedTraining(firstTraining);
  };

  // Handler pro změnu konkrétního tréninku podle data
  const handleTrainingChange = (trainingId) => {
    setSelectedTraining(trainingId);
  };

  useEffect(() => {
    if (!trainingList) return;
    
    if (trainingList.length > 0) {
      setLoading(false);
      const sportTrainings = trainingList.filter(t => t.sport === selectedSport);
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        if (uniqueTitles.length > 0) {
          setSelectedTitle(uniqueTitles[0]);
          const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
          if (firstTrainingWithTitle) {
            setSelectedTraining(firstTrainingWithTitle._id);
          }
        } else {
          setSelectedTitle(null);
          setSelectedTraining(null);
        }
      }
    }
  }, [selectedSport, trainingList, selectedTitle, setSelectedTitle, setSelectedTraining]);

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
  }, [selectedTraining, trainingList]);

  // Přidáme useEffect pro zachycení kliknutí mimo menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Přidáme useEffect pro aktualizaci dat při změně sportu
  useEffect(() => {
    console.log('Sport change useEffect triggered');
    console.log('Current selectedSport:', selectedSport);
    
    if (!trainingList || !selectedSport) return;
    
    const sportTrainings = trainingList.filter(t => t.sport === selectedSport);
    console.log('Filtered sportTrainings in useEffect:', sportTrainings);
    
    const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
    console.log('Unique titles in useEffect:', uniqueTitles);
    
    if (sportTrainings.length > 0) {
      const firstTitle = uniqueTitles[0];
      const firstTraining = sportTrainings.find(t => t.title === firstTitle)?._id;
      
      console.log('Setting first title in useEffect:', firstTitle);
      console.log('Setting first training in useEffect:', firstTraining);
      
      if (firstTitle) {
        setSelectedTitle(firstTitle);
        if (firstTraining) {
          setSelectedTraining(firstTraining);
        }
      }
    } else {
      console.log('No trainings found for sport in useEffect:', selectedSport);
      setSelectedTitle(null);
      setSelectedTraining(null);
    }
  }, [selectedSport, trainingList]);

  // Přidáme useEffect pro sledování změn v props
  useEffect(() => {
    console.log('Props changed:', {
      selectedTitle,
      selectedTraining
    });
  }, [selectedTitle, selectedTraining]);

  if (!trainingList) return <div>Loading trainings...</div>;
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
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
  const trainingOptions = trainingsWithSelectedTitle?.map(training => ({
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
        grid: {
          color: 'rgba(0,0,0,0.1)',
          drawTicks: false,
          borderDash: [2, 4],
          borderDashOffset: 0,
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

  const getPowerUnit = (sport) => {
    switch (sport) {
      case 'run':
        return '/km';
      case 'swim':
        return '/100m';
      case 'bike':
        return 'W';
      default:
        return '';
    }
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
