// DataTable.jsx
// =============

import React, { useState } from 'react';

// Pomocná funkce pro lineární interpolaci
const interpolate = (x0, y0, x1, y1, targetY) => {
    return x0 + ((targetY - y0) * (x1 - x0)) / (y1 - y0);
  };
  
  // Funkce, která spočítá a vrátí thresholds (OBLA, Bsln + 0.5, LTP1, LTP2, …)
  const calculateThresholds = (mockData) => {
    const baseLactate = mockData.baseLactate;
    const { results } = mockData;
  
    // Pojmenované prahy, včetně LTP1, LTP2 a LTRatio.
    const thresholdKeys = [
      'OBLA 2.0', 'OBLA 2.5', 'OBLA 3.0', 'OBLA 3.5',
      'Bsln + 0.5', 'Bsln + 1.0', 'Bsln + 1.5',
      'LTP1', 'LTP2', 'LTRatio'
    ];
  
    // Objekt, kam budeme ukládat výsledky
    const thresholds = {
      // "Log-log" jen příklad; tady si bereme střed z naměřených bodů
      'Log-log': results[Math.floor(results.length / 2)].power,
      // Ukládáme HR a lactates do samostatných objektů
      heartRates: {},
      lactates: {}
    };
  
    // Definice cílových laktátů, 1:1 s thresholdKeys (kromě LTRatio)
    const ltp1Target = baseLactate * 1.5;  // LTP1
    const ltp2Target = baseLactate * 3.0;  // LTP2
    const targets = [
      2.0, 2.5, 3.0, 3.5, 
      baseLactate + 0.5, baseLactate + 1.0, baseLactate + 1.5,
      ltp1Target, ltp2Target
      // LTRatio nevstupuje jako "target lactate", spočteme až nakonec
    ];
  
    // Projdeme dvojice sousedních naměřených bodů
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
  
      // Každý cíl (OBLA, LTP1, LTP2) zkusíme najít mezi prev a curr
      targets.forEach((target, index) => {
        // thresholdKeys[index] = "OBLA 2.0" | "LTP1" | atd.
        if (prev.lactate <= target && curr.lactate >= target) {
          const key = thresholdKeys[index];
          
          // Interpolovaný výkon
          thresholds[key] = interpolate(
            prev.power, prev.lactate,
            curr.power, curr.lactate,
            target
          );
          
          // Interpolovaný heartRate
          thresholds.heartRates[key] = interpolate(
            prev.heartRate, prev.lactate,
            curr.heartRate, curr.lactate,
            target
          );
          
          // Cílový lactate (target)
          thresholds.lactates[key] = target;
        }
      });
    }
  
    // Pokud LTP1 a LTP2 existují, dopočítáme LTRatio
    if (thresholds['LTP1'] && thresholds['LTP2']) {
      thresholds['LTRatio'] = (
        thresholds['LTP2'] / thresholds['LTP1']
      ).toFixed(2);
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
    const baseClasses = "py-1 pr-4 pl-5 w-full border-b border-gray-200";
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
  
    // Seznam metod, včetně Log-log
    // plus cokoliv, co není heartRates / lactates
    const methods = [
      'Log-log',
      ...Object.keys(thresholds).filter(k =>
        k !== 'Log-log' && k !== 'heartRates' && k !== 'lactates'
      )
    ];
  
    // Definice sloupců (Method, Pwr, HR, La)
    const columns = [
      {
        header: 'Method',
        data: methods,
        descriptions: methods.map(method => methodDescriptions[method])
      },
      {
        header: 'Pwr (W)',
        data: methods.map((method) => {
          return thresholds[method]
            ? `${Math.round(thresholds[method])} W`
            : 'N/A';
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
            <div key={colIndex} className="w-[105px]">
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
  
  export default DataTable;
  export { calculateThresholds };
  