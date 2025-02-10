// DataTable.jsx
// =============

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
        data: methods
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
  
    // Pomocná komponenta pro buňku tabulky
    const TableCell = ({ children, isHeader }) => {
      const baseClasses = "py-1 pr-4 pl-5 w-full border-b border-gray-200";
      const headerClasses = isHeader ? "text-sm font-semibold text-gray-900 bg-white border-t" : "";
      return (
        <div className={`${baseClasses} ${headerClasses}`}>
          {children}
        </div>
      );
    };
  
    return (
      <div className="flex flex-col items-start w-full max-w-[400px] text-sm">
        <div className="flex justify-between items-start w-full">
          {columns.map((column, colIndex) => (
            <div key={colIndex} className="w-[105px]">
              <TableCell isHeader>{column.header}</TableCell>
              {column.data.map((item, rowIndex) => (
                <TableCell key={rowIndex}>
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
  