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

const CustomTooltip = ({ tooltip, datasets }) => {
  if (!tooltip?.dataPoints) return null;

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;

  const label = tooltip.dataPoints[0]?.label || "N/A";
  const power = datasets[index]?.power || "N/A";
  const heartRate = datasets[index]?.heartRate || "N/A";
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

const TrainingGraph = ({ trainingList }) => {
  const [trainings, setTrainings] = useState([]);
  const [sports, setSports] = useState(['bike', 'run', 'swim']);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [titles, setTitles] = useState([]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [ranges, setRanges] = useState({ power: { min: 0, max: 0 }, heartRate: { min: 0, max: 0 } });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    const loadTrainings = async () => {
      try {
        setLoading(true);
        if (trainingList && trainingList.length > 0) {
          setTrainings(trainingList);
          // Filtrujeme tréninky podle vybraného sportu
          const sportTrainings = trainingList.filter(t => t.sport === selectedSport);
          const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
          setTitles(uniqueTitles);
          setSelectedTitle(uniqueTitles[0]);
          const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
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
  }, [selectedSport]);

  // Když se změní sport, aktualizujeme tituly
  useEffect(() => {
    if (trainings.length > 0) {
      const sportTrainings = trainings.filter(t => t.sport === selectedSport);
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      setTitles(uniqueTitles);
      setSelectedTitle(uniqueTitles[0]);
      const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
      if (firstTrainingWithTitle) {
        setSelectedTraining(firstTrainingWithTitle.trainingId);
      }
    }
  }, [selectedSport, trainings]);

  // Přepočítání rozsahů při změně vybraného tréninku
  useEffect(() => {
    if (selectedTraining && trainings.length > 0) {
      const selectedData = trainings.find(t => t.trainingId === selectedTraining);
      if (selectedData && selectedData.results) {
        const powers = selectedData.results.map(r => r.power);
        const heartRates = selectedData.results.map(r => r.heartRate);

        setRanges({
          power: {
            min: Math.floor(Math.min(...powers) - 50) ,
            max: Math.ceil(Math.max(...powers) + 50) 
          },
          heartRate: {
            min: Math.floor(Math.min(...heartRates) - 10) ,
            max: Math.ceil(Math.max(...heartRates) + 10) 
          }
        });
      }
    }
  }, [selectedTraining, trainings]);

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

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!trainings.length) return <div>No trainings available</div>;

  const selectedTrainingData = trainings.find(t => t.trainingId === selectedTraining);
  const trainingsWithSelectedTitle = trainings.filter(t => t.title === selectedTitle);
  const trainingDates = trainingsWithSelectedTitle.map(t => t.date);
  
  const selectedDate = selectedTrainingData?.date || '';

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
    <div className="relative w-full max-w-3xl p-6 bg-white rounded-3xl shadow-lg border border-blue-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold">{selectedTitle}</h2>
        <div className="flex items-center gap-4">
          <DropdownMenu
            selectedTraining={selectedDate}
            setSelectedTraining={(date) => {
              const training = trainingsWithSelectedTitle.find(t => t.date === date);
              if (training) setSelectedTraining(training.trainingId);
            }}
            trainingOptions={trainingDates}
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
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
                    <select 
                      className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                      value={selectedSport}
                      onChange={(e) => {
                        setSelectedSport(e.target.value);
                        setIsSettingsOpen(false);
                      }}
                    >
                      {sports.map((sport) => (
                        <option key={sport} value={sport}>
                          {sport.charAt(0).toUpperCase() + sport.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Training</label>
                    <select 
                      className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                      value={selectedTitle}
                      onChange={(e) => {
                        setSelectedTitle(e.target.value);
                        setIsSettingsOpen(false);
                      }}
                    >
                      {titles.map((title, index) => (
                        <option key={`title-${index}-${title}`} value={title}>
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

      {/* Popis tréninku */}
      <div className="mt-6 border-t border-gray-100 pt-4">
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
            <div className="flex items-start gap-2">
              <span className="text-sm font-medium text-gray-500">Comments:</span>
              <span className="text-sm text-gray-900">{selectedTrainingData.comments}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingGraph;
