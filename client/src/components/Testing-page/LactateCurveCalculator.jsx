import React, { useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import api from '../../services/api';
import { calculateZonesFromTest } from './zoneCalculator';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend as ChartLegend,
} from 'chart.js';
import * as math from 'mathjs'; // Import mathjs for matrix operations
import DataTable, { calculateThresholds } from './DataTable';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    ChartLegend
  );

const colorMap = {
    'Measured data': '#000000',  
    'Polynomial Fit': '#2196F3',  // Blue for polynomial curve
    'Log-log': '#52525b',       
    'IAT': '#3b82f6',          // Přidáno - modrá barva pro IAT
    'OBLA 2.0': '#86efac',      
    'OBLA 2.5': '#fdba74',      
    'OBLA 3.0': '#818cf8',      
    'OBLA 3.5': '#fda4af',      
    'Bsln + 0.5': '#0d9488',    
    'Bsln + 1.0': '#c026d3',    
    'Bsln + 1.5': '#99f6e4',    
    'LTP1': '#bef264',          // lime-300
    'LTP2': '#fcd34d',          // amber-300
    'LTRatio': '#94a3b8'        
  };

 
  const legendItems = [
    { color: 'border border-black border-solid bg-zinc-50', label: 'Data points', dsLabel: 'Measured data' },
    { color: 'bg-blue-600', label: 'Polynomial Fit', dsLabel: 'Polynomial Fit' },
    { color: 'bg-zinc-700', label: 'Log-log', dsLabel: 'Log-log' },
    { color: 'bg-blue-500', label: 'IAT', dsLabel: 'IAT' },  // Přidáno
    { color: 'bg-green-300', label: 'OBLA 2.0', dsLabel: 'OBLA 2.0' },
    { color: 'bg-orange-300', label: 'OBLA 2.5', dsLabel: 'OBLA 2.5' },
    { color: 'bg-indigo-400', label: 'OBLA 3.0', dsLabel: 'OBLA 3.0' },
    { color: 'bg-rose-400', label: 'OBLA 3.5', dsLabel: 'OBLA 3.5' },
    { color: 'bg-teal-600', label: 'Bsln + 0.5', dsLabel: 'Bsln + 0.5' },
    { color: 'bg-fuchsia-500', label: 'Bsln + 1.0', dsLabel: 'Bsln + 1.0' },
    { color: 'bg-teal-200', label: 'Bsln + 1.5', dsLabel: 'Bsln + 1.5' },
    { color: 'bg-lime-300', label: 'LTP1', dsLabel: 'LTP1' },
    { color: 'bg-amber-300', label: 'LTP2', dsLabel: 'LTP2' },
    { color: 'bg-slate-400', label: 'LTRatio', dsLabel: 'LTRatio' }
  ];
  const Legend = ({ chartRef }) => {
    const [hiddenDatasets, setHiddenDatasets] = useState({});
    const [hideAllActive, setHideAllActive] = useState(false);
    const [previousHiddenState, setPreviousHiddenState] = useState({});
  
    React.useEffect(() => {
      const chart = chartRef?.current;
      if (chart) {
        const initialHiddenState = {};
        chart.data.datasets.forEach((ds) => {
          initialHiddenState[ds.label] = false;
        });
        setHiddenDatasets(initialHiddenState);
      }
    }, [chartRef]);
  
    const handleToggle = (dsLabel) => {
      const chart = chartRef?.current;
      if (!chart) return;
  
      const datasetIndex = chart.data.datasets.findIndex(ds => ds.label === dsLabel);
      if (datasetIndex === -1) return;
  
      const isVisible = chart.isDatasetVisible(datasetIndex);
      chart.setDatasetVisibility(datasetIndex, !isVisible);
      chart.update();
  
      setHiddenDatasets(prev => ({ ...prev, [dsLabel]: isVisible }));
      
      // If user manually toggles something, deactivate "Hide all"
      if (hideAllActive) {
        setHideAllActive(false);
      }
    };

    const handleHideAll = () => {
      const chart = chartRef?.current;
      if (!chart) return;

      if (hideAllActive) {
        // Restore previous state
        chart.data.datasets.forEach((ds, index) => {
          const wasHidden = previousHiddenState[ds.label] || false;
          chart.setDatasetVisibility(index, !wasHidden);
        });
        setHiddenDatasets(previousHiddenState);
        setHideAllActive(false);
      } else {
        // Save current state
        const currentState = {};
        chart.data.datasets.forEach((ds, index) => {
          currentState[ds.label] = !chart.isDatasetVisible(index);
        });
        setPreviousHiddenState(currentState);
        
        // Hide everything except measured data and polynomial fit
        const newHiddenState = {};
        chart.data.datasets.forEach((ds, index) => {
          if (ds.label === 'Measured data' || ds.label === 'Polynomial Fit') {
            // Show measured data and polynomial fit
            chart.setDatasetVisibility(index, true);
            newHiddenState[ds.label] = false;
          } else {
            // Hide everything else
            chart.setDatasetVisibility(index, false);
            newHiddenState[ds.label] = true;
          }
        });
        
        setHiddenDatasets(newHiddenState);
        setHideAllActive(true);
      }
      
      chart.update();
    };
    const handleMouseEnter = (dsLabel) => {
      const chart = chartRef?.current;
      if (!chart) return;
    
      chart.data.datasets.forEach((ds) => {
       
        if (ds.label === dsLabel) {
          ds.pointRadius = 8;
          ds.backgroundOpacity = '80'
          if (ds.label === "Polynomial Fit"){
            ds.pointRadius = 4;
            ds.borderColor = '#2196F3';
            ds.pointRadius = 0;
            ds.borderColor = 'rgba(33,150,243)'
        }

        } else {
          ds.pointRadius = 6;

          ds.borderColor = colorMap[ds.label] + '30'; // 25% opacity
          ds.backgroundColor = colorMap[ds.label] + '30'; // 25% opacity
          if (ds.label === "Polynomial Fit"){
            ds.pointRadius = 4;
            ds.borderColor = '#2196F3';
            ds.pointRadius = 0;
            ds.borderColor = 'rgba(33,150,243,0.1)'
        }
        }
      });
    
      chart.update();
    };
    
    const handleMouseLeave = () => {
      const chart = chartRef?.current;
      if (!chart) return;
    
      chart.data.datasets.forEach((ds) => {
        ds.borderColor = colorMap[ds.label]; // Původní barva
        ds.backgroundColor = colorMap[ds.label];
        if (ds.label === "Polynomial Fit"){
          ds.borderColor = 'rgba(33,150,243)'
      }
      });
    
      chart.update();
    };
    
  
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2 text-xs font-semibold text-black w-full lg:w-[100px]">
        <div
          className={`cursor-pointer flex items-center ${
            hideAllActive ? 'line-through text-gray-400' : ''
          }`}
          onClick={handleHideAll}
          title="Hide all except measured data and polynomial fit"
        >
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-gray-400" />
            <div className="whitespace-nowrap">Hide all</div>
          </div>
        </div>
        {legendItems.map((item, index) => (
          <div
            key={index}
            className={`cursor-pointer flex items-center ${
              hiddenDatasets[item.dsLabel] ? 'line-through text-gray-400' : ''
            }`}
            onClick={() => handleToggle(item.dsLabel)}
            onMouseEnter={() => handleMouseEnter(item.dsLabel)}
            onMouseLeave={handleMouseLeave}
            title="Click to toggle"
          >
            <div className="flex items-center gap-2 min-w-[100px]">
              <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${item.color}`} />
              <div className="whitespace-nowrap">{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  
// Pomocné funkce pro konverzi tempa
const formatSecondsToMMSS = (seconds) => {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const convertPaceToSpeed = (seconds, unitSystem = 'metric') => {
  // Převede tempo na rychlost
  if (!seconds) return 0;
  if (unitSystem === 'imperial') {
    // Pro imperial: tempo (sekundy na míli) na rychlost (mph)
    return 3600 / seconds;
  } else {
    // Pro metric: tempo (sekundy na km) na rychlost (km/h)
    return 3600 / seconds;
  }
};

// Unused function - kept for potential future use
// const convertSpeedToPace = (speed, unitSystem = 'metric') => {
//   // Převede rychlost na tempo
//   if (!speed) return 0;
//   if (unitSystem === 'imperial') {
//     // Pro imperial: rychlost (mph) na tempo (sekundy na míli)
//     return 3600 / speed;
//   } else {
//     // Pro metric: rychlost (km/h) na tempo (sekundy na km)
//     return 3600 / speed;
//   }
// };

const LactateCurveCalculator = ({ mockData, demoMode = false }) => {
  const chartRef = useRef(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [zoneOverride, setZoneOverride] = useState(null);
  const isRunning = mockData?.sport === 'run';
  const isSwimming = mockData?.sport === 'swim';
  const isPaceSport = isRunning || isSwimming;
  const trainingTitle = (mockData?.title || mockData?.name || '').toString().trim();
  
  // Get unit system and input mode from mockData or default to metric/pace
  const unitSystem = mockData?.unitSystem || 'metric';
  const inputMode = mockData?.inputMode || 'pace';

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  if (!mockData || !mockData.results) {
    console.error('mockData or mockData.results is not defined');
    return null;
  }

  const openEmailModal = () => {
    const zones = calculateZonesFromTest(mockData);
    setZoneOverride(zones);
    setEmailStatus(null);
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    const testId = mockData?._id;
    if (!testId) {
      setEmailStatus({ type: 'error', message: 'Missing test id.' });
      return;
    }

    try {
      setSendingEmail(true);
      setEmailStatus(null);
      await api.post(`/test/${testId}/send-report-email`, {
        toEmail: emailTo?.trim() ? emailTo.trim() : null,
        overrides: zoneOverride ? { zones: zoneOverride } : null
      });
      setEmailStatus({ type: 'success', message: 'Email sent.' });
      setShowEmailModal(false);
    } catch (e) {
      const reason = e?.response?.data?.reason;
      const msg =
        reason === 'email_not_configured' ? 'Email is not configured on server.' :
        reason === 'forbidden' ? 'You do not have access to send this report.' :
        reason === 'test_not_found' ? 'Test not found.' :
        (e?.response?.data?.error || 'Failed to send email.');
      setEmailStatus({ type: 'error', message: msg });
    } finally {
      setSendingEmail(false);
    }
  };

  const thresholds = calculateThresholds(mockData);
  const results = mockData.results;
  
  // Filter out invalid results first
  const validResults = results.filter(r => {
    if (!r || r.power === undefined || r.power === null || r.lactate === undefined || r.lactate === null) {
      return false;
    }
    const power = r.power?.toString().replace(',', '.');
    const lactate = r.lactate?.toString().replace(',', '.');
    const powerNum = Number(power);
    const lactateNum = Number(lactate);
    
    if (isNaN(powerNum) || isNaN(lactateNum)) {
      return false;
    }
    
    if (isPaceSport) {
      // For pace sports, power should be positive (seconds)
      if (powerNum <= 0) return false;
    } else {
      // For bike, power should be positive (watts)
      if (powerNum <= 0) return false;
    }
    
    // Lactate should be positive
    if (lactateNum < 0) return false;
    
    return true;
  });
  
  if (validResults.length < 2) {
    console.warn('[LactateCurveCalculator] Not enough valid results:', validResults.length);
    return (
      <div className="flex flex-col gap-4 p-2 sm:p-4 bg-white rounded-2xl shadow-lg mt-3 sm:mt-5">
        <div className="text-center py-8">
          <div className="text-gray-500">Not enough valid data points to display the curve</div>
          <div className="text-sm text-gray-400 mt-2">
            Need at least 2 valid measurements with both power/pace and lactate values
          </div>
        </div>
      </div>
    );
  }
  
  // Convert values to numbers, handling decimal commas
  // For pace sports in pace-mode: keep X axis in seconds (pace) so we can reverse it (slower -> faster)
  const xVals = validResults.map(r => {
    const power = r.power?.toString().replace(',', '.');
    const v = Number(power);
    if (!isPaceSport) return v;
    if (inputMode === 'pace') return v; // seconds
    return convertPaceToSpeed(v, unitSystem); // speed mode
  });
  
  const yVals = validResults.map(r => {
    const lactate = r.lactate?.toString().replace(',', '.');
    return Number(lactate);
  });

  // Add base lactate point at the beginning of the graph if available
  const baseLactatePoint = (() => {
    const baseLa = mockData?.baseLactate || mockData?.baseLa;
    if (!baseLa || baseLa === 0) return null;
    
    const baseLaNum = typeof baseLa === 'string' 
      ? parseFloat(baseLa.toString().replace(',', '.')) 
      : Number(baseLa);
    
    if (isNaN(baseLaNum) || baseLaNum <= 0) return null;
    
    // Place base lactate before the slowest measurement with a small gap
    // For pace sports: use the slowest pace (highest value) and go slightly slower
    // For bike: use the lowest power and go slightly lower
    let baseX;
    if (isPaceSport) {
      if (inputMode === 'pace') {
        // In pace mode: xVals are in seconds, highest = slowest
        const maxPace = Math.max(...xVals); // Slowest pace (highest seconds)
        // Use smaller gap - approximately 15-20 seconds slower, or 3-5% if that's less
        // This ensures base lactate is close to the first measurement point
        const paceRange = Math.max(...xVals) - Math.min(...xVals);
        const gapSeconds = Math.min(20, paceRange * 0.05); // Max 20 seconds or 5% of range
        const basePace = maxPace + gapSeconds;
        baseX = basePace;
      } else {
        // In speed mode: xVals are already in km/h (converted from pace)
        // We need to find the slowest pace from valid data, then convert to speed
        const slowestPace = Math.max(...validResults.map(r => {
          const power = r.power?.toString().replace(',', '.');
          return Number(power);
        })); // Slowest pace in seconds
        const slowestSpeed = convertPaceToSpeed(slowestPace, unitSystem); // Convert to km/h
        baseX = Math.max(0.1, slowestSpeed * 0.9); // 10% slower than slowest, but at least 0.1 km/h
        
        // Validate: for running, speed should be reasonable (max ~30 km/h for elite, ~20 km/h for normal)
        // For swimming, max ~8 km/h
        const maxReasonableSpeed = isSwimming ? 10 : 30;
        if (baseX > maxReasonableSpeed) {
          // If calculated speed is too high, use a reasonable default
          baseX = slowestSpeed * 0.95; // Just slightly slower than slowest
          if (baseX > maxReasonableSpeed) {
            // If still too high, don't show base lactate point
            return null;
          }
        }
      }
    } else {
      // For bike: lowest power = slowest
      const minPower = Math.min(...xVals);
      baseX = Math.max(0, minPower * 0.9); // 10% lower than lowest, but at least 0
    }
    
    return {
      x: baseX,
      y: baseLaNum,
      label: 'Base Lactate',
      originalPace: isPaceSport && inputMode === 'pace' ? baseX : null
    };
  })();

  // Sort valid results by pace (slowest to fastest) for running and swimming
  const sortedResults = isPaceSport 
    ? [...validResults].sort((a, b) => {
        const aPower = Number(a.power?.toString().replace(',', '.'));
        const bPower = Number(b.power?.toString().replace(',', '.'));
        return bPower - aPower; // Sort descending (slowest to fastest)
      })
    : validResults;

  // Polynomial Regression (degree 3)
  const polyRegression = (() => {
    try {
      const n = xVals.length;
      if (n < 3) {
        console.warn('Not enough data points for polynomial regression');
        return null;
      }

      // Check for invalid or duplicate values
      const uniqueXVals = new Set(xVals);
      if (uniqueXVals.size < 3) {
        console.warn('Not enough unique x values for polynomial regression');
        return null;
      }

      const X = [];
      const Y = [];

      for (let i = 0; i < n; i++) {
        if (isNaN(xVals[i]) || isNaN(yVals[i])) {
          console.warn('Invalid data point found:', { x: xVals[i], y: yVals[i] });
          return null;
        }
        X.push([1, xVals[i], Math.pow(xVals[i], 2), Math.pow(xVals[i], 3)]);
        Y.push(yVals[i]);
      }

      try {
        const XT = math.transpose(X);
        const XTX = math.multiply(XT, X);
        const XTY = math.multiply(XT, Y);
        const coefficients = math.lusolve(XTX, XTY).flat();

        return (x) =>
          coefficients[0] +
          coefficients[1] * x +
          coefficients[2] * Math.pow(x, 2) +
          coefficients[3] * Math.pow(x, 3);
      } catch (error) {
        console.warn('Error in polynomial regression calculation:', error);
        return null;
      }
    } catch (error) {
      console.warn('Error in polynomial regression setup:', error);
      return null;
    }
  })();

  // Generate points for polynomial curve only if regression is valid
  // Curve can be decreasing if it better fits the data points
  // IMPORTANT: Curve starts from the first actual measurement, NOT from base lactate
  // Base lactate is only displayed as a reference point, but doesn't affect the curve
  const polyPoints = [];
  if (polyRegression) {
    // Determine the range for the curve - always based on actual measurements (xVals), not base lactate
    // For pace sports in pace mode: from slowest (highest) to fastest (lowest)
    // For pace sports in speed mode: from slowest (lowest) to fastest (highest)
    // For bike: from lowest to highest
    let startX, endX;
    if (isPaceSport && inputMode === 'pace') {
      // Pace mode: highest = slowest, lowest = fastest
      endX = Math.min(...xVals); // Fastest
      startX = Math.max(...xVals); // Slowest (always from actual measurements)
    } else {
      // Speed mode or bike: lowest = slowest, highest = fastest
      startX = Math.min(...xVals); // Slowest (always from actual measurements)
      endX = Math.max(...xVals); // Fastest
    }
    
    const step = Math.abs(endX - startX) / 300; // More points for smoother curve
    
    // Generate curve points from start to end (only actual measurements, not base lactate)
    const direction = startX < endX ? 1 : -1; // Determine direction
    for (let x = startX; direction * x <= direction * endX; x += direction * step) {
      try {
        let y = polyRegression(x);
        
        // Only ensure y is never negative (allow decreasing curve)
        if (y < 0) {
          y = 0;
        }
        
        if (!isNaN(y) && isFinite(y)) {
          polyPoints.push({ x, y });
        }
      } catch (error) {
        console.warn('Error calculating polynomial point:', error);
      }
    }
  }

  const measuredDataPoints = sortedResults
    .map(r => {
      const power = r.power?.toString().replace(',', '.');
      const lactate = r.lactate?.toString().replace(',', '.');
      const xRaw = Number(power);
      const x = isPaceSport
        ? (inputMode === 'pace' ? xRaw : convertPaceToSpeed(xRaw, unitSystem))
        : xRaw;
      
      // Validate x value - filter out unrealistic values
      if (isPaceSport && inputMode === 'speed') {
        // For running: max reasonable speed ~30 km/h, for swimming ~10 km/h
        const maxReasonableSpeed = isSwimming ? 10 : 30;
        if (x > maxReasonableSpeed || x < 0.1) {
          console.warn(`[LactateCurveCalculator] Filtering out unrealistic speed value: ${x} km/h`);
          return null;
        }
      }
      
      // Validate y value (lactate)
      const y = Number(lactate);
      if (isNaN(y) || y < 0 || y > 20) {
        console.warn(`[LactateCurveCalculator] Filtering out invalid lactate value: ${y} mmol/L`);
        return null;
      }
      
      return { 
        x,
        y,
        originalPace: isPaceSport ? r.power : null
      };
    })
    .filter(point => point !== null); // Remove null values

  // Add base lactate point at the beginning if it exists
  let allMeasuredDataPoints = baseLactatePoint 
    ? [baseLactatePoint, ...measuredDataPoints]
    : measuredDataPoints;

  // Sort all data points from slowest to fastest (by x value)
  // For pace sports in pace mode: highest x = slowest, lowest x = fastest (reverse order)
  // For pace sports in speed mode: lowest x = slowest, highest x = fastest (normal order)
  // For bike: lowest x = slowest, highest x = fastest (normal order)
  allMeasuredDataPoints = [...allMeasuredDataPoints].sort((a, b) => {
    if (isPaceSport && inputMode === 'pace') {
      // For pace mode: reverse order (highest x = slowest = first)
      return b.x - a.x;
    } else {
      // For speed mode or bike: normal order (lowest x = slowest = first)
      return a.x - b.x;
    }
  });

  const measuredDataSet = {
    label: 'Measured data',
    data: allMeasuredDataPoints,
    showLine: false,
    pointBackgroundColor: allMeasuredDataPoints.map((_, idx) => 
      idx === 0 && baseLactatePoint ? '#3b82f6' : '#f8fafc'  // Blue for base lactate
    ),
    pointBorderColor: allMeasuredDataPoints.map((_, idx) => 
      idx === 0 && baseLactatePoint ? '#1e40af' : '#000000'  // Darker blue border for base lactate
    ),
    pointBorderWidth: allMeasuredDataPoints.map((_, idx) => 
      idx === 0 && baseLactatePoint ? 2 : 1  // Thicker border for base lactate
    ),
    pointRadius: allMeasuredDataPoints.map((_, idx) => 
      idx === 0 && baseLactatePoint ? 6 : 5  // Slightly larger for base lactate
    ),
  };

  const polyDataSet = polyPoints.length > 0 ? {
    label: 'Polynomial Fit',
    data: polyPoints,
    borderColor: '#2196F3',
    pointRadius: 0,
    showLine: true,
  } : null;

  const thresholdDatasets = Object.keys(thresholds)
    .filter(key => !['heartRates', 'lactates', 'LTRatio'].includes(key)) // LTRatio je poměr, ne hodnota power/pace, takže ho nezobrazovat v grafu
    .map(key => {
      // Zkontrolovat, že máme validní hodnoty pro x a y
      let xValue = isPaceSport
        ? (inputMode === 'pace' ? thresholds[key] : convertPaceToSpeed(thresholds[key], unitSystem))
        : thresholds[key];
      const yValue = thresholds.lactates[key];
      
      // Validate x value - filter out unrealistic values for speed mode
      if (isPaceSport && inputMode === 'speed') {
        const maxReasonableSpeed = isSwimming ? 10 : 30;
        if (xValue > maxReasonableSpeed || xValue < 0.1) {
          console.warn(`[LactateCurveCalculator] Filtering out unrealistic threshold speed value: ${xValue} km/h for ${key}`);
          return null;
        }
      }
      
      // Pokud jsou hodnoty nevalidní (NaN, null, undefined), přeskočit tento threshold
      if (xValue == null || isNaN(xValue) || yValue == null || isNaN(yValue)) {
        return null;
      }
      
      return {
      label: key,
      data: [{
          x: xValue,
          y: yValue,
        originalPace: isPaceSport ? thresholds[key] : null
      }],
      borderColor: colorMap[key] || '#2196F3',
      backgroundColor: colorMap[key] || '#2196F3',
      pointRadius: 6,
      showLine: false,
      };
    })
    .filter(dataset => dataset !== null); // Odstranit null hodnoty

  const allDatasets = [
    ...thresholdDatasets,
    measuredDataSet,
    ...(polyDataSet ? [polyDataSet] : [])
  ];

  // Calculate X axis range - need to consider all data points (measured, base lactate, thresholds, polynomial)
  const allXValues = [
    ...xVals,
    ...(baseLactatePoint ? [baseLactatePoint.x] : []),
    ...(polyPoints.length > 0 ? polyPoints.map(p => p.x) : []),
    ...thresholdDatasets
      .filter(ds => ds !== null)
      .flatMap(ds => ds.data.map(d => d.x))
  ].filter(x => !isNaN(x) && isFinite(x));
  
  if (allXValues.length === 0) {
    console.warn('[LactateCurveCalculator] No valid X values for axis');
    return null;
  }
  
  const minX = Math.min(...allXValues);
  const maxX = Math.max(...allXValues);
  const xRange = maxX - minX;
  const padding = xRange * 0.1; // 10% padding on each side

  const data = { datasets: allDatasets };
  const isReverse = Boolean(isPaceSport && inputMode === 'pace');
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        reverse: isReverse,
        // For reverse axis (pace mode): 
        //   min = right side = fastest tempo (lowest seconds) = Math.min(...xVals)
        //   max = left side = slowest tempo (highest seconds) = Math.max(...xVals)
        // For normal axis:
        //   min = left side = slowest (lowest value)
        //   max = right side = fastest (highest value)
        min: isReverse
          ? Math.max(minX - padding, 0) // Show faster than fastest (right side)
          : Math.max(minX - padding, 0), // Show slower than slowest (left side)
        max: isReverse
          ? maxX + padding // Show slower than slowest (left side)
          : maxX + padding, // Show faster than fastest (right side)
        title: { 
          display: true, 
          text: isPaceSport ? 
            (inputMode === 'pace' ? 
              (isSwimming ? 
                (unitSystem === 'imperial' ? 'Pace (min/100yd)' : 'Pace (min/100m)') :
                (unitSystem === 'imperial' ? 'Pace (min/mile)' : 'Pace (min/km)')
              ) :
              (unitSystem === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)')
            ) : 
            'Power (W)' 
        },
        border: { dash: [6, 6] },
        grid: {
          color: "rgba(0, 0, 0, 0.15)",
          borderDash: [4, 4],
          drawTicks: true,
        },
        ticks: {
          callback: function(value) {
            // Show "Base Lactate" for base lactate point position
            if (baseLactatePoint && Math.abs(value - baseLactatePoint.x) < 0.01) {
              return 'Base Lactate';
            }
            if (isPaceSport) {
              if (inputMode === 'pace') {
                // value is already pace seconds
                const minutes = Math.floor(value / 60);
                const seconds = Math.floor(value % 60);
                const unit = isSwimming ? (unitSystem === 'imperial' ? '/100yd' : '/100m') : (unitSystem === 'imperial' ? '/mile' : '/km');
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${unit}`;
              } else {
                // Speed mode - show speed values
                const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
                return `${value.toFixed(1)}${unit}`;
              }
            }
            return `${Math.round(value)}W`;
          }
        }
      },
      y: {
        type: 'linear',
        min: 0,
        max: Math.ceil(Math.max(...yVals) + 1),
        title: { display: true, text: 'Lactate (mmol/L)' },
        border: { dash: [6, 6] },
        grid: {
          color: "rgba(0, 0, 0, 0.15)",
          borderDash: [4, 4],
          drawTicks: true,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: 'nearest',
        intersect: true,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#111827',
        titleFont: { weight: 'bold', size: 14 },
        bodyColor: '#111827',
        bodyFont: { size: 13 },
        borderColor: '#F3F4F6',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label;
            const xVal = ctx.parsed.x;
            const yVal = ctx.parsed.y;
            const point = ctx.raw;
            
            // Check if this is the base lactate point
            if (point && point.label === 'Base Lactate') {
              // For base lactate, show only the lactate value, not power/pace
              return `Base Lactate: ${yVal.toFixed(2)} mmol/L`;
            }
            
            if (isPaceSport) {
              if (inputMode === 'pace') {
                const paceStr = formatSecondsToMMSS(xVal);
                const unit = isSwimming ? (unitSystem === 'imperial' ? '/100yd' : '/100m') : (unitSystem === 'imperial' ? '/mile' : '/km');
                return `${label}: ${paceStr} ${unit} | ${yVal.toFixed(2)} mmol/L`;
              } else {
                // Speed mode - show speed values
                const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
                return `${label}: ${xVal.toFixed(1)}${unit} | ${yVal.toFixed(2)} mmol/L`;
              }
            }
            return `${label}: ${xVal.toFixed(0)} W | ${yVal.toFixed(2)} mmol/L`;
          },
          labelPointStyle: (context) => {
            return {
              pointStyle: 'circle',
              rotation: 0
            };
          }
        }
      },
    },
    elements: {
      point: {
        radius: (ctx) => {
          const hoveredIndex = ctx.chart.tooltip?.dataPoints?.[0]?.index;
          return ctx.dataIndex === hoveredIndex ? 8 : 4;
        },
        borderWidth: (ctx) => {
          const hoveredIndex = ctx.chart.tooltip?.dataPoints?.[0]?.index;
          return ctx.dataIndex === hoveredIndex ? 3 : 1;
        },
        hoverRadius: 8,
        hitRadius: 8,
      },
      line: {
        borderWidth: 2,
        tension: 0.4,
      }
    },
  };

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 bg-white rounded-2xl shadow-lg mt-3 sm:mt-5 relative">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold">
              Lactate Curve
              {trainingTitle && (
                <span className="text-base sm:text-lg text-gray-800 ml-2">
                  {trainingTitle}
                </span>
              )}
              <span className="text-base sm:text-lg text-gray-600 ml-2">({formatDate(mockData.date)})</span>
            </h2>
            <button
              onClick={() => setShowGlossary(true)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Show glossary"
              title="Training Glossary"
            >
              <InformationCircleIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          {!demoMode && (
            <div className="flex flex-col items-start sm:items-end gap-1">
              <button
                onClick={openEmailModal}
                disabled={sendingEmail}
                className={`px-3 py-2 text-xs sm:text-sm rounded-lg border transition-colors ${
                  sendingEmail
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-200'
                }`}
                title="Send report to email"
              >
                {sendingEmail ? 'Sending…' : 'Send results to email'}
              </button>
              {emailStatus?.message && (
                <div className={`text-xs ${emailStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {emailStatus.message}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
          <p className="text-sm sm:text-base text-gray-500">
              Base Lactate: <span className={`font-medium ${(!mockData.baseLactate || mockData.baseLactate === 0) ? 'text-red-500' : 'text-blue-500'}`}>
                {mockData.baseLactate || 0} mmol/L
              </span>
            </p>
            {(!mockData.baseLactate || mockData.baseLactate === 0) && (
              <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-md font-semibold">
                ⚠️ Missing
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-w-0" style={{ height: '400px', minHeight: '300px' }}>
            <Line ref={chartRef} data={data} options={options} />
          </div>
          
          <div className="w-full lg:w-[80px] shrink-0">
            <Legend chartRef={chartRef} />
          </div>
          
          <div className="w-full lg:w-[400px] shrink-0">
            <DataTable mockData={mockData} />
          </div>
        </div>
      </div>
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Lactate Curve"
        initialCategory="Lactate"
      />

      {/* Email modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowEmailModal(false)} />
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold text-gray-900">Send report to email</div>
                <div className="text-xs text-gray-500 truncate">
                  {mockData?.title ? mockData.title : 'Lactate test'} • {formatDate(mockData?.date)}
                </div>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-3 py-2 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-auto">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Recipient email (optional)</label>
                <input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="Leave empty to use your account email"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Zones (editable)</div>
                {!zoneOverride ? (
                  <div className="text-sm text-gray-600">Zones could not be calculated for this test.</div>
                ) : (
                  <div className="space-y-3">
                    {['zone1','zone2','zone3','zone4','zone5'].map((zKey) => {
                      const zNum = zKey.replace('zone','');
                      const main = mockData?.sport === 'bike' ? zoneOverride.power?.[zKey] : zoneOverride.pace?.[zKey];
                      const hr = zoneOverride.heartRate?.[zKey];
                      const mainLabel = mockData?.sport === 'bike' ? 'Power' : 'Pace';

                      const setMain = (field, val) => {
                        setZoneOverride((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev };
                          if (mockData?.sport === 'bike') {
                            next.power = { ...(next.power || {}) };
                            next.power[zKey] = { ...(next.power[zKey] || {}) };
                            next.power[zKey][field] = Number(val);
                          } else {
                            next.pace = { ...(next.pace || {}) };
                            next.pace[zKey] = { ...(next.pace[zKey] || {}) };
                            next.pace[zKey][field] = val;
                          }
                          return next;
                        });
                      };

                      const setHr = (field, val) => {
                        setZoneOverride((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev };
                          next.heartRate = { ...(next.heartRate || {}) };
                          next.heartRate[zKey] = { ...(next.heartRate[zKey] || {}) };
                          next.heartRate[zKey][field] = Number(val);
                          return next;
                        });
                      };

                      return (
                        <div key={zKey} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                          <div className="sm:col-span-2 text-sm font-semibold text-gray-900">Z{zNum}</div>
                          <div className="sm:col-span-5">
                            <div className="text-[11px] font-semibold text-gray-600 mb-1">{mainLabel}</div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={main?.min ?? ''}
                                onChange={(e) => setMain('min', e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder="min"
                              />
                              <input
                                value={main?.max ?? ''}
                                onChange={(e) => setMain('max', e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder="max"
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-5">
                            <div className="text-[11px] font-semibold text-gray-600 mb-1">HR</div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={hr?.min ?? ''}
                                onChange={(e) => setHr('min', e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder="min"
                              />
                              <input
                                value={hr?.max ?? ''}
                                onChange={(e) => setHr('max', e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder="max"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {emailStatus?.message && (
                <div className={`text-sm ${emailStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {emailStatus.message}
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-3 py-2 text-xs sm:text-sm bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className={`px-3 py-2 text-xs sm:text-sm rounded-lg border transition-colors ${
                  sendingEmail
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-primary text-white border-primary hover:opacity-90'
                }`}
              >
                {sendingEmail ? 'Sending…' : 'Send email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LactateCurveCalculator;
