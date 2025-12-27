import React, { useState, useRef, useEffect, useMemo } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

function TrainingRow({ training, activity, trainingId, sport, date, averagePace, status, onTrainingClick }) {
  // Omezíme délku názvu tréninku na 20 znaků
  const truncatedTraining = training.length > 18 ? training.substring(0, 18) + '..' : training;
  
  const handleClick = () => {
    // Pass the full activity object if available, otherwise use trainingId
    if (activity) {
      onTrainingClick(activity);
    } else if (trainingId) {
      onTrainingClick({ _id: trainingId, title: training });
    }
  };

  const getStatusIcon = (status) => {
    const icons = {
      up: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ca42b61d339a69e3bb2cc02efb61369c67cfc2f39658e99e5d576df14fcdfcd9?",
      down: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/03f5e1c239b86d526fe7a81e7008e0b47bb861a21531b26f903e6750497c90ce?",
    };
    return icons[status];
  };

  const getBackgroundColor = (status) => {
    const colors = {
      up: "bg-green-500 text-green bg-opacity-10",
      down: "bg-red-500 text-red-500 bg-opacity-10",
      same: "bg-gray-200 text-gray-600"
    };
    return colors[status];
  };

  return (
    <>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div 
          className="self-stretch py-1.5 sm:py-2.5 px-1 w-full text-xs sm:text-sm font-semibold border-b text-center border-gray-200 cursor-pointer hover:bg-blue-50 hover:text-secondary transition-colors duration-200"
          onClick={handleClick}
        >
          {truncatedTraining}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto whitespace-nowrap basis-0">
        <div className="self-stretch px-1 sm:px-4 py-1.5 sm:py-2.5 w-full border-b text-center border-gray-200 text-xs sm:text-sm">
          {sport ? sport.charAt(0).toUpperCase() + sport.slice(1) : '-'}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div className="self-stretch px-1 sm:px-4 py-1.5 sm:py-2.5 w-full border-b text-center border-gray-200 text-xs sm:text-sm">
          {date}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto text-xs sm:text-sm text-green-600 basis-0">
        <div className="flex justify-center items-center py-1.5 sm:py-1.5 w-full text-center border-b border-gray-200">
          <div
            className={`flex gap-1 items-center self-stretch p-0.5 sm:p-1 my-auto rounded-md ${getBackgroundColor(
              status
            )}`}
          >
            {status !== "same" && (
              <img
                loading="lazy"
                src={getStatusIcon(status)}
                alt=""
                className="object-contain shrink-0 self-stretch my-auto w-2 sm:w-3 aspect-square"
              />
            )}
            <div className="self-stretch my-auto text-xs sm:text-sm">{averagePace}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function TableHeader({ selectedSport }) {
  // Dynamic header based on selected sport
  const getHeaderLabel = () => {
    if (selectedSport === 'all') return "Avg pace";
    const sport = selectedSport?.toLowerCase() || '';
    if (sport === 'cycling' || sport === 'bike' || sport === 'ride' || sport === 'virtualride') {
      return "Watts";
    } else if (sport === 'running' || sport === 'run') {
      return "Avg pace";
    } else if (sport === 'swimming' || sport === 'swim') {
      return "Avg pace";
    }
    return "Avg pace";
  };
  
  const headers = ["Training", "Sport", "Date", getHeaderLabel()];
  
  return headers.map((header) => (
    <div key={header} className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
      <div className="flex gap-1 sm:gap-2.5 items-center py-1.5 sm:py-2.5 px-1 sm:px-4 w-full font-medium text-gray-900 whitespace-nowrap bg-white border-t border-b text-center justify-center border-gray-200 text-xs sm:text-sm">
        <div className="gap-1 self-stretch my-auto">{header}</div>
      </div>
    </div>
  ));
}

function convertPowerToPace(seconds, sport) {
  if (!sport) return `${seconds}`;
  
  const sportLower = sport.toLowerCase();
  
  // Cycling - show watts
  if (sportLower === "cycling" || sportLower === "bike" || sportLower === "ride" || sportLower === "virtualride") {
    return `${seconds} W`;
  }

  // Running and Swimming - show tempo
  // Převeďme celkový čas v sekundách na minuty a sekundy
  const minutes = Math.floor(seconds / 60); // Celkové minuty
  const remainingSeconds = seconds % 60; // Zbytek sekund

  // Formátování na mm:ss (přidáme nulu, pokud jsou sekundy jednociferné)
  const formattedPace = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  if (sportLower === "running" || sportLower === "run") {
    return `${formattedPace} min/km`; // Pro běh
  } else if (sportLower === "swimming" || sportLower === "swim") {
    return `${formattedPace} min/100m`; // Pro plavání
  } else {
    return formattedPace; // Default pro jiné sporty
  }
}

export default function TrainingTable({ 
  trainings = [], 
  calendarData = [], 
  selectedSport = 'all', 
  onSportChange,
  onActivitySelect 
}) {
  // Normalize sport names - map different variants to unified names
  const normalizeSport = (sport) => {
    if (!sport) return null;
    const sportLower = sport.toLowerCase();
    // Cycling variants
    if (sportLower === 'cycling' || sportLower === 'bike' || sportLower === 'ride' || sportLower === 'virtualride') {
      return 'cycling';
    }
    // Running variants
    if (sportLower === 'running' || sportLower === 'run') {
      return 'running';
    }
    // Swimming variants
    if (sportLower === 'swimming' || sportLower === 'swim') {
      return 'swimming';
    }
    // Return lowercase version for other sports
    return sportLower;
  };

  // Combine trainings and calendarData (Strava + FIT activities)
  const allActivities = useMemo(() => {
    const combined = [];
    
    // Add FIT trainings
    trainings.forEach(t => {
      combined.push({
        ...t,
        type: 'fit',
        _id: t._id,
        date: t.date || t.timestamp,
        title: t.title || t.titleManual || t.titleAuto || 'Untitled Training',
        sport: normalizeSport(t.sport),
        category: t.category
      });
    });
    
    // Add calendarData (Strava + FIT from calendar)
    calendarData.forEach(act => {
      // Skip if already added from trainings
      if (act.type === 'fit' && trainings.some(t => t._id === act._id)) {
        return;
      }
      combined.push({
        ...act,
        date: act.date || act.startDate || act.timestamp,
        title: act.title || act.titleManual || act.name || 'Untitled Activity',
        sport: normalizeSport(act.sport),
        category: act.category
      });
    });
    
    return combined;
  }, [trainings, calendarData]);
  
  // Get available sports from all activities (normalized)
  const availableSports = [...new Set(allActivities.map(t => t.sport).filter(Boolean))].sort();
  // Get available categories from all activities
  const availableCategories = [...new Set(allActivities.map(t => t.category).filter(Boolean))];
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(6);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const settingsRef = useRef(null);
  const navigate = useNavigate();

  const handleSportChange = (sport) => {
    if (onSportChange) {
      onSportChange(sport);
    }
  };

  const handleTrainingClick = (activity) => {
    // If onActivitySelect callback is provided, use it to show in calendar
    if (onActivitySelect) {
      onActivitySelect(activity);
    } else {
      // Navigate to FitAnalysisPage with appropriate ID
      if (activity.type === 'fit' && activity._id) {
        navigate(`/fit-analysis?trainingId=${activity._id}`);
      } else if (activity.type === 'strava' && (activity.stravaId || activity.id)) {
        navigate(`/fit-analysis?stravaId=${activity.stravaId || activity.id}`);
      } else if (activity._id) {
        // For regular trainings (Training model), use trainingId
        navigate(`/fit-analysis?trainingId=${activity._id}`);
      }
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!allActivities || allActivities.length === 0) {
    return <div className="text-center py-4">No trainings available</div>;
  }

  // Filtrujeme tréninky podle sportu, kategorie a seřadíme podle data
  // Normalize selectedSport for comparison
  const normalizedSelectedSport = selectedSport === 'all' ? 'all' : normalizeSport(selectedSport);
  
  const filteredTrainings = allActivities
    .filter(t => {
      const sportMatch = normalizedSelectedSport === 'all' || t.sport === normalizedSelectedSport;
      const categoryMatch = selectedCategory === 'all' || t.category === selectedCategory;
      return sportMatch && categoryMatch;
    })
    .sort((a, b) => {
      const dateA = new Date(a.date || a.startDate || a.timestamp || 0);
      const dateB = new Date(b.date || b.startDate || b.timestamp || 0);
      return dateB - dateA;
    })
    .slice(0, displayCount);  // Použijeme nastavený počet tréninků

  // Parse pace from mm:ss format to seconds for comparison
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

  const formattedTrainings = filteredTrainings.map((item, index, array) => {
    // Calculate average value based on activity type
    let averageValue;
    
    const itemSport = item.sport?.toLowerCase() || '';
    
    // Check if item has results/records (for both FIT and Strava with processed data)
    const hasResults = (item.results && item.results.length > 0) || (item.records && item.records.length > 0);
    const resultsToUse = item.results || item.records || [];
    
    if (hasResults && (itemSport === 'running' || itemSport === 'run' || itemSport === 'swimming' || itemSport === 'swim')) {
      // If we have results/records, calculate from them (same as TrainingStats)
      // For running/swimming: power field contains pace in mm:ss format
      const paces = resultsToUse
        .map(r => parsePaceToSeconds(r.power))
        .filter(p => p !== null && p > 0);
      averageValue = paces.length > 0 
        ? Math.round(paces.reduce((sum, p) => sum + p, 0) / paces.length)
        : 0;
    } else if (item.type === 'strava') {
      // Strava activities without results - calculate from average_speed
      if (itemSport === 'running' || itemSport === 'run') {
        // For running, calculate pace from average_speed
        // Strava average_speed is in m/s, convert to pace (seconds per km)
        if (item.average_speed && item.average_speed > 0) {
          // Convert m/s to seconds per km: 1000 / (m/s) = seconds per km
          averageValue = Math.round(1000 / item.average_speed);
        } else if (item.averagePace) {
          // If averagePace is already in seconds, use it
          averageValue = typeof item.averagePace === 'number' ? item.averagePace : parsePaceToSeconds(item.averagePace) || 0;
        } else if (item.avgPace) {
          averageValue = typeof item.avgPace === 'number' ? item.avgPace : parsePaceToSeconds(item.avgPace) || 0;
        } else {
          averageValue = 0;
        }
      } else if (itemSport === 'swimming' || itemSport === 'swim') {
        // For swimming, calculate pace from average_speed
        if (item.average_speed && item.average_speed > 0) {
          // Convert m/s to seconds per 100m: 100 / (m/s) = seconds per 100m
          averageValue = Math.round(100 / item.average_speed);
        } else if (item.averagePace) {
          averageValue = typeof item.averagePace === 'number' ? item.averagePace : parsePaceToSeconds(item.averagePace) || 0;
        } else {
          averageValue = 0;
        }
      } else {
        // For cycling and other sports, use average power
        averageValue = item.avgPower || item.averagePower || item.average_watts || 0;
      }
    } else {
      // FIT trainings - calculate from results (same logic as TrainingStats)
      if (itemSport === 'running' || itemSport === 'run') {
        // For running: power field contains pace in mm:ss format
        const paces = (item.results || [])
          .map(r => parsePaceToSeconds(r.power))
          .filter(p => p !== null && p > 0);
        averageValue = paces.length > 0 
          ? Math.round(paces.reduce((sum, p) => sum + p, 0) / paces.length)
          : 0;
      } else if (itemSport === 'swimming' || itemSport === 'swim') {
        // For swimming: power field contains pace in mm:ss format
        const paces = (item.results || [])
          .map(r => parsePaceToSeconds(r.power))
          .filter(p => p !== null && p > 0);
        averageValue = paces.length > 0 
          ? Math.round(paces.reduce((sum, p) => sum + p, 0) / paces.length)
          : 0;
      } else {
        // For cycling and other sports: power field contains watts
        const results = item.results || [];
        const powers = results
          .map(r => Number(r.power))
          .filter(p => !isNaN(p) && p > 0);
        averageValue = powers.length > 0
          ? Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length)
          : 0;
      }
    }

    // Porovnání s předchozím tréninkem stejného typu
    const previousTraining = array
      .slice(index + 1)
      .find(t => (t.title === item.title || t.name === item.title) && t.sport === item.sport);
    
    let status = "same";
    if (previousTraining) {
      let previousValue;
      
      const prevSport = previousTraining.sport?.toLowerCase() || '';
      
      if (previousTraining.type === 'strava') {
        if (prevSport === 'running' || prevSport === 'run') {
          if (previousTraining.average_speed && previousTraining.average_speed > 0) {
            previousValue = Math.round(1000 / previousTraining.average_speed);
          } else {
            previousValue = typeof previousTraining.averagePace === 'number' 
              ? previousTraining.averagePace 
              : parsePaceToSeconds(previousTraining.averagePace || previousTraining.avgPace) || 0;
          }
        } else if (prevSport === 'swimming' || prevSport === 'swim') {
          if (previousTraining.average_speed && previousTraining.average_speed > 0) {
            previousValue = Math.round(100 / previousTraining.average_speed);
          } else {
            previousValue = typeof previousTraining.averagePace === 'number' 
              ? previousTraining.averagePace 
              : parsePaceToSeconds(previousTraining.averagePace || previousTraining.avgPace) || 0;
          }
        } else {
          previousValue = previousTraining.avgPower || previousTraining.averagePower || previousTraining.average_watts || 0;
        }
      } else {
        if (prevSport === 'running' || prevSport === 'run' || prevSport === 'swimming' || prevSport === 'swim') {
          const previousPaces = (previousTraining.results || [])
            .map(r => parsePaceToSeconds(r.power))
            .filter(p => p !== null && p > 0);
          previousValue = previousPaces.length > 0
            ? Math.round(previousPaces.reduce((sum, p) => sum + p, 0) / previousPaces.length)
            : 0;
        } else {
          const prevResults = previousTraining.results || [];
          previousValue = prevResults.length > 0
            ? Math.round(prevResults.reduce((sum, r) => sum + (parseFloat(r.power) || 0), 0) / prevResults.length)
            : 0;
        }
      }
      
      if (itemSport === 'running' || itemSport === 'run' || itemSport === 'swimming' || itemSport === 'swim') {
        // Pro běh a plavání: rychlejší tempo (menší číslo) = lepší = "up" (zeleně)
        if (averageValue < previousValue) status = "up";
        else if (averageValue > previousValue) status = "down";
      } else {
        // Pro ostatní sporty: vyšší power = lepší
        if (averageValue > previousValue) status = "up";
        else if (averageValue < previousValue) status = "down";
      }
    }

    // Format pace/power for display
    // Only format if we have a valid value
    const pace = averageValue > 0 ? convertPowerToPace(averageValue, item.sport) : '-';

    return {
      training: item.title || item.name || 'Untitled',
      activity: item, // Pass full activity object for onActivitySelect
      sport: item.sport,
      date: new Date(item.date || item.startDate || item.timestamp || Date.now()).toLocaleDateString(),
      averagePace: pace,
      status,
    };
  });

  return (
    <div className="flex flex-col justify-start p-2 sm:p-5 bg-white rounded-3xl shadow-md h-full">
      <div className="flex flex-col w-full max-md:max-w-full">
        <div className="flex flex-col px-2 sm:px-5 pb-2 sm:pb-3.5 w-full max-md:max-w-full">
          <div className="flex flex-wrap gap-3 sm:gap-10 items-center w-full max-md:max-w-full">
            <div className="flex-1 shrink self-stretch my-auto text-base sm:text-lg font-semibold leading-loose text-gray-900 basis-3.5">
              {selectedCategory === 'all' 
                ? 'View last trainings by categories'
                : `View last trainings ${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} category`}
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
             
              <button 
                onClick={() => window.location.href = "/training"}
                className="flex overflow-hidden gap-1 items-center self-stretch py-0.5  my-auto text-xs sm:text-base text-secondary bg-white rounded min-h-[24px] sm:min-h-[28px]"
              >
                <div className="self-stretch my-auto">View more</div>
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/d5620c00b89d258c2df851956089e1cf63163537c904e90b0ae529b03aba7f72?"
                  alt=""
                  className="object-contain shrink-0 self-stretch my-auto w-3 sm:w-4 aspect-square"
                />
              </button>
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="p-1 sm:p-2 hover:bg-gray-100 rounded-full"
                >
                  <EllipsisVerticalIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </button>
                
                {isSettingsOpen && (
                  <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-2">
                      <div className="mb-2 sm:mb-3">
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Category</label>
                        <div className="relative">
                          <select 
                            className="w-full border border-gray-300 rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                            style={{ WebkitAppearance: 'none', appearance: 'none' }}
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                          >
                            <option value="all">All Categories</option>
                            {availableCategories.map((category) => (
                              <option key={category} value={category}>
                                {category.charAt(0).toUpperCase() + category.slice(1)}
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
                      <div className="mb-2 sm:mb-3">
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Sport</label>
                        <div className="relative">
                          <select 
                            className="w-full border border-gray-300 rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                            style={{ WebkitAppearance: 'none', appearance: 'none' }}
                            value={selectedSport}
                            onChange={(e) => handleSportChange(e.target.value)}
                          >
                            {availableSports.length > 1 && (
                              <option value="all">All Sports</option>
                            )}
                            {availableSports.map((sport) => (
                              <option key={sport} value={sport}>
                                {sport === 'cycling' ? 'Cycling' : 
                                 sport === 'running' ? 'Running' : 
                                 sport === 'swimming' ? 'Swimming' :
                                 sport.charAt(0).toUpperCase() + sport.slice(1)}
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
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Number of trainings</label>
                        <div className="relative">
                          <select 
                            className="w-full border border-gray-300 rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                            style={{ WebkitAppearance: 'none', appearance: 'none' }}
                            value={displayCount}
                            onChange={(e) => setDisplayCount(Number(e.target.value))}
                          >
                            {[3, 6, 9, 12].map((count) => (
                              <option key={count} value={count}>
                                {count} trainings
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
        </div>
        <div className="grid grid-cols-4 gap-y-1 sm:gap-y-2 w-full text-xs sm:text-base text-gray-600">
          <TableHeader selectedSport={selectedSport} />
          {formattedTrainings.map((training, index) => (
            <TrainingRow 
              key={index} 
              {...training} 
              onTrainingClick={handleTrainingClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
