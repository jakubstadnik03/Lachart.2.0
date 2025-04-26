import React, { useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { calculateThresholds } from './DataTable';
import { convertPowerToPace, getPaceAxisLimits } from '../../utils/paceConverter';
import * as math from 'mathjs';

const TestComparison = ({ tests = [] }) => {
  const chartRef = useRef(null);
  const [hiddenPoints, setHiddenPoints] = useState(new Set());
  const [allPointsHidden, setAllPointsHidden] = useState(false);

  if (!tests.length) return null;

  const sport = tests[0]?.sport;
  const colorPalette = ['#2196F3', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];

  // Pomocná funkce pro převod hex na rgb
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
      : '0, 0, 0';
  };

  // Definice barev pro zóny
  const zoneColors = {
    'Measured data': '#000000',
    'Log-log': '#52525b',
    'OBLA 2.0': '#86efac',
    'OBLA 2.5': '#fdba74',
    'OBLA 3.0': '#818cf8',
    'OBLA 3.5': '#fda4af',
    'Bsln + 0.5': '#0d9488',
    'Bsln + 1.0': '#c026d3',
    'Bsln + 1.5': '#99f6e4',
    'LTP1': '#bef264',
    'LTP2': '#fcd34d',
    'LTRatio': '#94a3b8'
  };

  // Vypočítáme thresholds pro každý test
  const testsWithThresholds = tests.map(test => {
    const thresholds = calculateThresholds(test);
    
    // Polynomial Regression (degree 3)
    const xVals = test.results.map(r => r.power);
    const yVals = test.results.map(r => r.lactate);
    
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

    // Calculate LTRatio if both LTP1 and LTP2 exist
    if (thresholds.LTP1 && thresholds.LTP2) {
      const ratio = thresholds.LTP2 / thresholds.LTP1;
      if (ratio >= 1.1 && ratio <= 1.3) {
        thresholds.LTRatio = ratio.toFixed(2);
      }
    }

    return {
      ...test,
      thresholds,
      polyPoints
    };
  });

  // Vytvoříme datasety pro křivky
  const datasets = testsWithThresholds.map((test, testIndex) => {
    const opacity = tests.length === 1 ? 1 : 0.3 + ((0.7 * testIndex) / (tests.length - 1));

    // Dataset pro měřené body
    const measuredDataset = {
      label: `${new Date(test.date).toLocaleDateString('cs-CZ', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      })} - Data points`,
      data: test.results.map((result, pointIndex) => ({
        x: result.power,
        y: result.lactate,
        pointIndex: pointIndex + 1,
        testIndex: testIndex
      })),
      borderColor: `rgba(33, 150, 243, ${opacity})`,
      backgroundColor: 'transparent',
      pointRadius: 6,
      pointBorderColor: `rgba(0, 0, 0, ${opacity})`,
      pointBackgroundColor: `rgba(255, 255, 255, ${opacity})`,
      pointBorderWidth: 2,
      borderWidth: 2,
      tension: 0.4,
      showLine: false,
      order: testIndex * 3
    };

    // Dataset pro polynomickou křivku
    const polyDataset = {
      label: `${new Date(test.date).toLocaleDateString('cs-CZ', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      })} - Polynomial Fit`,
      data: test.polyPoints.map(point => ({
        ...point,
        testIndex: testIndex
      })),
      borderColor: `rgba(33, 150, 243, ${opacity})`,
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointBorderWidth: 0,
      borderWidth: 2,
      tension: 0.4,
      showLine: true,
      order: testIndex * 3 + 1
    };

    // Dataset pro thresholds
    const thresholdDatasets = Object.entries(test.thresholds)
      .filter(([key]) => !['heartRates', 'lactates', 'LTRatio'].includes(key))
      .map(([key, value]) => {
        const color = zoneColors[key];
        const rgbaColor = `rgba(${hexToRgb(color)}, ${opacity})`;
        return {
          label: `${new Date(test.date).toLocaleDateString('cs-CZ', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
          })} - ${key}`,
          data: [{
            x: value,
            y: test.thresholds.lactates[key] || 0,
            label: key,
            testIndex: testIndex
          }],
          borderColor: rgbaColor,
          backgroundColor: rgbaColor,
          pointRadius: 8,
          pointStyle: 'circle',
          showLine: false,
          order: testIndex * 3 + 2
        };
      });

    return [measuredDataset, polyDataset, ...thresholdDatasets];
  }).flat();

  // Najdeme všechny hodnoty power pro nastavení osy X
  const allPowerValues = tests.flatMap(test => 
    test.results.map(result => result.power)
  );
  
  const minPower = Math.min(...allPowerValues);
  const maxPower = Math.max(...allPowerValues);
  const powerRange = maxPower - minPower;
  const axisLimits = {
    min: minPower - (powerRange * 0.1),
    max: maxPower + (powerRange * 0.1)
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'point',
      intersect: true
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
          borderDash: [5, 5],
        },
        title: {
          display: true,
          text: "Lactate (mmol/L)",
          font: {
            size: 14
          }
        }
      },
      x: {
        type: 'linear',
        min: axisLimits.min,
        max: axisLimits.max,
        reverse: sport !== 'bike',
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
          borderDash: [5, 5],
        },
        title: {
          display: true,
          text: sport === 'bike' ? "Power (W)" : "Pace (min/km)",
          font: {
            size: 14
          }
        },
        ticks: {
          callback: function(value) {
            return convertPowerToPace(value, sport);
          }
        }
      },
    },
    plugins: {
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#000',
        bodyColor: '#000',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        titleAlign: 'center',
        bodyAlign: 'center',
        position: 'nearest',
        callbacks: {
          title: function(tooltipItems) {
            const item = tooltipItems[0];
            const date = item.dataset.label.split(' - ')[0];
            return date;
          },
          label: function(context) {
            const point = context.raw;
            const testIndex = point.testIndex;
            const currentTest = testsWithThresholds[testIndex];
            const xValue = sport === 'bike' 
              ? `${Math.round(point.x)}W` 
              : convertPowerToPace(point.x, sport);
            const datasetLabel = context.dataset.label.split(' - ')[1];
            if (datasetLabel === 'Data points' || datasetLabel === 'Polynomial Fit') {
              return [
                datasetLabel,
                `Power: ${xValue}`,
                `Lactate: ${point.y.toFixed(1)} mmol/L`
              ];
            } else if (datasetLabel === 'LTRatio') {
              return [
                datasetLabel,
                `Ratio: ${currentTest.thresholds.LTRatio || 'N/A'}`
              ];
            } else {
              const hr = currentTest.thresholds.heartRates[datasetLabel];
              return [
                datasetLabel,
                `Power: ${xValue}`,
                `Lactate: ${point.y.toFixed(1)} mmol/L`,
                `HR: ${hr ? Math.round(hr) : 'N/A'} bpm`
              ];
            }
          }
        }
      },
      legend: {
        display: false
      }
    },
  };

  const toggleAllPoints = () => {
    const chart = chartRef.current;
    if (!chart) return;

    const newHiddenPoints = new Set();
    if (!allPointsHidden) {
      // Hide all points but keep lines visible
      Object.keys(zoneColors).forEach(zone => {
        if (zone !== 'Data points' && zone !== 'Log-log') {
          newHiddenPoints.add(zone);
        }
      });
    }

    setHiddenPoints(newHiddenPoints);
    setAllPointsHidden(!allPointsHidden);

    // Update chart visibility - only hide points, keep lines visible
    datasets.forEach((dataset, index) => {
      const meta = chart.getDatasetMeta(index);
      const isPointDataset = dataset.label.includes('Data points') || 
                           dataset.label.includes('Polynomial Fit');
      meta.hidden = !allPointsHidden && !isPointDataset;
    });
    chart.update();
  };

  return (
    <div className="w-full p-2 sm:p-4 bg-white rounded-2xl shadow-lg overflow-x-auto">
      <div className="relative w-full h-[350px] sm:h-[600px] md:h-[400px]">
        <Line 
          ref={chartRef}
          options={options} 
          data={{ datasets }} 
        />
      </div>
      
      {/* Tabulka s porovnáním zón a legendou */}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 sm:px-4 py-2 text-left">Zone</th>
              {testsWithThresholds.map((test, i) => (
                <th key={i} className="px-2 sm:px-4 py-2 text-left" colSpan={2}>
                  {new Date(test.date).toLocaleDateString('cs-CZ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                  })}
                </th>
              ))}
              <th className="px-2 sm:px-4 py-2 text-left">
                <button
                  onClick={toggleAllPoints}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <span>{allPointsHidden ? 'Show All Points' : 'Hide All Points'}</span>
                  <svg 
                    className={`w-4 h-4 transform transition-transform ${allPointsHidden ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M19 9l-7 7-7-7" 
                    />
                  </svg>
                </button>
              </th>
            </tr>
            <tr className="bg-gray-50 border-t">
              <th className="px-2 sm:px-4 py-2 text-left"></th>
              {testsWithThresholds.map((_, i) => (
                <React.Fragment key={i}>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-600">
                    {sport === 'bike' ? 'Power' : 'Pace'}
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-600">HR</th>
                </React.Fragment>
              ))}
              <th className="px-2 sm:px-4 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {[
              'Data points',
              'Log-log',
              'OBLA 2.0',
              'OBLA 2.5',
              'OBLA 3.0',
              'OBLA 3.5',
              'Bsln + 0.5',
              'Bsln + 1.0',
              'Bsln + 1.5',
              'LTP1',
              'LTP2',
              'LTRatio'
            ].map(zone => (
              <tr key={zone} className="border-t">
                <td className="px-2 sm:px-4 py-2 font-medium text-xs sm:text-sm">{zone}</td>
                {testsWithThresholds.map((test, i) => (
                  <React.Fragment key={i}>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                      {zone === 'LTRatio' 
                        ? test.thresholds[zone] || 'N/A'
                        : test.thresholds[zone] 
                          ? sport === 'bike'
                            ? `${Math.round(test.thresholds[zone])}W`
                            : convertPowerToPace(test.thresholds[zone], sport)
                          : 'N/A'
                      }
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                      {zone !== 'LTRatio' && test.thresholds.heartRates && test.thresholds.heartRates[zone]
                        ? `${Math.round(test.thresholds.heartRates[zone])}bpm`
                        : 'N/A'
                      }
                    </td>
                  </React.Fragment>
                ))}
                <td className="px-2 sm:px-4 py-2">
                  <button
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full relative"
                    style={{
                      backgroundColor: zone === 'Data points' ? 'transparent' : zoneColors[zone],
                      border: '2px solid',
                      borderColor: zone === 'Data points' ? '#000' : zoneColors[zone],
                      opacity: hiddenPoints.has(zone) ? 0.5 : 1,
                    }}
                    onClick={() => {
                      const chart = chartRef.current;
                      if (chart) {
                        const datasetIndexes = datasets
                          .map((ds, i) => ds.label.includes(zone) ? i : -1)
                          .filter(i => i !== -1);
                        
                        const isCurrentlyHidden = !hiddenPoints.has(zone);
                        const newHiddenPoints = new Set(hiddenPoints);
                        
                        if (isCurrentlyHidden) {
                          newHiddenPoints.add(zone);
                        } else {
                          newHiddenPoints.delete(zone);
                        }
                        
                        setHiddenPoints(newHiddenPoints);
                        setAllPointsHidden(false);
                        
                        datasetIndexes.forEach(index => {
                          const meta = chart.getDatasetMeta(index);
                          meta.hidden = isCurrentlyHidden;
                        });
                        chart.update();
                      }
                    }}
                  >
                    {hiddenPoints.has(zone) && (
                      <div 
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          fontSize: '1em',
                          color: zone === 'Data points' ? '#000' : '#fff'
                        }}
                      >
                        /
                      </div>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TestComparison; 