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
    const [hoveredDataset, setHoveredDataset] = useState(null);
  
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
      setHoveredDataset(dsLabel);
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
      setHoveredDataset(null);
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
      <div className="flex flex-col items-start my-auto text-xs font-semibold text-black w-[100px]">
        {legendItems.map((item, index) => (
          <div
            key={index}
            className={`cursor-pointer ${hiddenDatasets[item.dsLabel] ? 'line-through text-gray-400' : ''} ${index > 0 ? 'pt-1, pb-1' : ''}`}
            onClick={() => handleToggle(item.dsLabel)}
            onMouseEnter={() => handleMouseEnter(item.dsLabel)}
            onMouseLeave={handleMouseLeave}
             title="Click to toggle"
          >
            <div className="flex gap-2.5">
              <div 
              className={`flex shrink-0 my-auto w-2.5 h-2.5 rounded-full ${item.color}`} />
              <div>{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  
const LactateCurveCalculator = ({ mockData }) => {
  const chartRef = useRef(null);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-');
  };

  if (!mockData || !mockData.results) {
    console.error('mockData or mockData.results is not defined');
    return null;
  }

  const thresholds = calculateThresholds(mockData);
  const results = mockData.results;
  const xVals = results.map(r => r.power);
  const yVals = results.map(r => r.lactate);

  // Polynomial Regression (degree 3)
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
  const step = 0.1; // Increase density of points

  const polyPoints = [];
  for (let x = minPower; x <= maxPower; x += step) {
    polyPoints.push({ x, y: polyRegression(x) });
  }

  const measuredDataSet = {
    label: 'Measured data',
    data: results.map(r => ({ x: r.power, y: r.lactate })),
    showLine: false,
    pointBackgroundColor: '#f8fafc',
    pointBorderColor: '#000000',
    pointBorderWidth: 1,
    pointRadius: 5,
  };

  const polyDataSet = {
    label: 'Polynomial Fit',
    data: polyPoints,
    borderColor: '#2196F3',
    pointRadius: 0, // Points are invisible
    showLine: true,
  };


  const thresholdDatasets = Object.keys(thresholds).filter(key => !['heartRates', 'lactates'].includes(key)).map(key => ({
    label: key,
    data: [{ x: thresholds[key], y: thresholds.lactates[key] }],
    borderColor: colorMap[key] || '#2196F3',
    backgroundColor: colorMap[key] || '#2196F3',
    pointRadius: 6,
    showLine: false,
  }));

  const allDatasets = [...thresholdDatasets, measuredDataSet, polyDataSet]; 

  const data = { datasets: allDatasets };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear',
        min: minPower - 10,
        max: maxPower + 10,
        title: { display: true, text: 'Power (W)' },
        border: { dash: [6, 6] },
        grid: {
          color: "rgba(0, 0, 0, 0.15)",
          borderDash: [4, 4],
          drawTicks: true,
        },
      },
      y: {
        type: 'linear',
        min: 0,
        max: Math.ceil(Math.max(...yVals) + 1)        ,
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
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label;
            const xVal = ctx.parsed.x;
            const yVal = ctx.parsed.y;
            return `${label}: ${xVal.toFixed(0)} W | ${yVal.toFixed(2)} mmol/L`;
          }
        }
      },
    },
    elements: {
      point: {
        radius: (ctx) => {
          const hoveredIndex = ctx.chart.tooltip?.dataPoints?.[0]?.index;
          return ctx.dataIndex === hoveredIndex ? 8 : 4; // Zvýrazní bod pod kurzorem
        },
        borderWidth: (ctx) => {
          const hoveredIndex = ctx.chart.tooltip?.dataPoints?.[0]?.index;
          return ctx.dataIndex === hoveredIndex ? 3 : 1;
        },
      },
    },
  };
  

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 bg-white rounded-2xl shadow-lg mt-3 sm:mt-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold">
            Lactate Curve <span className="text-base sm:text-lg text-gray-600 ml-2">({formatDate(mockData.date)})</span>
          </h2>
          <p className="text-sm sm:text-base text-gray-500">
            Base Lactate: <span className="text-blue-500 font-medium">{mockData.baseLactate} mmol/L</span>
          </p>
        </div>
        
        <div className="flex flex-row gap-4 w-full">
          {/* Chart and Legend container */}
          <div className="flex flex-row gap-4 flex-1">
            <div className="flex-1 min-w-0" style={{ height: '300px', minHeight: '200px' }}>
              <Line ref={chartRef} data={data} options={options} />
            </div>
            <div className="w-[200px] shrink-0">
              <Legend chartRef={chartRef} />
            </div>
          </div>
          
          {/* DataTable */}
          <div className="w-[400px] shrink-0">
            <DataTable mockData={mockData} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LactateCurveCalculator;
