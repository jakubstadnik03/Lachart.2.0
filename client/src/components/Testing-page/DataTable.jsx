// DataTable.jsx
// =============

import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import * as math from 'mathjs';

// Pomocná funkce pro lineární interpolaci
const interpolate = (x0, y0, x1, y1, targetY) => {
    return x0 + ((targetY - y0) * (x1 - x0)) / (y1 - y0);
  };
  
  // D-max metoda pro nalezení thresholdu
  const calculateDmax = (points) => {
    if (!points || points.length < 3) return null;
    
    // Najít první a poslední bod
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    
    // Vypočítat přímku mezi prvním a posledním bodem
    const slope = (lastPoint.lactate - firstPoint.lactate) / 
                  (lastPoint.power - firstPoint.power);
    const intercept = firstPoint.lactate - slope * firstPoint.power;
    
    // Najít bod s největší kolmou vzdáleností od přímky
    let maxDistance = 0;
    let dmaxPoint = null;
    
    points.forEach(point => {
      // Vypočítat vzdálenost bodu od přímky
      const distance = Math.abs(
        point.lactate - (slope * point.power + intercept)
      ) / Math.sqrt(1 + slope * slope);
      
      if (distance > maxDistance) {
        maxDistance = distance;
        dmaxPoint = point;
      }
    });
    
    return dmaxPoint;
  };
  
  // Individual Anaerobic Threshold (IAT)
  const calculateIAT = (points) => {
    if (!points || points.length < 3) return null;
    
    // Seřadit body podle výkonu
    const sortedPoints = [...points].sort((a, b) => a.power - b.power);
    
    // Najít bod s největším nárůstem laktátu
    let maxIncrease = 0;
    let iatPoint = null;
    
    for (let i = 1; i < sortedPoints.length; i++) {
      const increase = (sortedPoints[i].lactate - sortedPoints[i-1].lactate) /
                      (sortedPoints[i].power - sortedPoints[i-1].power);
      
      if (increase > maxIncrease) {
        maxIncrease = increase;
        iatPoint = sortedPoints[i];
      }
    }
    
    return iatPoint;
  };
  
  // Pomocná funkce pro výpočet derivací
  const calculateDerivatives = (points) => {
    if (!points || points.length < 3) {
      return { firstDerivative: [], secondDerivative: [] };
    }

    const firstDerivative = [];
    const secondDerivative = [];
  
    for (let i = 1; i < points.length - 1; i++) {
      // První derivace (změna laktátu / změna výkonu)
      const d1 = (points[i + 1].lactate - points[i - 1].lactate) / 
                 (points[i + 1].power - points[i - 1].power);
      firstDerivative.push({ power: points[i].power, value: d1 });
    }
  
    // Výpočet druhé derivace
    for (let i = 0; i < firstDerivative.length - 1; i++) {
      const d2 = (firstDerivative[i + 1].value - firstDerivative[i].value) /
                 (firstDerivative[i + 1].power - firstDerivative[i].power);
      secondDerivative.push({ power: firstDerivative[i].power, value: d2 });
    }
  
    return { firstDerivative, secondDerivative };
  };
  
  // Funkce pro výpočet Log-log thresholdu
  const calculateLogLogThreshold = (results) => {
    if (!results || results.length < 3) {
      // console.log('Not enough data points for Log-log calculation:', results);
      return null;
    }

    try {
      // console.log('Calculating Log-log threshold with data:', results);
      
      // Transformace dat do logaritmického prostoru
      const logData = results.map(r => ({
        logPower: Math.log(r.power),
        logLactate: Math.log(r.lactate),
        originalPoint: r
      }));

      // console.log('Log-transformed data:', logData);

      let maxDeltaSlope = -Infinity;
      let breakpointIndex = 0;

      // Najít bod s největší změnou směrnice
      for (let i = 1; i < logData.length - 1; i++) {
        const slopeBefore = (logData[i].logLactate - logData[i-1].logLactate) /
                           (logData[i].logPower - logData[i-1].logPower);
        const slopeAfter = (logData[i+1].logLactate - logData[i].logLactate) /
                          (logData[i+1].logPower - logData[i].logPower);
        
        const deltaSlope = slopeAfter - slopeBefore;
        
        if (deltaSlope > maxDeltaSlope) {
          maxDeltaSlope = deltaSlope;
          breakpointIndex = i;
        }
      }

      return logData[breakpointIndex].originalPoint;
    } catch (error) {
      console.error('Error in Log-log calculation:', error);
      return null;
    }
  };
  
  // Vylepšená funkce pro nalezení LTP bodů
  const findLactateThresholds = (results, baseLactate) => {
    if (!results || results.length < 3) {
      return { ltp1: null, ltp2: null };
    }

    // Použít D-max pro LTP2
    const ltp2Point = calculateDmax(results);
    
    if (!ltp2Point) return { ltp1: null, ltp2: null };
    
    // Pro LTP1 použít modifikovanou D-max metodu na první část křivky
    const firstHalfPoints = results.filter(p => p.power <= ltp2Point.power);
    const ltp1Point = calculateDmax(firstHalfPoints);

    // Záložní metoda pomocí derivací, pokud D-max selže
    if (!ltp1Point) {
      const { secondDerivative } = calculateDerivatives(results);
      const ltp1Candidate = secondDerivative.find(d => d.value > 0.0005);
      return {
        ltp1: ltp1Candidate?.power || null,
        ltp2: ltp2Point.power
      };
    }

    return {
      ltp1: ltp1Point.power,
      ltp2: ltp2Point.power
    };
  };

  
  // Hlavní funkce pro výpočet všech thresholdů
  const calculateThresholds = (mockData) => {
    const baseLactate = mockData.baseLactate;
    const { results, sport } = mockData;
  
    if (!results || results.length < 3) {
      return {
        heartRates: {},
        lactates: {}
      };
    }
  
    // Pro běh a plavání necháme hodnoty v sekundách (nebudeme je převádět)
    const sortedResults = [...results].sort((a, b) => {
      if (sport === 'run' || sport === 'swim') {
        // Pro běh a plavání řadíme sestupně (nižší čas = lepší výkon)
        return b.power - a.power;
      }
      // Pro kolo řadíme vzestupně
      return a.power - b.power;
    });
  
    // Objekt pro ukládání výsledků
    const thresholds = {
      heartRates: {},
      lactates: {}
    };
  
    // Log-log threshold
    const logLogThreshold = calculateLogLogThreshold(sortedResults);
    if (logLogThreshold) {
      thresholds['Log-log'] = logLogThreshold.power;
      thresholds.heartRates['Log-log'] = logLogThreshold.heartRate;
      thresholds.lactates['Log-log'] = logLogThreshold.lactate;
    }
  
    // IAT threshold
    const iatThreshold = calculateIAT(sortedResults);
    if (iatThreshold) {
      thresholds['IAT'] = iatThreshold.power;
      thresholds.heartRates['IAT'] = iatThreshold.heartRate;
      thresholds.lactates['IAT'] = iatThreshold.lactate;
    }
  
    // Najít LTP body
    const { ltp1, ltp2 } = findLactateThresholds(sortedResults, baseLactate);
    
    // Definice cílových laktátů
    const targets = [
      2.0, 2.5, 3.0, 3.5,  // OBLA hodnoty
      baseLactate + 0.5, baseLactate + 1.0, baseLactate + 1.5,  // Baseline + delta
      baseLactate * 1.5,  // LTP1 target
      baseLactate * 3.0   // LTP2 target
    ];
  
    // Projít všechny sousední body a najít thresholdy
    for (let i = 1; i < sortedResults.length; i++) {
      const prev = sortedResults[i - 1];
      const curr = sortedResults[i];
  
      targets.forEach((target, index) => {
        if (prev.lactate <= target && curr.lactate >= target) {
          const key = [
            'OBLA 2.0', 'OBLA 2.5', 'OBLA 3.0', 'OBLA 3.5',
            'Bsln + 0.5', 'Bsln + 1.0', 'Bsln + 1.5',
            'LTP1', 'LTP2'
          ][index];
  
          // Interpolovaný výkon/tempo
          thresholds[key] = interpolate(
            prev.power, prev.lactate,
            curr.power, curr.lactate,
            target
          );
  
          // Interpolovaný HR
          thresholds.heartRates[key] = interpolate(
            prev.heartRate, prev.lactate,
            curr.heartRate, curr.lactate,
            target
          );
  
          // Uložit cílový laktát
          thresholds.lactates[key] = target;
        }
      });
    }
  
    // Výpočet LTRatio pouze pokud máme oba LTP body
    if (ltp1 && ltp2 && ltp1 > 0 && ltp2 > 0) {
      const ratio = ltp2 / ltp1;
      // Kontrola, zda je poměr v rozumném rozsahu (typicky 1.1 - 1.3)
      if (ratio >= 1.1 && ratio <= 1.3) {
        thresholds['LTRatio'] = ratio.toFixed(2);
      }
    }
  
    return thresholds;
  };
  
  // Zkrácené a výstižnější popisy metod
  const methodDescriptions = {
    'Log-log': `A mathematical method that identifies the anaerobic threshold by plotting lactate values against 
    power/pace on logarithmic scales. The deflection point in this transformed curve represents 
    the transition between aerobic and anaerobic metabolism.`,
    
    'IAT': `Individual Anaerobic Threshold (IAT) is determined by finding the point of maximum lactate 
    increase relative to power/pace increase. This method accounts for individual metabolic responses 
    and is particularly useful for trained athletes.`,
    
    'OBLA 2.0': `Onset of Blood Lactate Accumulation at 2.0 mmol/L. This fixed threshold typically represents 
    the aerobic threshold and is often used to determine the upper limit of low-intensity training zones. 
    Particularly suitable for endurance training.`,
    
    'OBLA 2.5': `Fixed lactate threshold at 2.5 mmol/L, representing a moderate-intensity marker. This level 
    often corresponds to the intensity that can be sustained for longer endurance events and serves as 
    a reference point for tempo training.`,
    
    'OBLA 3.0': `A fixed threshold at 3.0 mmol/L, commonly used to approximate the anaerobic threshold in 
    endurance athletes. This intensity typically represents the upper limit of steady-state exercise 
    and is useful for determining threshold training zones.`,
    
    'OBLA 3.5': `Fixed threshold at 3.5 mmol/L, typically used for well-trained athletes who show lactate 
    deflection points at higher concentrations. This level often corresponds to high-intensity interval 
    training zones.`,
    
    'Bsln + 0.5': `An individualized method that identifies the power/pace where lactate rises 0.5 mmol/L 
    above the athlete's baseline. This approach accounts for individual variations in resting lactate 
    levels and metabolic efficiency.`,
    
    'Bsln + 1.0': `Power/pace where lactate is 1.0 mmol/L above individual baseline. This threshold often 
    corresponds to moderate-intensity training zones and provides a personalized reference point for 
    training intensity.`,
    
    'Bsln + 1.5': `Identifies the point where lactate is 1.5 mmol/L above baseline. This higher threshold 
    typically indicates the transition to more intensive training zones and helps define upper limits 
    of steady-state exercise.`,
    
    'LTP1': `First Lactate Turn Point (LTP1) is identified using the D-max method on the first portion 
    of the lactate curve. It represents the aerobic threshold and the transition from low to moderate 
    exercise intensity. (Hofmann & Tschakert, 2017)`,
    
    'LTP2': `Second Lactate Turn Point (LTP2) is determined using the D-max method on the entire lactate 
    curve. It marks the anaerobic threshold and represents the highest sustainable steady-state exercise 
    intensity. (Hofmann & Tschakert, 2017)`,
    
    'LTRatio': `The ratio between LTP2 and LTP1 powers/paces (typically 1.15-1.25). This metric helps 
    monitor training adaptations and assess the relationship between aerobic and anaerobic thresholds 
    over time.`
  };
  
  // Context pro správu aktivního tooltipu
  const TooltipContext = createContext();

  // Provider pro tooltip context
  const TooltipProvider = ({ children }) => {
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [isLocked, setIsLocked] = useState(false);

    return (
      <TooltipContext.Provider value={{ activeTooltip, setActiveTooltip, isLocked, setIsLocked }}>
        {children}
      </TooltipContext.Provider>
    );
  };

  // Vlastní jednoduchý Tooltip komponent
  const CustomTooltip = ({ children, title, methodName }) => {
    const tooltipRef = useRef(null);
    const { activeTooltip, setActiveTooltip, isLocked, setIsLocked } = useContext(TooltipContext);
    const isVisible = activeTooltip === methodName;

    // Přidáme event listener pro kliknutí mimo tooltip
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
          setActiveTooltip(null);
          setIsLocked(false);
        }
      };

      if (isVisible && isLocked) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isVisible, isLocked, setActiveTooltip, setIsLocked]);

    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isVisible) {
        setActiveTooltip(null);
        setIsLocked(false);
      } else {
        setActiveTooltip(methodName);
        setIsLocked(true);
      }
    };

    const handleMouseEnter = () => {
      if (!isLocked) {
        setActiveTooltip(methodName);
      }
    };

    const handleMouseLeave = () => {
      if (!isLocked) {
        setActiveTooltip(null);
      }
    };

    return (
      <div 
        ref={tooltipRef}
        className="relative cursor-pointer"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {isVisible && (
          <div className="absolute left-full ml-0 top-0 z-50 w-[300px]">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
              {/* Nadpis */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-gray-800 font-semibold tracking-wide">{methodName}</h3>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTooltip(null);
                    setIsLocked(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              {/* Obsah */}
              <div className="p-4">
                <p className="text-gray-600 text-sm leading-relaxed">
                  {title}
                </p>
              </div>
              {/* Reference pokud existuje */}
              {(methodName === 'LTP1' || methodName === 'LTP2') && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                  <p className="text-xs text-gray-500 italic">
                    Reference: Hofmann & Tschakert, 2017
                  </p>
                </div>
              )}
              {/* Šipka */}
              <div 
                className="absolute left-0 top-4 -ml-2 w-0 h-0 
                border-t-[8px] border-t-transparent 
                border-r-[8px] border-r-white
                border-b-[8px] border-b-transparent
                filter drop-shadow-sm"
              />
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const TableCell = ({ children, isHeader, description, methodName }) => {
    const baseClasses = "py-1 md:pl-5 md:pr-4 sm:pr-2 sm:pl-2  w-full border-b border-gray-200";
    const headerClasses = isHeader ? "text-sm font-semibold text-gray-900 bg-white border-t" : "";
    
    if (description) {
      return (
        <CustomTooltip title={description} methodName={methodName}>
          <div className={`${baseClasses} ${headerClasses} cursor-help`}>
            {children}
          </div>
        </CustomTooltip>
      );
    }
  
    return (
      <div className={`${baseClasses} ${headerClasses}`}>
        {children}
      </div>
    );
  };
  
  const DataTable = ({ mockData }) => {
    const thresholds = calculateThresholds(mockData);
    const sport = mockData?.sport || 'bike';
  
    // Seznam metod, včetně Log-log
    const methods = [
      'Log-log',
      ...Object.keys(thresholds).filter(k =>
        k !== 'Log-log' && k !== 'heartRates' && k !== 'lactates'
      )
    ];
  
    // Definice sloupců (Method, Power/Pace, HR, La)
    const columns = [
      {
        header: 'Method',
        data: methods,
        descriptions: methods.map(method => methodDescriptions[method])
      },
      {
        header: sport === 'bike' ? 'Pwr (W)' : 'Pace (km)',
        data: methods.map((method) => {
          const value = thresholds[method];
          return value ? formatPowerOrPace(value, sport) : 'N/A';
        })
      },
      {
        header: 'HR (bpm)',
        data: methods.map((method) => {
          return thresholds.heartRates[method]
            ? Math.round(thresholds.heartRates[method])
            : 'N/A';
        })
      },
      {
        header: 'La (mmol)',
        data: methods.map((method) => {
          const value = thresholds.lactates[method];
          return value && typeof value === 'number' && !isNaN(value)
            ? value.toFixed(2)
            : 'N/A';
        })
      }
    ];
  
    return (
      <TooltipProvider>
        <div className="flex flex-col items-start w-full max-w-[400px] text-sm">
          <div className="flex justify-between items-start w-full">
            {columns.map((column, colIndex) => (
              <div key={colIndex} className="md:w-[100px] sm:w-[100px]">
                <TableCell isHeader>{column.header}</TableCell>
                {column.data.map((item, rowIndex) => (
                  <TableCell 
                    key={rowIndex}
                    description={colIndex === 0 ? column.descriptions[rowIndex] : null}
                    methodName={colIndex === 0 ? methods[rowIndex] : null}
                  >
                    {item}
                  </TableCell>
                ))}
              </div>
            ))}
          </div>
        </div>
      </TooltipProvider>
    );
  };
  
  // Pomocné funkce pro formátování
  const formatSecondsToMMSS = (seconds) => {
    if (!seconds || isNaN(seconds)) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPowerOrPace = (value, sport) => {
    if (!value || value === 'N/A') return 'N/A';
    
    if (sport === 'run') {
      return `${formatSecondsToMMSS(value)}/km`;
    } else if (sport === 'swim') {
      return `${formatSecondsToMMSS(value)}/100m`;
    }
    return `${Math.round(value)} W`;
  };
  
  export default DataTable;
  export { calculateThresholds };
  
  export const calculatePolynomialRegression = (results) => {
    const xVals = results.map(r => r.power);
    const yVals = results.map(r => r.lactate);
    
    const polyRegression = (() => {
      const n = xVals.length;
      const X = [];
      const Y = [];

      for (let i = 0; i < n; i++) {
        X.push([1, xVals[i], Math.pow(xVals[i], 2), Math.pow(xVals[i], 3)]);
        Y.push(yVals[i]);
      }

      const XT = math.transpose(X);
      const XTX = math.multiply(XT, X);
      const XTY = math.multiply(XT, Y);
      const coefficients = math.lusolve(XTX, XTY).flat();

      return (x) =>
        coefficients[0] +
        coefficients[1] * x +
        coefficients[2] * Math.pow(x, 2) +
        coefficients[3] * Math.pow(x, 3);
    })();

    // Generate points for polynomial curve
    const minPower = Math.min(...xVals);
    const maxPower = Math.max(...xVals);
    const step = (maxPower - minPower) / 100;

    const polyPoints = [];
    for (let x = minPower; x <= maxPower; x += step) {
      polyPoints.push({ x, y: polyRegression(x) });
    }

    return polyPoints;
  };
  