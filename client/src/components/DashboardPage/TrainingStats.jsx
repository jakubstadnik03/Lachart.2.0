import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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

function VerticalBar({ height, color, power, pace, distance, heartRate, lactate, duration, durationType, index, isHovered, onHover, totalTrainings, visibleTrainings, minPower, maxPower, minPace, maxPace, containerWidth, selectedTraining, displayCount, isFullWidth, sport, user = null, widthPercent = null, trainingResults = null }) {
  const barRef = useRef(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, showAbove: true });
  const getWidth = () => {
    // If widthPercent is provided, we'll use it as percentage in flexbox (handled in style)
    // This function is kept for backward compatibility with old logic
    // Otherwise, use the old complex logic (for backward compatibility)
    // Funkce pro převod duration na číselnou hodnotu (normalizovanou pro porovnání)
    const parseDurationToNumber = (dur, durType) => {
      if (!dur) return 0;
      
      // Pokud je durationType 'distance', parsujeme jako vzdálenost v km
      if (durType === 'distance') {
        if (typeof dur === 'string') {
          // Parsování stringu s jednotkami (např. "2.01km", "1000m", "1.5 km")
          const match = dur.match(/^([\d.]+)\s*(km|m)$/i);
          if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            return unit === 'km' ? value : value / 1000;
          }
          // Pokud je to číslo jako string bez jednotek, předpokládáme km
          const numValue = parseFloat(dur);
          if (!isNaN(numValue)) return numValue;
        }
        // Pokud je to číslo, předpokládáme km
        return typeof dur === 'number' ? dur : parseFloat(dur) || 0;
      } else {
        // Pokud je durationType 'time', parsujeme jako čas v sekundách
        if (typeof dur === 'string') {
          // Parsování MM:SS nebo HH:MM:SS formátu
          if (dur.includes(':')) {
            const parts = dur.split(':').map(Number);
            if (parts.length === 2) {
              return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
              return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          }
          // Pokud je to číslo jako string, předpokládáme sekundy
          const numValue = parseFloat(dur);
          if (!isNaN(numValue)) return numValue;
        }
        // Pokud je to číslo, předpokládáme sekundy
        return typeof dur === 'number' ? dur : parseFloat(dur) || 0;
      }
    };

    // Funkce pro parsování vzdálenosti na km (podobná parseDistanceToKm, ale vrací číslo)
    const parseDistanceToKmNumber = (value) => {
      if (!value) return null;
      
      if (typeof value === 'number') {
        return value;
      }
      
      if (typeof value === 'string') {
        const cleanValue = value.trim().toLowerCase();
        const kmMatch = cleanValue.match(/^([\d.]+)\s*km$/);
        if (kmMatch) {
          return parseFloat(kmMatch[1]);
        }
        const mMatch = cleanValue.match(/^([\d.]+)\s*m$/);
        if (mMatch) {
          return parseFloat(mMatch[1]) / 1000;
        }
        const numValue = parseFloat(cleanValue);
        if (!isNaN(numValue)) {
          // Pokud je to celé číslo > 100 bez desetinné tečky, pravděpodobně metry
          if (numValue > 100 && numValue % 1 === 0 && !cleanValue.includes('.')) {
            return numValue / 1000;
          }
          return numValue;
        }
      }
      
      return null;
    };

    // Funkce pro získání "velikosti" intervalu - buď vzdálenost (priorita), nebo čas
    const getIntervalSize = (r) => {
      // Pokud je durationType 'distance', zkusíme najít vzdálenost v různých polích
      if (r.durationType === 'distance') {
        // Zkusíme duration (může být číslo v km nebo string)
        if (r.duration !== undefined && r.duration !== null) {
          return { value: parseDurationToNumber(r.duration, 'distance'), type: 'distance' };
        }
        // Zkusíme durationSeconds (pokud je to vzdálenost, může být v km)
        if (r.durationSeconds !== undefined && r.durationSeconds !== null) {
          // Pokud je durationSeconds číslo, předpokládáme, že je to v km pro distance type
          return { value: typeof r.durationSeconds === 'number' ? r.durationSeconds : parseFloat(r.durationSeconds) || 0, type: 'distance' };
        }
        // Zkusíme samostatné distance pole
        if (r.distance) {
          const distKm = parseDistanceToKmNumber(r.distance);
          if (distKm !== null) {
            return { value: distKm, type: 'distance' };
          }
        }
        // Pokud není žádná vzdálenost, ale durationType je 'distance', vrátíme null
        // aby se to nepovažovalo za čas
        return { value: null, type: 'distance' };
      }
      // Pokud je k dispozici samostatné distance pole (i když durationType není 'distance')
      if (r.distance) {
        const distKm = parseDistanceToKmNumber(r.distance);
        if (distKm !== null) {
          return { value: distKm, type: 'distance' };
        }
      }
      // Jinak použijeme duration jako čas
      // Pokud duration není definováno, zkusíme durationSeconds
      const durValue = r.duration !== undefined && r.duration !== null 
        ? parseDurationToNumber(r.duration, r.durationType || 'time')
        : (r.durationSeconds !== undefined && r.durationSeconds !== null 
          ? (typeof r.durationSeconds === 'number' ? r.durationSeconds : parseFloat(r.durationSeconds) || 0)
          : 0);
      return { value: durValue, type: 'time' };
    };

    // Najdeme všechny tréninky stejného typu
    const sameTypeTrainings = visibleTrainings.filter(t => t.title === selectedTraining);
    
    // Najdeme všechny velikosti intervalů (vzdálenost nebo čas) napříč všemi tréninky stejného typu
    const allSizes = sameTypeTrainings.flatMap(t => 
      t.results.map(r => getIntervalSize(r))
    );
    
    // Rozdělíme na vzdálenosti a časy, filtrujeme null hodnoty
    const distances = allSizes.filter(s => s.type === 'distance' && s.value !== null && s.value !== undefined).map(s => s.value);
    const times = allSizes.filter(s => s.type === 'time' && s.value !== null && s.value !== undefined).map(s => s.value);
    
    // Pokud máme alespoň jednu vzdálenost, použijeme vzdálenosti pro výpočet
    // Jinak použijeme časy
    const useDistance = distances.length > 0;
    const allValues = useDistance ? distances : times;
    const maxSize = allValues.length > 0 ? Math.max(...allValues) : 1;
    const minSize = allValues.length > 0 ? Math.min(...allValues) : 0;
    const sizeRange = maxSize - minSize;

    // Získáme velikost aktuálního intervalu
    const currentSize = getIntervalSize({ duration, durationType, distance });
    const currentValue = currentSize.value;
    
    // Celkový počet intervalů napříč všemi zobrazenými tréninky
    const totalIntervals = visibleTrainings.reduce((sum, t) => sum + t.results.length, 0);
    
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
    
    // Pokud currentValue je null nebo undefined, použijeme stejnou šířku pro všechny
    if (currentValue === null || currentValue === undefined) {
      const uniformWidth = Math.max(minWidth, Math.min(calculatedMaxWidth, optimalWidthPerInterval));
      return uniformWidth;
    }
    
    // Použijeme normalizovaný poměr: (currentValue - minSize) / (maxSize - minSize)
    // Tím zajistíme, že nejmenší interval má poměr 0 a největší má poměr 1
    // Použijeme to jak pro distance, tak pro time (duration)
    const sizeRatio = sizeRange > 0 
      ? (currentValue - minSize) / sizeRange 
      : 0.5; // Pokud není žádný rozsah, použijeme 0.5 pro stejnou šířku
    
    // Základní šířka pro nejkratší/nejmenší interval
    baseWidth = Math.max(minWidth, Math.min(calculatedMaxWidth, optimalWidthPerInterval * 0.5));
    
    // Maximální šířka pro nejdelší/největší interval - větší rozsah pro výraznější rozdíly
    maxWidth = Math.max(minWidth, Math.min(calculatedMaxWidth, optimalWidthPerInterval * 3.0));
    
    // Upravíme šířku podle poměru velikosti intervalu (vzdálenost nebo čas)
    // Delší/větší intervaly jsou výrazně širší
    // Použijeme mírně nelineární funkci pro výraznější rozdíly (exponent 0.6 pro větší rozdíly)
    const adjustedWidth = baseWidth + (Math.pow(sizeRatio, 0.6) * (maxWidth - baseWidth));
    
    // Zajistíme, že se všechny sloupce vejdou
    // Vypočítáme celkovou šířku všech intervalů v nejdelším tréninku s jejich poměrovými šířkami
    const longestTraining = sameTypeTrainings.reduce((longest, t) => 
      t.results.length > longest.results.length ? t : longest, 
      sameTypeTrainings[0] || { results: [] }
    );
    
    if (longestTraining.results.length > 0) {
      // Vypočítáme šířky pro všechny intervaly v nejdelším tréninku
      const widths = longestTraining.results.map(r => {
        const rSize = getIntervalSize(r);
        // Pokud je hodnota null nebo undefined, použijeme stejnou šířku
        if (rSize.value === null || rSize.value === undefined) {
          return Math.max(minWidth, Math.min(calculatedMaxWidth, optimalWidthPerInterval));
        }
        // Použijeme normalizovanou logiku pro distance nebo time
        const rRatio = sizeRange > 0 
          ? (rSize.value - minSize) / sizeRange 
          : 0.5;
        return baseWidth + (Math.pow(rRatio, 0.6) * (maxWidth - baseWidth));
      });
      
      const totalWidthNeeded = widths.reduce((sum, w) => sum + w, 0);
      
      // Pokud by celková šířka přesáhla dostupnou, škálujeme všechny šířky
      // Ale zachováme poměry mezi nimi
      const scaleFactor = totalWidthNeeded > availableWidth ? availableWidth / totalWidthNeeded : 1;
      
      // Vypočítáme škálovanou šířku pro aktuální interval
      const scaledWidth = adjustedWidth * scaleFactor;
      
      // Po škálování musíme zajistit, že šířka není menší než minWidth
      // Ale zachováme poměry - použijeme relativní škálování
      const scaledBaseWidth = baseWidth * scaleFactor;
      const scaledMaxWidth = maxWidth * scaleFactor;
      
      // Pokud je scaledBaseWidth menší než minWidth, upravíme všechny šířky tak, aby minimální byla minWidth
      // a zachováme poměry
      if (scaledBaseWidth < minWidth) {
        // Vypočítáme poměr aktuální šířky v rámci rozsahu
        const ratioInRange = (scaledWidth - scaledBaseWidth) / (scaledMaxWidth - scaledBaseWidth);
        // Aplikujeme tento poměr na nový rozsah od minWidth
        const newMaxWidth = Math.min(calculatedMaxWidth, minWidth + (scaledMaxWidth - scaledBaseWidth));
        const finalWidth = minWidth + ratioInRange * (newMaxWidth - minWidth);
        return Math.min(finalWidth, calculatedMaxWidth);
      }
      
      // Pokud je scaledMaxWidth větší než calculatedMaxWidth, ořízneme, ale zachováme poměr
      if (scaledMaxWidth > calculatedMaxWidth) {
        const ratioInRange = (scaledWidth - scaledBaseWidth) / (scaledMaxWidth - scaledBaseWidth);
        const newBaseWidth = Math.max(minWidth, scaledBaseWidth);
        const newMaxWidth = calculatedMaxWidth;
        const finalWidth = newBaseWidth + ratioInRange * (newMaxWidth - newBaseWidth);
        return Math.max(minWidth, Math.min(finalWidth, calculatedMaxWidth));
      }
      
      // Normální případ - škálovaná šířka je v rozsahu
      return Math.max(minWidth, Math.min(scaledWidth, calculatedMaxWidth));
    }
    
    // Fallback pro prázdný trénink
    return Math.max(minWidth, Math.min(adjustedWidth, maxWidth));
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

  // If widthPercent is provided, use it as percentage for flexbox
  // Otherwise, use the old pixel-based width
  // Ensure minimum width for visibility, especially on mobile
  const minWidthPx = window.innerWidth < 640 ? 3 : 2; // Slightly larger on mobile
  const barStyle = widthPercent !== null && widthPercent !== undefined
    ? {
        flexBasis: `${Math.max(widthPercent, 0.5)}%`, // Use flexBasis for better flexbox gap handling
        width: `${Math.max(widthPercent, 0.5)}%`, // Also set width for compatibility
        minWidth: `${minWidthPx}px`, // Ensure minimum visibility in pixels
        flexShrink: 1, // Allow shrinking if needed to fit in narrow containers
        flexGrow: 0
      }
    : {
        width: `${Math.max(width, minWidthPx)}px`,
        flexShrink: 1, // Allow shrinking if needed
        flexGrow: 0
      };

  // Calculate tooltip position when hovered - update whenever bar position changes
  useEffect(() => {
    if (isHovered && barRef.current) {
      const updatePosition = () => {
        if (!barRef.current) return;
        
        const rect = barRef.current.getBoundingClientRect();
        const tooltipHeight = 120; // Approximate tooltip height
        const tooltipWidth = 180; // Approximate tooltip width
        const margin = 8;
        
        // The bar is positioned at bottom-0, so its top is at rect.bottom - height
        // Calculate the actual top of the bar (not the container)
        const barTop = rect.bottom - height + 4; // height is the actual bar height in pixels
        
        // Try to position above the bar first (touching the top of the bar)
        let top = barTop; // Touch the top of the actual bar
        let showAbove = true;
        
        // Check if tooltip would go off the top of the screen
        if (top - tooltipHeight < margin) {
          // Position below the bar instead (touching the bottom of the bar)
          top = rect.bottom; // Touch the bottom of the bar
          showAbove = false;
        }
        
        // Center horizontally on the bar
        let left = rect.left + rect.width / 2;
        
        // Check if tooltip would go off the left of the screen
        if (left - tooltipWidth / 2 < margin) {
          left = tooltipWidth / 2 + margin;
        }
        
        // Check if tooltip would go off the right of the screen
        if (left + tooltipWidth / 2 > window.innerWidth - margin) {
          left = window.innerWidth - tooltipWidth / 2 - margin;
        }
        
        setTooltipPosition({
          top: top,
          left: left,
          showAbove: showAbove
        });
      };
      
      updatePosition();
      
      // Update on scroll and resize to keep tooltip aligned with bar
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isHovered, height]);

  return (
    <>
      <div
        ref={barRef}
        className="relative flex justify-center shrink-0 h-full"
        style={barStyle}
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
      
      </div>
      {isHovered && tooltipPosition.top > 0 && (
        <div 
          className="pointer-events-none"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: tooltipPosition.showAbove 
              ? 'translate(-50%, -100%)' // Above bar
              : 'translate(-50%, 0)', // Below bar
            minWidth: "140px",
            zIndex: 99999,
            pointerEvents: 'none'
          }}  
        >
          <StatCard
            stats={[
              { label: "Interval", value: `#${index + 1}`, unit: "" },
              // Show Distance or Duration based on durationType
              ...(duration && durationType === 'distance' ? [{ label: "Distance", value: formatDistance(duration), unit: "" }] : []),
              ...(duration && durationType !== 'distance' ? [{ label: "Duration", value: formatDurationDisplay(duration), unit: "" }] : []),
              // For run sport, show Pace instead of Power
              ...(sport === 'run' && power ? [{ label: "Pace", value: typeof power === 'string' ? `${power}/km` : formatPace(power), unit: "" }] : []),
              // For other sports, show Power
              ...(sport !== 'run' && power ? [{ label: "Power", value: power, unit: "W" }] : []),
              // Also show distance if explicitly provided (separate from duration)
              ...(distance && durationType !== 'distance' ? [{ label: "Distance", value: formatDistance(distance), unit: "" }] : []),
              ...(heartRate ? [{ label: "Heart Rate", value: heartRate, unit: "Bpm" }] : []),
              ...(lactate ? [{ label: "Lactate", value: lactate, unit: "mmol/L" }] : []),
            ]}
          />
        </div>
      )}
    </>
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

function TrainingComparison({ training, previousTraining, sport, onTrainingClick }) {
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

  const handleDateClick = () => {
    if (onTrainingClick) {
      onTrainingClick(training);
    }
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 py-1 sm:py-1.5 px-2 sm:px-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div 
          onClick={handleDateClick}
          className="text-xs sm:text-sm font-medium text-gray-900 cursor-pointer hover:text-primary hover:underline transition-colors duration-200"
          title="Click to view training details"
        >
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
  const navigate = useNavigate();
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

  // Reset progress index when filtered trainings or selected title changes
  useEffect(() => {
    setProgressIndex(0);
  }, [filteredTrainings.length, currentSelectedTitle]);
  
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

  // Show 2 trainings at a time in Training Progress section
  const progressItemsPerPage = 2;
  const canNavigateProgressLeft = progressIndex > 0;
  const canNavigateProgressRight = progressIndex + progressItemsPerPage < filteredTrainings.length;

  const handleProgressNavigateLeft = () => {
    if (canNavigateProgressLeft) {
      setProgressIndex(prev => Math.max(0, prev - progressItemsPerPage));
    }
  };

  const handleProgressNavigateRight = () => {
    if (canNavigateProgressRight) {
      setProgressIndex(prev => Math.min(filteredTrainings.length - progressItemsPerPage, prev + progressItemsPerPage));
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

  const { powerValues, paceValues, minPower, maxPower, minPace, maxPace } = useMemo(() => {
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
        averageHeartRate
      };
    }
  }, [filteredTrainings, isRun]);
  
  const barColors = ["bg-violet-700", "bg-violet-600", "bg-violet-500", "bg-violet-400", "bg-violet-300"];




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
                        {[1, 3, 6, 9, 12].map((count) => (
                          <option key={count} value={count}>
                            {count} {count === 1 ? 'training' : 'trainings'}
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
        
        <div ref={containerRef} className="relative flex-1 flex items-stretch justify-between min-w-0" style={{ overflow: 'visible' }}>
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


          {/* Bars */}
          <div className="relative flex justify-start w-full z-10 items-end px-2 sm:px-4" style={{ overflow: 'visible' }}>
            {visibleTrainings.map((training, trainingIndex) => {
              const columnWidth = `${100 / visibleTrainings.length}%`;
              
              return (
                <div 
                  key={`training-${training._id || training.id || trainingIndex}`} 
                  className="flex flex-col relative"
                  style={{ 
                    width: columnWidth,
                    height: `${maxGraphHeight}px`,
                    padding: '0 2px',
                    overflow: 'visible'
                  }}
                >
                  <div 
                    className="relative h-full w-full flex items-end" 
                    style={{ 
                      gap: '3px',
                      overflowX: 'auto',
                      overflowY: 'visible',
                      minWidth: 0 // Allow flex shrinking
                    }}
                  >
                    {(() => {
                      // Helper function to parse duration (handles string "5:00" or number)
                      const parseDuration = (duration) => {
                        if (!duration && duration !== 0) return 0;
                        if (typeof duration === 'number') return duration;
                        if (typeof duration === 'string') {
                          if (duration.includes(':')) {
                            const [minutes, seconds] = duration.split(':').map(Number);
                            return (minutes || 0) * 60 + (seconds || 0);
                          }
                          return parseFloat(duration) || 0;
                        }
                        return 0;
                      };

                      // Helper function to parse distance to meters
                      const parseDistanceToMeters = (dist) => {
                        if (!dist) return 0;
                        if (typeof dist === 'string') {
                          const cleanValue = dist.trim().toLowerCase();
                          // Match "2 km", "2km", "2.5 km", etc.
                          const kmMatch = cleanValue.match(/^([\d.]+)\s*km$/);
                          if (kmMatch) return parseFloat(kmMatch[1]) * 1000; // Convert to meters
                          // Match "1000 m", "1000m", etc.
                          const mMatch = cleanValue.match(/^([\d.]+)\s*m$/);
                          if (mMatch) return parseFloat(mMatch[1]);
                          // Try to parse as number
                          const numValue = parseFloat(cleanValue);
                          if (!isNaN(numValue)) {
                            // If it's a whole number > 100 without decimal, assume meters
                            if (numValue > 100 && numValue % 1 === 0 && !cleanValue.includes('.')) {
                              return numValue;
                            }
                            // Otherwise assume km (e.g., "2" means 2km = 2000m)
                            return numValue * 1000;
                          }
                        }
                        // If it's a number
                        if (typeof dist === 'number') {
                          // If > 100, assume meters; otherwise assume km
                          return dist > 100 ? dist : dist * 1000;
                        }
                        return 0;
                      };

                      // Check if results have distance data (for distance-based intervals)
                      const hasDistanceData = training.results && training.results.some(r => {
                        const dist = r.distance || (r.durationType === 'distance' ? r.duration : null);
                        return dist && parseDistanceToMeters(dist) > 0;
                      });

                      // Calculate total duration or distance for this training
                      const totalDuration = training.results ? training.results.reduce((sum, result) => {
                        return sum + parseDuration(result.duration);
                      }, 0) : 0;

                      const totalDistance = training.results ? training.results.reduce((sum, result) => {
                        const dist = result.distance || (result.durationType === 'distance' ? result.duration : null);
                        return sum + parseDistanceToMeters(dist);
                      }, 0) : 0;

                      // Use distance if available, otherwise use duration
                      const useDistance = hasDistanceData && totalDistance > 0;
                      const totalValue = useDistance ? totalDistance : totalDuration;

                      // Calculate width percentages and left positions for each interval
                      // Account for gaps between intervals (3px each, N-1 gaps for N intervals)
                      // With flexbox gap, we need to ensure bars fit within container
                      // Approach: calculate widthPercent accounting for gap space
                      const numIntervals = training.results.length;
                      
                      // For flexbox with gap, we'll calculate widthPercent as:
                      // widthPercent = (value/totalValue) * (100% - gapPercentage)
                      // where gapPercentage accounts for all gaps
                      
                      // Calculate gap percentage based on actual container width
                      // Get container width from ref if available, otherwise estimate
                      const containerWidthPx = containerWidth || 300; // Fallback to 300px
                      const gapSizePx = 3; // pixels per gap
                      const totalGapWidthPx = (numIntervals - 1) * gapSizePx;
                      const gapPercent = containerWidthPx > 0 
                        ? Math.min(20, (totalGapWidthPx / containerWidthPx) * 100) // Cap at 20%
                        : Math.min(15, (numIntervals - 1) * 1.5); // Fallback estimate
                      const availableWidthPercent = Math.max(50, 100 - gapPercent); // Ensure at least 50% available
                      
                      let cumulativeLeft = 0;
                      const intervalPositions = training.results.map((result, index) => {
                        const durationValue = parseDuration(result.duration);
                        const distanceValue = result.distance || (result.durationType === 'distance' ? result.duration : null);
                        const parsedDistance = parseDistanceToMeters(distanceValue);

                        const value = useDistance ? parsedDistance : durationValue;
                        // Calculate width as percentage of available space (after accounting for gaps)
                        const widthPercent = totalValue > 0 
                          ? (value / totalValue) * availableWidthPercent 
                          : (availableWidthPercent / training.results.length);
                        const leftPercent = cumulativeLeft;
                        cumulativeLeft += widthPercent;
                        return { widthPercent, leftPercent };
                      });

                      // Debug: Log widths
                      console.log('=== DashboardPage TrainingStats Bar Widths ===');
                      console.log('Training:', training.title || 'Untitled');
                      console.log('Total Value:', totalValue, useDistance ? '(distance in meters)' : '(duration in seconds)');
                      console.log('Total Distance:', totalDistance, 'meters');
                      console.log('Total Duration:', totalDuration, 'seconds');
                      console.log('Use Distance:', useDistance);
                      console.log('Results count:', training.results?.length || 0);
                      console.log('Interval Widths:', intervalPositions.map((pos, idx) => {
                        const result = training.results[idx];
                        const dist = result?.distance || (result?.durationType === 'distance' ? result?.duration : null);
                        const parsedDist = parseDistanceToMeters(dist);
                        const durVal = parseDuration(result?.duration);
                        return {
                          interval: idx + 1,
                          widthPercent: pos.widthPercent.toFixed(2) + '%',
                          duration: result?.duration,
                          distance: result?.distance,
                          durationType: result?.durationType,
                          parsedDistance: parsedDist,
                          parsedDuration: durVal,
                          value: useDistance ? parsedDist : durVal
                        };
                      }));
                      console.log('==============================================');

                      // Vypočítáme hodnoty power/pace pro všechny intervaly a seřadíme je
                      // Pro běh: nejrychlejší pace (nejmenší číslo) = nejtmavší
                      // Pro ostatní: nejvyšší power = nejtmavší
                      const powerPaceValues = training.results.map((r, idx) => {
                        if (isRun) {
                          const paceSeconds = parsePaceToSeconds(r.power);
                          return { value: paceSeconds, index: idx };
                        } else {
                          const powerValue = Number(r.power);
                          return { value: isNaN(powerValue) ? 0 : powerValue, index: idx };
                        }
                      }).filter(p => p.value !== null && p.value > 0);
                      
                      // Seřadíme podle hodnoty (pro běh: vzestupně = nejrychlejší první, pro ostatní: sestupně = nejvyšší první)
                      if (isRun) {
                        powerPaceValues.sort((a, b) => a.value - b.value); // Vzestupně - nejrychlejší první
                      } else {
                        powerPaceValues.sort((a, b) => b.value - a.value); // Sestupně - nejvyšší první
                      }
                      
                      // Vytvoříme mapu: index intervalu -> pozice v seřazeném seznamu (0 = nejtmavší)
                      const colorIndexMap = new Map();
                      powerPaceValues.forEach((item, sortedIndex) => {
                        colorIndexMap.set(item.index, sortedIndex);
                      });
                      
                      return training.results.map((result, resultIndex) => {
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
                        
                        // Získáme index barvy podle power/pace hodnoty
                        const colorIndex = colorIndexMap.get(resultIndex) ?? resultIndex;
                        const color = barColors[Math.min(colorIndex, barColors.length - 1)];

                        return (
                          <VerticalBar
                            key={`result-${training._id || training.id || trainingIndex}-${resultIndex}`}
                            height={height}
                            color={color}
                          power={result.power}
                          pace={currentSelectedSport === 'run' ? result.power : result.pace}
                          distance={result.distance || (currentSelectedSport === 'run' && result.durationType === 'distance' ? result.duration : null)}
                          lactate={result.lactate}
                          heartRate={result.heartRate}
                          duration={result.duration}
                          durationType={result.durationType || 'time'}
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
                          sport={currentSelectedSport === 'all' ? (training.sport || 'bike') : currentSelectedSport}
                          user={user}
                          widthPercent={intervalPositions[resultIndex]?.widthPercent}
                          trainingResults={training.results}
                        />
                      );
                    });
                    })()}
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
          <div className="text-xs sm:text-sm font-medium text-gray-900">
            Training Progress
            {filteredTrainings.length > progressItemsPerPage && (
              <span className="ml-2 text-gray-500 text-[10px] sm:text-xs font-normal">
                ({progressIndex + 1}-{Math.min(progressIndex + progressItemsPerPage, filteredTrainings.length)} of {filteredTrainings.length})
              </span>
            )}
          </div>
          {filteredTrainings.length > progressItemsPerPage && (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={handleProgressNavigateLeft}
                disabled={!canNavigateProgressLeft}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${!canNavigateProgressLeft ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title="Previous trainings"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleProgressNavigateRight}
                disabled={!canNavigateProgressRight}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${!canNavigateProgressRight ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title="Next trainings"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="space-y-1">
          {filteredTrainings
            .slice(progressIndex, progressIndex + progressItemsPerPage)
            .map((training, index) => {
              const handleTrainingClick = (trainingData) => {
                // Navigate to FitAnalysisPage with canonical URL format
                // Training objects from DashboardPage may have 'type' property or not
                // Try to determine type from available properties
                if (trainingData.type === 'fit' && trainingData._id) {
                  navigate(`/training-calendar/${encodeURIComponent(`fit-${trainingData._id}`)}`);
                } else if (trainingData.type === 'strava' && (trainingData.stravaId || trainingData.id)) {
                  const stravaId = trainingData.stravaId || trainingData.id;
                  navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaId}`)}`);
                } else if (trainingData.type === 'regular' && trainingData._id) {
                  navigate(`/training-calendar/${encodeURIComponent(`regular-${trainingData._id}`)}`);
                } else if (trainingData.stravaId || trainingData.id) {
                  // Strava activity (without explicit type)
                  const stravaId = trainingData.stravaId || trainingData.id;
                  navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaId}`)}`);
                } else if (trainingData._id) {
                  // Regular training (Training model) - most common case
                  navigate(`/training-calendar/${encodeURIComponent(`training-${trainingData._id}`)}`);
                }
              };
              
              return (
                <TrainingComparison
                  key={training._id || training.id || index}
                  training={training}
                  previousTraining={index < filteredTrainings.length - 1 ? filteredTrainings[progressIndex + index + 1] : null}
                  sport={currentSelectedSport === 'all' ? (training.sport || 'bike') : currentSelectedSport}
                  onTrainingClick={handleTrainingClick}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}