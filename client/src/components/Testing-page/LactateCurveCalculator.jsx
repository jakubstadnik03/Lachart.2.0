import React, { useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
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

const convertSpeedToPace = (speed, unitSystem = 'metric') => {
  // Převede rychlost na tempo
  if (!speed) return 0;
  if (unitSystem === 'imperial') {
    // Pro imperial: rychlost (mph) na tempo (sekundy na míli)
    return 3600 / speed;
  } else {
    // Pro metric: rychlost (km/h) na tempo (sekundy na km)
    return 3600 / speed;
  }
};

const LactateCurveCalculator = ({ mockData }) => {
  const chartRef = useRef(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const isRunning = mockData?.sport === 'run';
  const isSwimming = mockData?.sport === 'swim';
  const isPaceSport = isRunning || isSwimming;
  
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

  const thresholds = calculateThresholds(mockData);
  const results = mockData.results;
  
  // Convert values to numbers, handling decimal commas
  const xVals = results.map(r => {
    const power = r.power?.toString().replace(',', '.');
    return isPaceSport ? convertPaceToSpeed(Number(power), unitSystem) : Number(power);
  });
  
  const yVals = results.map(r => {
    const lactate = r.lactate?.toString().replace(',', '.');
    return Number(lactate);
  });

  // Sort results by pace (slowest to fastest) for running and swimming
  const sortedResults = isPaceSport 
    ? [...results].sort((a, b) => {
        const aPower = Number(a.power?.toString().replace(',', '.'));
        const bPower = Number(b.power?.toString().replace(',', '.'));
        return bPower - aPower; // Sort descending (slowest to fastest)
      })
    : results;

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
  const polyPoints = [];
  if (polyRegression) {
    const minPower = Math.min(...xVals);
    const maxPower = Math.max(...xVals);
    const step = (maxPower - minPower) / 100;

    for (let x = minPower; x <= maxPower; x += step) {
      try {
        const y = polyRegression(x);
        if (!isNaN(y) && isFinite(y)) {
          polyPoints.push({ x, y });
        }
      } catch (error) {
        console.warn('Error calculating polynomial point:', error);
      }
    }
  }

  const measuredDataSet = {
    label: 'Measured data',
    data: sortedResults.map(r => {
      const power = r.power?.toString().replace(',', '.');
      const lactate = r.lactate?.toString().replace(',', '.');
      return { 
        x: isPaceSport ? convertPaceToSpeed(Number(power), unitSystem) : Number(power), 
        y: Number(lactate),
        originalPace: isPaceSport ? r.power : null
      };
    }),
    showLine: false,
    pointBackgroundColor: '#f8fafc',
    pointBorderColor: '#000000',
    pointBorderWidth: 1,
    pointRadius: 5,
  };

  const polyDataSet = polyPoints.length > 0 ? {
    label: 'Polynomial Fit',
    data: polyPoints,
    borderColor: '#2196F3',
    pointRadius: 0,
    showLine: true,
  } : null;

  const thresholdDatasets = Object.keys(thresholds)
    .filter(key => !['heartRates', 'lactates'].includes(key))
    .map(key => ({
      label: key,
      data: [{
        x: isPaceSport ? convertPaceToSpeed(thresholds[key], unitSystem) : thresholds[key],
        y: thresholds.lactates[key],
        originalPace: isPaceSport ? thresholds[key] : null
      }],
      borderColor: colorMap[key] || '#2196F3',
      backgroundColor: colorMap[key] || '#2196F3',
      pointRadius: 6,
      showLine: false,
    }));

  const allDatasets = [
    ...thresholdDatasets,
    measuredDataSet,
    ...(polyDataSet ? [polyDataSet] : [])
  ];

  const data = { datasets: allDatasets };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        min: Math.min(...xVals) - (Math.max(...xVals) - Math.min(...xVals)) * 0.1,
        max: Math.max(...xVals) + (Math.max(...xVals) - Math.min(...xVals)) * 0.1,
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
            if (isPaceSport) {
              if (inputMode === 'pace') {
                const paceSeconds = convertSpeedToPace(value, unitSystem);
                const minutes = Math.floor(paceSeconds / 60);
                const seconds = Math.floor(paceSeconds % 60);
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
            
            if (isPaceSport) {
              if (inputMode === 'pace') {
                const paceStr = formatSecondsToMMSS(convertSpeedToPace(xVal, unitSystem));
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
              Lactate Curve <span className="text-base sm:text-lg text-gray-600 ml-2">({formatDate(mockData.date)})</span>
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
          <p className="text-sm sm:text-base text-gray-500">
            Base Lactate: <span className="text-blue-500 font-medium">{mockData.baseLactate} mmol/L</span>
          </p>
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
    </div>
  );
};

export default LactateCurveCalculator;
