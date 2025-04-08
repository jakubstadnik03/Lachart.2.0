import React, { useMemo, useState, useEffect, useRef } from "react";
import { DropdownMenu } from "../DropDownMenu";
import { Line } from "react-chartjs-2";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";

const maxGraphHeight = 200;

function StatCard({ stats }) {
  return (
    <div className="flex flex-col text-xs rounded-none max-w-[192px]" >
      <div className="flex z-10 flex-col justify-center items-center px-3 py-2 text-center bg-white rounded-lg border border-solid border-slate-100 shadow-[0px_12px_20px_rgba(0,0,0,0.1)] text-stone-500">
        {stats
          .filter(stat => stat.value && stat.value !== "-") // Filter out empty or "-" values
          .map((stat, index) => (
            <div
              key={`stat-${index}`}
              className={stat.unit === "W" ? "font-semibold text-gray-900" : ""}
            >
              {stat.label}: {stat.value} {stat.unit}
            </div>
          ))}
      </div>
      <div className="flex shrink-0 self-center mt-3 w-3.5 h-3.5 bg-violet-500 rounded-full border-solid border-[3px] border-zinc-50" />
    </div>
  );
}

function VerticalBar({ height, color, power, heartRate, lactate, duration, index, isHovered, onHover, totalTrainings }) {
  // Calculate width based on duration and total number of trainings
  const getWidth = (duration, totalTrainings) => {
    // Base width gets smaller as number of trainings increases
    const baseWidth = Math.max(6, Math.min(12, 20 - totalTrainings));
    
    if (!duration) return baseWidth;
    
    const minutes = duration.includes(':') ? 
      parseInt(duration.split(':')[0]) + parseInt(duration.split(':')[1]) / 60 : 
      parseFloat(duration);
      
    return Math.max(baseWidth, Math.min(10, minutes));
  };

  return (
    <div
      className="relative flex justify-center shrink-0 h-full"
      style={{ width: `${getWidth(duration, totalTrainings)}px` }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div
        className={`w-full rounded-sm ${color} transition-all duration-200 absolute bottom-0 cursor-pointer hover:opacity-90`}
        style={{ 
          height: `${Math.max(height, 4)}px`,
          opacity: isHovered ? 1 : 0.7,
          zIndex: 20
        }}
      />
      
      {isHovered && (
        <div 
          className="absolute left-1/2 transform -translate-x-1/2 z-50 pointer-events-none"
          style={{
            bottom: `${height - 5}px`,
            minWidth: "160px"
          }}  
        >
          <StatCard
            stats={[
              { label: "Interval", value: `#${index + 1}`, unit: "" },
              ...(duration ? [{ label: "Duration", value: duration, unit: "" }] : []),
              ...(power ? [{ label: "Power", value: power, unit: "W" }] : []),
              ...(heartRate ? [{ label: "Heart Rate", value: heartRate, unit: "Bpm" }] : []),
              ...(lactate ? [{ label: "Lactate", value: lactate, unit: "mmol/L" }] : []),
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Scale({ values, unit }) {
  return (
    <div className="relative flex flex-col justify-between py-4 w-12 text-sm text-right whitespace-nowrap min-h-[200px] text-zinc-500">
      {values.map((value, index) => (
        <div key={`scale-${unit}-${index}`} className="relative flex items-center w-full">
          <div className="absolute left-0 right-0 h-px border-t border-dashed border-gray-200" />
          <span className="relative z-10 bg-white px-1">{value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

function TrainingComparison({ training, previousTraining }) {
  const getAveragePower = (results) => {
    const powers = results.map(r => Number(r.power)).filter(p => !isNaN(p) && p > 0);
    return powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b) / powers.length) : 0;
  };

  const currentAvgPower = getAveragePower(training.results);
  const previousAvgPower = previousTraining ? getAveragePower(previousTraining.results) : 0;
  const powerDiff = currentAvgPower - previousAvgPower;
  
  const getTrendIcon = (diff) => {
    if (diff > 0) return "↑";
    if (diff < 0) return "↓";
    return "→";
  };

  const getTrendColor = (diff) => {
    if (diff > 0) return "text-green-500";
    if (diff < 0) return "text-red-500";
    return "text-gray-500";
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">
          {new Date(training.date).toLocaleDateString('cs-CZ', {
            day: 'numeric',
            month: 'numeric',
            year: '2-digit'
          })}
        </div>
        <div className="text-xs text-gray-500 truncate max-w-[150px]">{training.title}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm whitespace-nowrap">
          <span className="text-gray-500">Avg: </span>
          <span className="font-medium">{currentAvgPower}W</span>
          {previousTraining && (
            <span className={`ml-2 ${getTrendColor(powerDiff)}`}>
              {getTrendIcon(powerDiff)} {Math.abs(powerDiff)}W
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TrainingStats({ trainings, selectedSport, onSportChange }) {
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [hoveredBar, setHoveredBar] = useState(null);
  const [visibleTrainingIndex, setVisibleTrainingIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(6);
  const [progressIndex, setProgressIndex] = useState(0);
  const settingsRef = useRef(null);
  const visibleTrainingsCount = 2;

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (trainings.length > 0) {
      const relevantTrainings = trainings.filter(t => t.sport === selectedSport);
      if (relevantTrainings.length > 0) {
        setSelectedTraining(relevantTrainings[0].title);
      }
    }
  }, [trainings, selectedSport]);

  const trainingOptions = useMemo(() => {
    const uniqueTitles = [...new Set(
      trainings
        .filter(t => t.sport === selectedSport)
        .map(t => t.title)
    )];

    return uniqueTitles.map(title => ({
      value: title,
      label: title
    }));
  }, [trainings, selectedSport]);

  const filteredTrainings = useMemo(() => {
    // Filter trainings by sport and title
    const filtered = trainings
      .filter(t => t.sport === selectedSport && t.title === selectedTraining)
      // Sort by date from newest to oldest
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return filtered;
  }, [trainings, selectedSport, selectedTraining]);

  const visibleTrainings = useMemo(() => {
    return filteredTrainings.slice(visibleTrainingIndex, visibleTrainingIndex + displayCount);
  }, [filteredTrainings, visibleTrainingIndex, displayCount]);

  const canNavigateLeft = visibleTrainingIndex > 0;
  const canNavigateRight = visibleTrainingIndex + displayCount < filteredTrainings.length;

  const handleNavigateLeft = () => {
    if (canNavigateLeft) {
      setVisibleTrainingIndex(prev => Math.max(0, prev - 1));
    }
  };

  const handleNavigateRight = () => {
    if (canNavigateRight) {
      setVisibleTrainingIndex(prev => prev + 1);
    }
  };

  const canNavigateProgressLeft = progressIndex > 0;
  const canNavigateProgressRight = progressIndex + 2 < filteredTrainings.length;

  const handleProgressNavigateLeft = () => {
    if (canNavigateProgressLeft) {
      setProgressIndex(prev => Math.max(0, prev - 1));
    }
  };

  const handleProgressNavigateRight = () => {
    if (canNavigateProgressRight) {
      setProgressIndex(prev => prev + 1);
    }
  };

  const { powerValues, heartRateValues, minPower, maxPower, minHeartRate, maxHeartRate, averagePower, averageHeartRate } = useMemo(() => {
    if (filteredTrainings.length === 0) return { 
      powerValues: [], 
      heartRateValues: [], 
      minPower: 0, 
      maxPower: 100, 
      minHeartRate: 0, 
      maxHeartRate: 200,
      averagePower: [],
      averageHeartRate: []
    };
  
    const allPowers = filteredTrainings.flatMap((t) => 
      t.results.map((r) => {
        const power = Number(r.power);
        return !isNaN(power) && power > 0 ? power : null;
      })
    ).filter(p => p !== null);

    const allHeartRates = filteredTrainings.flatMap((t) => 
      t.results.map((r) => {
        const hr = Number(r.heartRate);
        return !isNaN(hr) && hr > 0 ? hr : null;
      })
    ).filter(hr => hr !== null);
  
    const actualMinPower = allPowers.length > 0 ? Math.min(...allPowers) : 0;
    const actualMaxPower = allPowers.length > 0 ? Math.max(...allPowers) : 100;
    
    const minPower = Math.max(0, Math.floor((actualMinPower - 50) / 10) * 10);
    const maxPower = Math.ceil((actualMaxPower + 15) / 10) * 10;

    const rawMinHR = 0;
    const rawMaxHR = allHeartRates.length > 0 ? Math.max(...allHeartRates) : 200;
    const hrRange = rawMaxHR - rawMinHR;
    const hrPadding = hrRange * 0.2;
    
    const minHeartRate = 0;
    const maxHeartRate = Math.ceil((rawMaxHR + hrPadding) / 10) * 10;

    // Calculate averages for each training session
    const averagePower = filteredTrainings.map(training => {
      const powers = training.results.map(r => Number(r.power)).filter(p => !isNaN(p) && p > 0);
      return powers.length > 0 ? powers.reduce((a, b) => a + b) / powers.length : null;
    });

    const averageHeartRate = filteredTrainings.map(training => {
      const hrs = training.results.map(r => Number(r.heartRate)).filter(hr => !isNaN(hr) && hr > 0);
      return hrs.length > 0 ? hrs.reduce((a, b) => a + b) / hrs.length : null;
    });
  
    return {
      powerValues: Array.from({ length: 6 }, (_, i) => Math.round(minPower + (i * (maxPower - minPower)) / 5)).reverse(),
      heartRateValues: Array.from({ length: 6 }, (_, i) => Math.round(minHeartRate + (i * (maxHeartRate - minHeartRate)) / 5)).reverse(),
      minPower,
      maxPower,
      minHeartRate,
      maxHeartRate,
      averagePower,
      averageHeartRate
    };
  }, [filteredTrainings]);
  
  const barColors = ["bg-violet-500", "bg-violet-400", "bg-violet-300", "bg-violet-200", "bg-violet-100"];

  const getColumnWidth = () => {
    // Šířka sloupce se zvětšuje s menším počtem zobrazených tréninků
    const baseWidth = 50;
    const maxWidth = 100;
    const minWidth = 30;
    const width = Math.min(maxWidth, Math.max(minWidth, baseWidth * (6 / displayCount)));
    return `${width}px`;
  };

  return (
    <div className="flex flex-col p-5 bg-white rounded-3xl shadow-md relative h-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-zinc-900">
            Last {filteredTrainings.length} trainings
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNavigateLeft}
              disabled={!canNavigateLeft}
              className={`p-2 rounded-full ${canNavigateLeft ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNavigateRight}
              disabled={!canNavigateRight}
              className={`p-2 rounded-full ${canNavigateRight ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
        <DropdownMenu
            selectedValue={selectedTraining}
            options={trainingOptions}
            onChange={setSelectedTraining}
            displayKey="label"
            valueKey="value"
          />
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
                      onChange={(e) => onSportChange(e.target.value)}
                    >
                      <option value="all">All Sports</option>
                      {['bike', 'run', 'swim'].map((sport) => (
                        <option key={sport} value={sport}>
                          {sport.charAt(0).toUpperCase() + sport.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Number of trainings selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of trainings</label>
                    <select 
                      className="w-full border rounded-lg px-3 py-1 text-gray-600 text-sm"
                      value={displayCount}
                      onChange={(e) => {
                        setDisplayCount(Number(e.target.value));
                        setVisibleTrainingIndex(0); // Reset index when changing display count
                      }}
                    >
                      {[3, 6, 9, 12].map((count) => (
                        <option key={count} value={count}>
                          {count} trainings
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

      <div className="flex gap-2 items-stretch px-1.5 relative w-full" 
           style={{ height: `${maxGraphHeight + 50}px` }}>
        <Scale values={powerValues} unit="W" />
        
        <div className="relative flex-1 flex items-stretch justify-between min-w-0">
          {/* Grid lines */}
          <div className="absolute inset-0">
            {powerValues.map((value, index) => (
              <div key={`grid-line-${index}`} 
                   className="border-t border-dashed border-gray-200" 
                   style={{
                     top: `${(index * maxGraphHeight) / (powerValues.length - 1) + 25}px`,
                     position: 'absolute',
                     width: '100%',
                     zIndex: 10
                   }}
              />
            ))}
          </div>

          {/* Average lines */}
          <svg className="absolute inset-0 z-30 pointer-events-none">
            {/* Power average line */}
            <path
              d={`M ${averagePower.map((avg, i) => {
                const x = (i * (100 / (averagePower.length - 1)))+ '%';
                const y = maxGraphHeight - ((avg - minPower) / (maxPower - minPower)) * maxGraphHeight;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}`}
              stroke="#8B5CF6"
              strokeWidth="2"
              fill="none"
            />
          </svg>

          {/* Bars */}
          <div className="relative flex justify-between w-full z-10 items-end px-4">
            {visibleTrainings.map((training, trainingIndex) => (
              <div 
                key={`training-${training._id || training.id || trainingIndex}`} 
                className="flex flex-col relative"
                style={{ width: getColumnWidth(), height: `${maxGraphHeight}px` }}
              >
                <div className="flex gap-0.5 h-full mb-2 justify-center items-end">
                  {training.results.map((result, resultIndex) => {
                    const powerValue = Number(result.power);
                    const height = !isNaN(powerValue) && powerValue > 0 ? 
                      ((powerValue - minPower) / (maxPower - minPower)) * maxGraphHeight : 0;

                    return (
                      <VerticalBar
                        key={`result-${training._id || training.id || trainingIndex}-${resultIndex}`}
                        height={height}
                        color={barColors[resultIndex % barColors.length]}
                        power={result.power}
                        lactate={result.lactate}
                        heartRate={result.heartRate}
                        duration={result.duration}
                        index={resultIndex}
                        isHovered={hoveredBar?.trainingIndex === trainingIndex && hoveredBar?.intervalIndex === resultIndex}
                        onHover={(isHovered) => setHoveredBar(isHovered ? { trainingIndex, intervalIndex: resultIndex } : null)}
                        totalTrainings={displayCount}
                      />
                    );
                  })}
                </div>
                <div className="text-xs text-zinc-500 whitespace-nowrap text-center">
                  {new Date(training.date).toLocaleDateString('cs-CZ', {
                    day: 'numeric',
                    month: 'numeric',
                    year: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-medium text-gray-900">Training Progress</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleProgressNavigateLeft}
              disabled={!canNavigateProgressLeft}
              className={`p-1 rounded hover:bg-gray-100 ${!canNavigateProgressLeft ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleProgressNavigateRight}
              disabled={!canNavigateProgressRight}
              className={`p-1 rounded hover:bg-gray-100 ${!canNavigateProgressRight ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="space-y-1">
          {filteredTrainings
            .slice(progressIndex, progressIndex + 2)
            .map((training, index) => (
              <TrainingComparison
                key={training._id || training.id || index}
                training={training}
                previousTraining={index < filteredTrainings.length - 1 ? filteredTrainings[progressIndex + index + 1] : null}
              />
            ))}
        </div>
      </div>
    </div>
  );
}