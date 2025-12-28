import React, { useMemo, useState, useEffect, useRef } from "react";
import { DropdownMenu } from "../DropDownMenu";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { formatDistanceForUser } from "../../utils/unitsConverter";

const maxGraphHeight = 200;

function StatCard({ stats }) {
  return (
    <div className="flex flex-col text-[10px] sm:text-xs rounded-none max-w-[160px] sm:max-w-[192px]" >
      <div className="flex z-10 flex-col justify-center items-center px-2 sm:px-3 py-1.5 sm:py-2 text-center bg-white rounded-lg border border-solid border-slate-100 shadow-[0px_12px_20px_rgba(0,0,0,0.1)] text-stone-500">
        {stats
          .filter(stat => stat.value && stat.value !== "-")
          .map((stat, index) => (
            <div
              key={`stat-${index}`}
              className={stat.unit === "W" ? "font-semibold text-gray-900" : ""}
            >
              {stat.label}: {stat.value} {stat.unit}
            </div>
          ))}
          
      </div>
      <div className="flex shrink-0 self-center mt-2 sm:mt-3 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 bg-violet-500 rounded-full border-solid border-[2px] sm:border-[3px] border-zinc-50" />
    </div>
  );
}

function VerticalBar({ height, color, power, pace, distance, heartRate, lactate, duration, index, isHovered, onHover, totalTrainings, visibleTrainings, minPower, maxPower, minPace, maxPace, containerWidth, selectedTraining, displayCount, isFullWidth, sport, user = null }) {
  const getWidth = () => {
    // Najdeme všechny tréninky stejného typu
    const sameTypeTrainings = visibleTrainings.filter(t => t.title === selectedTraining);
    
    // Najdeme nejdelší interval napříč všemi tréninky stejného typu
    const maxDuration = Math.max(...sameTypeTrainings.flatMap(t => 
      t.results.map(r => {
        const dur = r.duration;
        if (typeof dur === 'string' && (dur.includes('km') || dur.includes('m'))) {
          const match = dur.match(/^([\d.]+)\s*(km|m)$/i);
          if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            return unit === 'km' ? value : value / 1000;
          }
        }
        return Number(dur) || 0;
      })
    ));

    // Vypočítáme poměr vůči nejdelšímu intervalu
    const currentDuration = (() => {
      const dur = duration;
      if (typeof dur === 'string' && (dur.includes('km') || dur.includes('m'))) {
        const match = dur.match(/^([\d.]+)\s*(km|m)$/i);
        if (match) {
          const value = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          return unit === 'km' ? value : value / 1000;
        }
      }
      return Number(dur) || 0;
    })();
    
    const durationRatio = maxDuration > 0 ? currentDuration / maxDuration : 0.5;
    
    // Celkový počet intervalů napříč všemi zobrazenými tréninky
    const totalIntervals = visibleTrainings.reduce((sum, t) => sum + t.results.length, 0);
    
    // Počet intervalů v nejdelším tréninku (pro poměrové škálování)
    const maxIntervalsInTraining = Math.max(...visibleTrainings.map(t => t.results.length));
    
    // Vypočítáme dostupnou šířku pro celý graf (s rezervou pro padding a mezery)
    const availableWidth = containerWidth * 0.95; // 95% pro sloupce, 5% pro padding
    
    // Základní šířka - závisí na celkovém počtu intervalů
    // Čím více intervalů, tím užší základní šířka
    let baseWidth, maxWidth;
    
    // Vypočítáme optimální šířku na základě celkového počtu intervalů
    // Čím více intervalů, tím užší sloupce
    const optimalWidthPerInterval = availableWidth / totalIntervals;
    
    // Minimální a maximální šířka podle počtu intervalů
    let minWidth, calculatedMaxWidth;
    
    if (window.innerWidth < 640) {
      // Mobilní zařízení
      if (totalIntervals <= 5) {
        minWidth = 6;
        calculatedMaxWidth = 12;
      } else if (totalIntervals <= 10) {
        minWidth = 4;
        calculatedMaxWidth = 8;
      } else if (totalIntervals <= 20) {
        minWidth = 3;
        calculatedMaxWidth = 6;
      } else {
        minWidth = 2;
        calculatedMaxWidth = 4;
      }
    } else {
      // Desktop
      if (totalIntervals <= 5) {
        minWidth = 10;
        calculatedMaxWidth = 20;
      } else if (totalIntervals <= 10) {
        minWidth = 8;
        calculatedMaxWidth = 16;
      } else if (totalIntervals <= 20) {
        minWidth = 6;
        calculatedMaxWidth = 12;
      } else if (totalIntervals <= 30) {
        minWidth = 4;
        calculatedMaxWidth = 8;
      } else {
        minWidth = 3;
        calculatedMaxWidth = 6;
      }
    }
    
    // Základní šířka je optimální šířka omezená minimem a maximem
    baseWidth = Math.max(minWidth, Math.min(calculatedMaxWidth, optimalWidthPerInterval * 0.9));
    
    // Maximální šířka s ohledem na poměr délky intervalu
    maxWidth = Math.max(minWidth, Math.min(calculatedMaxWidth, optimalWidthPerInterval * 1.5));
    
    // Upravíme šířku podle poměru délky intervalu
    // Delší intervaly jsou širší, ale stále se musí vejít
    const adjustedWidth = baseWidth + (durationRatio * (maxWidth - baseWidth));
    
    // Zajistíme, že se všechny sloupce vejdou
    // Maximální možná šířka = dostupná šířka / počet intervalů v nejdelším tréninku
    const maxPossibleWidth = availableWidth / maxIntervalsInTraining * 0.95;
    
    return Math.max(minWidth, Math.min(adjustedWidth, maxPossibleWidth));
  };

  const width = getWidth();

  const formatPace = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}/km`;
  };

  // Parse distance from various formats (1km, 1000m, etc.) to km
  const parseDistanceToKm = (value) => {
    if (!value) return null;
    
    // If it's already a number, assume it's in km (don't auto-convert large numbers)
    if (typeof value === 'number') {
      return value;
    }
    
    // If it's a string with units
    if (typeof value === 'string') {
      // Remove whitespace and convert to lowercase
      const cleanValue = value.trim().toLowerCase();
      
      // Match patterns like "1km", "1 km", "1000m", "1000 m", "1.5km", etc.
      const kmMatch = cleanValue.match(/^([\d.]+)\s*km$/);
      if (kmMatch) {
        return parseFloat(kmMatch[1]);
      }
      
      const mMatch = cleanValue.match(/^([\d.]+)\s*m$/);
      if (mMatch) {
        return parseFloat(mMatch[1]) / 1000; // Convert meters to km
      }
      
      // Try to parse as number
      // Only assume meters if it's a whole number > 100 and looks like meters (no decimals)
      const numValue = parseFloat(cleanValue);
      if (!isNaN(numValue)) {
        // If it's a whole number > 100 with no decimal point, likely meters
        if (numValue > 100 && numValue % 1 === 0 && !cleanValue.includes('.')) {
          return numValue / 1000;
        }
        // Otherwise assume km (could be 1.5, 2.3, etc. or already in km)
        return numValue;
      }
    }
    
    return null;
  };

  const formatDistance = (value) => {
    if (!value) return null;
    
    // Parse to km first
    const kmValue = parseDistanceToKm(value);
    if (kmValue === null) return null;
    
    // Use user's units preference if available
    if (user) {
      // Convert km to meters for formatDistanceForUser
      const meters = kmValue * 1000;
      return formatDistanceForUser(meters, user);
    }
    
    // Fallback to metric
    // If it's already a string with units, return it as is (but normalized)
    if (typeof value === 'string' && (value.includes('km') || value.includes('m'))) {
      // Normalize: if less than 1km, show in meters, otherwise in km
      if (kmValue < 1) {
        return `${Math.round(kmValue * 1000)}m`;
      }
      return `${kmValue.toFixed(1)}km`;
    }
    
    // If it's a number or parsed value
    if (kmValue < 1) {
      return `${Math.round(kmValue * 1000)}m`;
    }
    return `${kmValue.toFixed(1)}km`;
  };

  const formatDurationDisplay = (durationValue) => {
    if (!durationValue) return null;
    // If it's already a string with units (e.g., "1 km"), return it as is
    if (typeof durationValue === 'string' && (durationValue.includes('km') || durationValue.includes('m'))) {
      return durationValue;
    }
    // If it's a number, format as time
    const numValue = Number(durationValue);
    if (!isNaN(numValue)) {
      const minutes = Math.floor(numValue / 60);
      const remainingSeconds = numValue % 60;
      return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    return durationValue;
  };

  return (
    <div
      className="relative flex justify-center shrink-0 h-full"
      style={{ width: `${width}px` }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div
        className={`w-full rounded-sm ${color} transition-all duration-200 absolute bottom-0 cursor-pointer hover:opacity-90`}
        style={{ 
          height: `${Math.max(height, 3)}px`,
          opacity: isHovered ? 1 : 0.7,
          zIndex: 20
        }}
      />
      
      {isHovered && (
        <div 
          className="absolute left-1/2 transform -translate-x-1/2 z-50 pointer-events-none"
          style={{
            bottom: `${height - 10}px`,
            minWidth: "140px"
          }}  
        >
          <StatCard
            stats={[
              { label: "Interval", value: `#${index + 1}`, unit: "" },
              ...(duration ? [{ label: "Duration", value: formatDurationDisplay(duration), unit: "" }] : []),
              ...(sport === 'run' && power ? [{ label: "Pace", value: typeof power === 'string' ? `${power}/km` : formatPace(power), unit: "" }] : []),
              ...(sport === 'run' && distance ? [{ label: "Distance", value: formatDistance(distance), unit: "" }] : []),
              // Parse distance from duration if it's a distance type
              ...(sport === 'run' && duration && typeof duration === 'string' && (duration.includes('km') || duration.includes('m')) ? [{ label: "Distance", value: formatDistance(duration), unit: "" }] : []),
              ...(sport !== 'run' && power ? [{ label: "Power", value: power, unit: "W" }] : []),
              ...(heartRate ? [{ label: "Heart Rate", value: heartRate, unit: "Bpm" }] : []),
              ...(lactate ? [{ label: "Lactate", value: lactate, unit: "mmol/L" }] : []),
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Scale({ values, unit, formatValue, isPace = false }) {
  // For pace: fastest (smallest) at top, slowest (largest) at bottom
  // values array: [minPace, ..., maxPace] -> display: [minPace, ..., maxPace] (no reverse)
  const displayValues = values;
  
  return (
    <div className="relative flex flex-col justify-between py-2 sm:py-2 w-8 sm:w-12 text-[10px] sm:text-sm text-right whitespace-nowrap min-h-[150px] sm:min-h-[200px] text-zinc-500">
      {displayValues.map((value, index) => (
        <div key={`scale-${unit}-${index}`} className="relative flex items-center w-full">
          <div className="absolute left-0 right-0 h-px border-t border-dashed border-gray-200" />
          <span className="relative z-10 bg-white px-0.5 sm:px-1">{formatValue ? formatValue(value) : `${value}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

function TrainingComparison({ training, previousTraining, sport }) {
  const getAveragePower = (results) => {
    const powers = results.map(r => Number(r.power)).filter(p => !isNaN(p) && p > 0);
    return powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b) / powers.length) : 0;
  };

  const getAveragePace = (results) => {
    // Power u běhu je pace v mm:ss formátu
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
    const paces = results.map(r => parsePaceToSeconds(r.power)).filter(p => p !== null && p > 0);
    return paces.length > 0 ? Math.round(paces.reduce((a, b) => a + b) / paces.length) : 0;
  };

  const formatPace = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}/km`;
  };

  const currentAvgPower = getAveragePower(training.results);
  const previousAvgPower = previousTraining ? getAveragePower(previousTraining.results) : 0;
  const powerDiff = currentAvgPower - previousAvgPower;

  const currentAvgPace = getAveragePace(training.results);
  const previousAvgPace = previousTraining ? getAveragePace(previousTraining.results) : 0;
  const paceDiff = currentAvgPace - previousAvgPace;
  
  const getTrendIcon = (diff, isPace = false) => {
    // Pro pace: nižší pace (rychlejší) = lepší, takže opačně
    if (isPace) {
      if (diff < 0) return "↑"; // Rychlejší = lepší
      if (diff > 0) return "↓"; // Pomalejší = horší
      return "→";
    }
    // Pro power: vyšší = lepší
    if (diff > 0) return "↑";
    if (diff < 0) return "↓";
    return "→";
  };

  const getTrendColor = (diff, isPace = false) => {
    // Pro pace: nižší pace (rychlejší) = lepší, takže opačně
    if (isPace) {
      if (diff < 0) return "text-green-500"; // Rychlejší = lepší
      if (diff > 0) return "text-red-500"; // Pomalejší = horší
      return "text-gray-500";
    }
    // Pro power: vyšší = lepší
    if (diff > 0) return "text-green-500";
    if (diff < 0) return "text-red-500";
    return "text-gray-500";
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 py-1 sm:py-1.5 px-2 sm:px-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="text-xs sm:text-sm font-medium text-gray-900">
          {new Date(training.date).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'numeric',
            year: '2-digit'
          })}
        </div>
        <div className="text-[10px] sm:text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[150px]">{training.title}</div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="text-xs sm:text-sm whitespace-nowrap">
          <span className="text-gray-500">Avg: </span>
          {sport === 'run' ? (
            <>
              <span className="font-medium">{formatPace(currentAvgPace)}</span>
              {previousTraining && (
                <span className={`ml-1 sm:ml-2 ${getTrendColor(paceDiff, true)}`}>
                  {getTrendIcon(paceDiff, true)} {formatPace(Math.abs(paceDiff))}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="font-medium">{currentAvgPower}W</span>
              {previousTraining && (
                <span className={`ml-1 sm:ml-2 ${getTrendColor(powerDiff)}`}>
                  {getTrendIcon(powerDiff)} {Math.abs(powerDiff)}W
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function TrainingStats({ trainings, selectedSport, onSportChange, selectedTitle, setSelectedTitle, selectedTrainingId, setSelectedTrainingId, isFullWidth = false, user = null }) {
  // Get available sports from trainings
  const availableSports = [...new Set(trainings.map(t => t.sport))].filter(Boolean);
  
  // Initialize selectedSport with localStorage or default to 'all' if not provided
  const [internalSelectedSport, setInternalSelectedSport] = useState(() => {
    if (selectedSport !== undefined && selectedSport !== null) return selectedSport;
    const saved = localStorage.getItem('trainingStats_selectedSport');
    return saved || 'all';
  });
  
  // Use external selectedSport if provided, otherwise use internal
  const currentSelectedSport = selectedSport !== undefined && selectedSport !== null ? selectedSport : internalSelectedSport;
  
  // Fallback pro onSportChange, pokud není poskytnut
  const handleSportChange = (sport) => {
    // Save to localStorage only when uncontrolled (otherwise parent decides persistence)
    if (selectedSport === undefined || selectedSport === null) {
      localStorage.setItem('trainingStats_selectedSport', sport);
    }
    // Update internal state if not controlled by parent
    if (selectedSport === undefined || selectedSport === null) {
      setInternalSelectedSport(sport);
    }
    // Call parent callback if provided
    if (onSportChange) {
      onSportChange(sport);
    } else {
      console.warn('onSportChange not provided, sport change ignored:', sport);
    }
  };
  
  // Use external selectedTitle if provided, otherwise use internal state
  const [internalSelectedTitle, setInternalSelectedTitle] = useState(null);
  const currentSelectedTitle = selectedTitle !== undefined ? selectedTitle : internalSelectedTitle;
  const setCurrentSelectedTitle = setSelectedTitle || setInternalSelectedTitle;
  const [hoveredBar, setHoveredBar] = useState(null);
  const [visibleTrainingIndex, setVisibleTrainingIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(() => {
    // Set default to 3 on mobile devices
    return window.innerWidth < 768 ? 3 : 6;
  });
  const [progressIndex, setProgressIndex] = useState(0);
  const settingsRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

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
      const relevantTrainings = currentSelectedSport === 'all' 
        ? trainings 
        : trainings.filter(t => t.sport === currentSelectedSport);
      if (relevantTrainings.length > 0) {
        const firstTitle = relevantTrainings[0].title;
        if (!currentSelectedTitle || !relevantTrainings.some(t => t.title === currentSelectedTitle)) {
          setCurrentSelectedTitle(firstTitle);
          // Najdeme nejnovější trénink s tímto názvem
          const trainingsWithTitle = relevantTrainings
            .filter(t => t.title === firstTitle)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
          if (trainingsWithTitle.length > 0 && setSelectedTrainingId) {
            setSelectedTrainingId(trainingsWithTitle[0]._id);
          }
        }
      }
    }
  }, [trainings, currentSelectedSport, currentSelectedTitle, setCurrentSelectedTitle, setSelectedTrainingId]);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const trainingOptions = useMemo(() => {
    const uniqueTitles = [...new Set(
      trainings
        .filter(t => currentSelectedSport === 'all' || t.sport === currentSelectedSport)
        .map(t => t.title)
    )];

    return uniqueTitles.map(title => ({
      value: title,
      label: title
    }));
  }, [trainings, currentSelectedSport]);

  const filteredTrainings = useMemo(() => {
    // Filter trainings by sport and title
    const filtered = trainings
      .filter(t => (currentSelectedSport === 'all' || t.sport === currentSelectedSport) && t.title === currentSelectedTitle)
      // Sort by date from newest to oldest
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return filtered;
  }, [trainings, currentSelectedSport, currentSelectedTitle]);
  
  // Handler pro změnu názvu tréninku - synchronizace s TrainingGraph
  const handleTrainingTitleChange = (newTitle) => {
    setCurrentSelectedTitle(newTitle);
    // Najdeme nejnovější trénink s tímto názvem
    const trainingsWithTitle = trainings
      .filter(t => (currentSelectedSport === 'all' || t.sport === currentSelectedSport) && t.title === newTitle)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (trainingsWithTitle.length > 0 && setSelectedTrainingId) {
      setSelectedTrainingId(trainingsWithTitle[0]._id);
    }
  };

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

  const formatPaceValue = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}/km`;
  };

  // Parse pace from mm:ss format to seconds
  const parsePaceToSeconds = (paceValue) => {
    if (!paceValue) return null;
    // If it's already a number (seconds), return it
    if (typeof paceValue === 'number') return paceValue;
    // If it's a string in mm:ss format
    if (typeof paceValue === 'string') {
      const parts = paceValue.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        if (!isNaN(minutes) && !isNaN(seconds)) {
          return minutes * 60 + seconds;
        }
      }
      // Try to parse as number
      const num = Number(paceValue);
      if (!isNaN(num)) return num;
    }
    return null;
  };

  // Determine if we should show pace (for run) or power (for other sports)
  // For 'all' sport, check if there are any run trainings in the filtered data
  const hasRunTrainings = filteredTrainings.some(t => t.sport === 'run');
  const isRun = currentSelectedSport === 'run' || (currentSelectedSport === 'all' && hasRunTrainings);

  const { powerValues, paceValues, minPower, maxPower, minPace, maxPace, averagePower, averagePace } = useMemo(() => {
    if (filteredTrainings.length === 0) return { 
      powerValues: [], 
      paceValues: [],
      heartRateValues: [], 
      minPower: 0, 
      maxPower: 100,
      minPace: 0,
      maxPace: 600,
      minHeartRate: 0, 
      maxHeartRate: 200,
      averagePower: [],
      averagePace: [],
      averageHeartRate: []
    };
  
    if (isRun) {
      // Pro běh: používáme pace z power pole (uložené jako mm:ss string)
      const allPaces = filteredTrainings.flatMap((t) => 
        t.results.map((r) => {
          // Power u běhu je pace v mm:ss formátu
          const paceSeconds = parsePaceToSeconds(r.power);
          return paceSeconds !== null && paceSeconds > 0 ? paceSeconds : null;
        })
      ).filter(p => p !== null);

      const allHeartRates = filteredTrainings.flatMap((t) => 
        t.results.map((r) => {
          const hr = Number(r.heartRate);
          return !isNaN(hr) && hr > 0 ? hr : null;
        })
      ).filter(hr => hr !== null);

      const actualMinPace = allPaces.length > 0 ? Math.min(...allPaces) : 180; // 3:00/km
      const actualMaxPace = allPaces.length > 0 ? Math.max(...allPaces) : 600; // 10:00/km
      
      // Zaokrouhlíme na pěkné hodnoty (po 30 sekundách)
      const minPace = Math.floor(actualMinPace / 30) * 30;
      const maxPace = Math.ceil((actualMaxPace + 30) / 30) * 30;

      const rawMinHR = 0;
      const rawMaxHR = allHeartRates.length > 0 ? Math.max(...allHeartRates) : 200;
      const hrRange = rawMaxHR - rawMinHR;
      const hrPadding = hrRange * 0.2;
      
      const minHeartRate = 0;
      const maxHeartRate = Math.ceil((rawMaxHR + hrPadding) / 10) * 10;

      // Calculate averages for each training session
      const averagePace = filteredTrainings.map(training => {
        const paces = training.results.map(r => parsePaceToSeconds(r.power)).filter(p => p !== null && p > 0);
        return paces.length > 0 ? paces.reduce((a, b) => a + b) / paces.length : null;
      });

      const averageHeartRate = filteredTrainings.map(training => {
        const hrs = training.results.map(r => Number(r.heartRate)).filter(hr => !isNaN(hr) && hr > 0);
        return hrs.length > 0 ? hrs.reduce((a, b) => a + b) / hrs.length : null;
      });

      // Pro pace: nejrychlejší (nejmenší hodnota) nahoře, nejpomalejší (největší hodnota) dole
      // Takže reverse() není potřeba - minPace je nahoře, maxPace je dole
      return {
        powerValues: [],
        paceValues: Array.from({ length: 6 }, (_, i) => Math.round(minPace + (i * (maxPace - minPace)) / 5)),
        heartRateValues: Array.from({ length: 6 }, (_, i) => Math.round(minHeartRate + (i * (maxHeartRate - minHeartRate)) / 5)).reverse(),
        minPower: 0,
        maxPower: 100,
        minPace,
        maxPace,
        minHeartRate,
        maxHeartRate,
        averagePower: [],
        averagePace,
        averageHeartRate
      };
    } else {
      // Pro ostatní sporty: používáme power
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
        paceValues: [],
        heartRateValues: Array.from({ length: 6 }, (_, i) => Math.round(minHeartRate + (i * (maxHeartRate - minHeartRate)) / 5)).reverse(),
        minPower,
        maxPower,
        minPace: 0,
        maxPace: 600,
        minHeartRate,
        maxHeartRate,
        averagePower,
        averagePace: [],
        averageHeartRate
      };
    }
  }, [filteredTrainings, isRun]);
  
  const barColors = ["bg-violet-500", "bg-violet-400", "bg-violet-300", "bg-violet-200", "bg-violet-100"];




  return (
    <div className="flex flex-col p-3 sm:p-5 bg-white rounded-3xl shadow-md relative h-full">
      <div className="flex  flex-row  justify-between items-start sm:items-center gap-2 sm:gap-0 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <h2 className="text-base sm:text-xl font-semibold text-zinc-900">
            Last {filteredTrainings.length} trainings
          </h2>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleNavigateLeft}
              disabled={!canNavigateLeft}
              className={`p-1.5 sm:p-2 rounded-full ${canNavigateLeft ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNavigateRight}
              disabled={!canNavigateRight}
              className={`p-1.5 sm:p-2 rounded-full ${canNavigateRight ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <DropdownMenu
            selectedValue={currentSelectedTitle}
            options={trainingOptions}
            onChange={handleTrainingTitleChange}
            displayKey="label"
            valueKey="value"
          />
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full"
            >
              <EllipsisVerticalIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
            
            {isSettingsOpen && (
              <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-2">
                  <div className="mb-2 sm:mb-3">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Sport</label>
                    <div className="relative">
                      <select 
                        className="w-full border border-gray-300 rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                        value={currentSelectedSport || 'all'}
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
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Number of trainings</label>
                    <div className="relative">
                      <select 
                        className="w-full border border-gray-300 rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                        value={displayCount}
                        onChange={(e) => {
                          setDisplayCount(Number(e.target.value));
                          setVisibleTrainingIndex(0);
                        }}
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

      <div className="flex gap-1 sm:gap-2 items-stretch px-1 sm:px-1.5 relative w-full" 
           style={{ height: `${maxGraphHeight + 30}px` }}>
        {isRun ? (
          <Scale values={paceValues} unit="" formatValue={formatPaceValue} isPace={true} />
        ) : (
          <Scale values={powerValues} unit="W" formatValue={null} />
        )}
        
        <div ref={containerRef} className="relative flex-1 flex items-stretch justify-between min-w-0">
          {/* Grid lines */}
          <div className="absolute inset-0">
            {(isRun ? paceValues : powerValues).map((value, index) => {
              // For pace: fastest (index 0 = minPace) at top, slowest (last index = maxPace) at bottom
              // For power: normal order (highest at top)
              const displayIndex = index;
              return (
                <div key={`grid-line-${index}`} 
                     className="border-t border-dashed border-gray-200" 
                     style={{
                       top: `${(displayIndex * maxGraphHeight) / ((isRun ? paceValues : powerValues).length - 1) + 15}px`,
                       position: 'absolute',
                       width: '100%',
                       zIndex: 10
                     }}
                />
              );
            })}
          </div>

          {/* Average lines */}
          <svg className="absolute inset-0 z-30 pointer-events-none">
            <path
              d={(isRun ? averagePace : averagePower).filter(avg => avg !== null).map((avg, i) => {
                const x = (i * (100 / Math.max((isRun ? averagePace : averagePower).filter(avg => avg !== null).length - 1, 1)))+ '%';
                let y;
                if (isRun) {
                  // Pro pace: rychlejší pace (menší číslo) = nahoře (menší y)
                  // minPace je nahoře (rychlejší), maxPace je dole (pomalejší)
                  y = maxGraphHeight - ((avg - minPace) / (maxPace - minPace)) * maxGraphHeight;
                } else {
                  y = maxGraphHeight - ((avg - minPower) / (maxPower - minPower)) * maxGraphHeight;
                }
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }).join(' ')}
              stroke="#8B5CF6"
              strokeWidth="2"
              fill="none"
            />
          </svg>

          {/* Bars */}
          <div className="relative flex justify-start w-full z-10 items-end px-2 sm:px-4">
            {visibleTrainings.map((training, trainingIndex) => {
              const columnWidth = `${100 / visibleTrainings.length}%`;
              
              return (
                <div 
                  key={`training-${training._id || training.id || trainingIndex}`} 
                  className="flex flex-col relative"
                  style={{ 
                    width: columnWidth,
                    height: `${maxGraphHeight}px`,
                    padding: '0 4px'
                  }}
                >
                  <div className="flex gap-1 h-full justify-center items-end">
                    {training.results.map((result, resultIndex) => {
                      let height = 0;
                      if (isRun) {
                        // Power u běhu je pace v mm:ss formátu
                        const paceSeconds = parsePaceToSeconds(result.power);
                        if (paceSeconds !== null && paceSeconds > 0) {
                          // Pro pace: rychlejší pace (menší číslo) = vyšší sloupec = nahoře
                          // minPace je nahoře (rychlejší), maxPace je dole (pomalejší)
                          // Výška = (maxPace - paceSeconds) / (maxPace - minPace) * maxGraphHeight
                          // Rychlejší pace (menší) = větší rozdíl od maxPace = vyšší sloupec
                          height = ((maxPace - paceSeconds) / (maxPace - minPace)) * maxGraphHeight;
                        }
                      } else {
                        const powerValue = Number(result.power);
                        if (!isNaN(powerValue) && powerValue > 0) {
                          height = ((powerValue - minPower) / (maxPower - minPower)) * maxGraphHeight;
                        }
                      }

                      return (
                        <VerticalBar
                          key={`result-${training._id || training.id || trainingIndex}-${resultIndex}`}
                          height={height}
                          color={barColors[resultIndex % barColors.length]}
                          power={result.power}
                          pace={selectedSport === 'run' ? result.power : result.pace}
                          distance={result.distance || (selectedSport === 'run' && result.durationType === 'distance' ? result.duration : null)}
                          lactate={result.lactate}
                          heartRate={result.heartRate}
                          duration={result.duration}
                          index={resultIndex}
                          isHovered={hoveredBar?.trainingIndex === trainingIndex && hoveredBar?.intervalIndex === resultIndex}
                          onHover={(isHovered) => setHoveredBar(isHovered ? { trainingIndex, intervalIndex: resultIndex } : null)}
                          totalTrainings={displayCount}
                          visibleTrainings={visibleTrainings}
                          minPower={minPower}
                          maxPower={maxPower}
                          minPace={minPace}
                          maxPace={maxPace}
                          containerWidth={containerWidth}
                          selectedTraining={currentSelectedTitle}
                          displayCount={displayCount}
                          isFullWidth={isFullWidth}
                          sport={selectedSport}
                          user={user}
                        />
                      );
                    })}
                  </div>
                  <div className="text-[10px] sm:text-xs text-zinc-500 whitespace-nowrap text-center">
                    {new Date(training.date).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'numeric',
                      year: '2-digit'
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 sm:mt-3">
        <div className="flex items-center justify-between mb-1 sm:mb-1.5">
          <div className="text-xs sm:text-sm font-medium text-gray-900">Training Progress</div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleProgressNavigateLeft}
              disabled={!canNavigateProgressLeft}
              className={`p-1 rounded hover:bg-gray-100 ${!canNavigateProgressLeft ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleProgressNavigateRight}
              disabled={!canNavigateProgressRight}
              className={`p-1 rounded hover:bg-gray-100 ${!canNavigateProgressRight ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                sport={selectedSport}
              />
            ))}
        </div>
      </div>
    </div>
  );
}