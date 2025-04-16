// DataTable.jsx
// =============

import React, { useState } from 'react';

// Pomocná funkce pro lineární interpolaci
const interpolate = (x0, y0, x1, y1, targetY) => {
    return x0 + ((targetY - y0) * (x1 - x0)) / (y1 - y0);
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
        logLactate: Math.log(r.lactate)
      }));

      // console.log('Log-transformed data:', logData);

      let maxDeltaSlope = -Infinity;
      let breakpointIndex = 0;

      // Najít bod s největší změnou směrnice (druhá derivace)
      for (let i = 1; i < logData.length - 1; i++) {
        // Výpočet směrnic před a po bodu
        const slopeBefore = (logData[i].logLactate - logData[i-1].logLactate) /
                           (logData[i].logPower - logData[i-1].logPower);
        const slopeAfter = (logData[i+1].logLactate - logData[i].logLactate) /
                          (logData[i+1].logPower - logData[i].logPower);
        
        // Změna směrnice
        const deltaSlope = slopeAfter - slopeBefore;
        
        // console.log(`Point ${i}:`, {
        //   slopeBefore,
        //   slopeAfter,
        //   deltaSlope,
        //   power: results[i].power,
        //   lactate: results[i].lactate,
        //   heartRate: results[i].heartRate
        // });
        
        if (deltaSlope > maxDeltaSlope) {
          maxDeltaSlope = deltaSlope;
          breakpointIndex = i;
        }
      }

      const breakpoint = results[breakpointIndex];
      // console.log('Found breakpoint:', breakpoint);
      
      return {
        power: breakpoint.power,
        lactate: breakpoint.lactate,
        heartRate: breakpoint.heartRate
      };
    } catch (error) {
      console.error('Error in Log-log calculation:', error);
      return null;
    }
  };
  
  // Funkce pro nalezení LTP bodů
const findLactateThresholds = (results, baseLactate) => {
  if (!results || results.length < 3) {
    return { ltp1: null, ltp2: null };
  }

  const { secondDerivative } = calculateDerivatives(results);

  if (secondDerivative.length === 0) {
    return { ltp1: null, ltp2: null };
  }

  // Najít maximum druhé derivace jako LTP2 (nejprudší zrychlení růstu laktátu)
  const maxD2 = secondDerivative.reduce((max, curr) =>
    curr.value > max.value ? curr : max, secondDerivative[0]);

  // Najít první významný kladný bod druhé derivace jako LTP1
  const ltp1Candidate = secondDerivative.find(d => d.value > 0.0005);

  const ltp1 = ltp1Candidate ? ltp1Candidate.power : null;
  const ltp2 = maxD2 ? maxD2.power : null;

  return { ltp1, ltp2 };
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
    'Log-log': `A mathematical method that plots lactate values against power/pace on logarithmic scales. 
    The breaking point in this transformed curve indicates the anaerobic threshold.`,
    
    'OBLA 2.0': `Fixed lactate threshold at 2.0 mmol/L. Commonly used as a conservative estimate 
    of the aerobic threshold, particularly suitable for recreational athletes.`,
    
    'OBLA 2.5': `Fixed lactate threshold at 2.5 mmol/L. A moderate intensity marker that often 
    corresponds to longer sustainable training intensities.`,
    
    'OBLA 3.0': `Fixed lactate threshold at 3.0 mmol/L. Frequently used as an approximate marker 
    for the anaerobic threshold in endurance athletes.`,
    
    'OBLA 3.5': `Fixed lactate threshold at 3.5 mmol/L. Used for well-trained athletes who typically 
    show lactate deflection points at higher concentrations.`,
    
    'Bsln + 0.5': `Identifies the power/pace where lactate rises 0.5 mmol/L above individual baseline. 
    Accounts for personal variations in resting lactate levels.`,
    
    'Bsln + 1.0': `Power/pace where lactate is 1.0 mmol/L above baseline. Typically corresponds to 
    moderate intensity training zones.`,
    
    'Bsln + 1.5': `Power/pace where lactate is 1.5 mmol/L above baseline. Often indicates 
    higher intensity training zones.`,
    
    'LTP1': `First Lactate Turn Point - identifies the first significant increase in blood lactate 
    above baseline. Represents aerobic threshold. (Hofmann & Tschakert, 2017)`,
    
    'LTP2': `Second Lactate Turn Point - marks the point of accelerated lactate accumulation. 
    Represents anaerobic threshold. (Hofmann & Tschakert, 2017)`,
    
    'LTRatio': `The ratio between LTP2 and LTP1 powers/paces (typically 1.15-1.25). 
    Used to monitor training adaptations over time.`
  };
  
  // Vlastní jednoduchý Tooltip komponent
  const CustomTooltip = ({ children, title, methodName }) => {
    const [isVisible, setIsVisible] = useState(false);
  
    return (
      <div 
        className="relative"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isVisible && (
          <div className="absolute left-full ml-2 top-0 z-50 w-[300px]">
            <div className="bg-gray-100 rounded-lg shadow-xl overflow-hidden">
              {/* Nadpis */}
              <div className="bg-gray-200 px-3 py-1.5 border-b border-gray-300">
                <h3 className="text-gray-800 font-semibold">{methodName}</h3>
              </div>
              {/* Obsah */}
              <div className="p-3">
                <p className="text-gray-600 text-sm leading-relaxed">
                  {title}
                </p>
              </div>
              {/* Šipka */}
              <div 
                className="absolute left-0 top-4 -ml-2 w-0 h-0 
                border-t-[8px] border-t-transparent 
                border-r-[8px] border-r-gray-100 
                border-b-[8px] border-b-transparent"
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
          return thresholds.lactates[method]
            ? thresholds.lactates[method].toFixed(2)
            : 'N/A';
        })
      }
    ];
  
    return (
      <div className="flex flex-col items-start w-full max-w-[400px] text-sm">
        <div className="flex justify-between items-start w-full">
          {columns.map((column, colIndex) => (
            <div key={colIndex} className="md:w-[105px] sm:w-[100px]">
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
    
    if (sport === 'run' || sport === 'swim') {
      return `${formatSecondsToMMSS(value)}/km`;
    }
    return `${Math.round(value)} W`;
  };
  
  export default DataTable;
  export { calculateThresholds };
  