import React, { useRef, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { calculateThresholds, calculatePolynomialRegression } from './DataTable';
import { convertPowerToPace } from '../../utils/paceConverter';
import { calculateZonesFromTest } from './zoneCalculator';

const TestComparison = ({ tests = [] }) => {
  const chartRef = useRef(null);
  const [hiddenPoints, setHiddenPoints] = useState(new Set());
  const [allPointsHidden, setAllPointsHidden] = useState(false);

  // Early return if no tests or tests array is empty
  if (!tests || !Array.isArray(tests) || tests.length === 0) {
    return (
      <div className="w-full p-2 sm:p-4 bg-white rounded-2xl shadow-lg">
        <div className="text-center py-4 text-gray-500">
          No tests selected for comparison
        </div>
      </div>
    );
  }

  // Ensure all tests have required data and sort by date (oldest first)
  const validTests = tests
    .filter(test => 
    test && 
    test.results && 
    Array.isArray(test.results) && 
    test.results.length > 0
    )
    .sort((a, b) => {
      // Sort by date: oldest first (ascending)
      return new Date(a.date) - new Date(b.date);
    });

  if (validTests.length === 0) {
    return (
      <div className="w-full p-2 sm:p-4 bg-white rounded-2xl shadow-lg">
        <div className="text-center py-4 text-gray-500">
          No valid test data available for comparison
        </div>
      </div>
    );
  }

  const sport = validTests[0]?.sport;

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
  const testsWithThresholds = validTests.map(test => {
    const thresholds = calculateThresholds(test);
    const polyPoints = calculatePolynomialRegression(test.results);
    
    return {
      ...test,
      thresholds,
      polyPoints
    };
  });

  // Vytvoříme datasety pro křivky
  // Starší testy (nižší index) budou světlejší (nižší opacity)
  const datasets = testsWithThresholds.map((test, testIndex) => {
    // Reverse opacity: oldest (index 0) = lightest (0.3), newest = darkest (1.0)
    const opacity = validTests.length === 1 ? 1 : 0.3 + ((0.7 * (validTests.length - 1 - testIndex)) / (validTests.length - 1));

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
  const allPowerValues = validTests.flatMap(test => 
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
      
      {/* Zones Comparison Table */}
      {validTests.length > 0 && (() => {
        const zonesForTests = validTests.map(test => calculateZonesFromTest(test));
        const hasValidZones = zonesForTests.some(z => z !== null);
        
        if (!hasValidZones) return null;
        
        return (
          <div className="mt-6 overflow-x-auto">
            <h3 className="text-lg font-semibold mb-4">Training Zones Comparison</h3>
            <table className="min-w-full text-xs sm:text-sm border-collapse">
          <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold">Zone</th>
                  {validTests.map((test, i) => (
                    <React.Fragment key={i}>
                      <th className="px-3 py-2 text-left font-semibold" colSpan={2}>
                  {new Date(test.date).toLocaleDateString('cs-CZ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                  })}
                </th>
                    </React.Fragment>
                  ))}
                  {validTests.length > 1 && (
                    <th className="px-3 py-2 text-left font-semibold">Change</th>
                  )}
            </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left"></th>
                  {validTests.map((_, i) => (
                <React.Fragment key={i}>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                        {sport === 'bike' ? 'Power (W)' : 'Pace'}
                  </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">HR (BPM)</th>
                </React.Fragment>
              ))}
                  {validTests.length > 1 && (
                    <th className="px-3 py-2 text-left"></th>
                  )}
            </tr>
          </thead>
          <tbody>
                {[1, 2, 3, 4, 5].map(zoneNum => {
                  const zoneKey = `zone${zoneNum}`;
                  const firstZones = zonesForTests[0];
                  if (!firstZones) return null;
                  
                  const powerOrPace = firstZones.power || firstZones.pace;
                  if (!powerOrPace || !powerOrPace[zoneKey]) return null;
                  
                  return (
                    <tr key={zoneNum} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          zoneNum === 1 ? 'bg-blue-100 text-blue-700' :
                          zoneNum === 2 ? 'bg-green-100 text-green-700' :
                          zoneNum === 3 ? 'bg-yellow-100 text-yellow-700' :
                          zoneNum === 4 ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {zoneNum}
                        </span>
                      </td>
                      {zonesForTests.map((zones, testIndex) => {
                        if (!zones) {
                          return (
                            <React.Fragment key={testIndex}>
                              <td className="px-3 py-2 text-gray-400">-</td>
                              <td className="px-3 py-2 text-gray-400">-</td>
                            </React.Fragment>
                          );
                        }
                        
                        const powerOrPaceZone = zones.power || zones.pace;
                        const hrZone = zones.heartRate;
                        const zone = powerOrPaceZone[zoneKey];
                        const hr = hrZone[zoneKey];
                        
                        return (
                          <React.Fragment key={testIndex}>
                            <td className="px-3 py-2">
                              {zone ? (
                                sport === 'bike' 
                                  ? `${zone.min}-${zone.max}W`
                                  : `${zone.min}–${zone.max}`
                              ) : '-'}
                    </td>
                            <td className="px-3 py-2">
                              {hr ? `${hr.min}-${hr.max}` : '-'}
                    </td>
                  </React.Fragment>
                        );
                      })}
                      {validTests.length > 1 && zonesForTests[0] && zonesForTests[1] && (() => {
                        const firstZone = (zonesForTests[0].power || zonesForTests[0].pace)?.[zoneKey];
                        const lastZone = (zonesForTests[zonesForTests.length - 1].power || zonesForTests[zonesForTests.length - 1].pace)?.[zoneKey];
                        const firstHR = zonesForTests[0].heartRate?.[zoneKey];
                        const lastHR = zonesForTests[zonesForTests.length - 1].heartRate?.[zoneKey];
                        
                        if (!firstZone || !lastZone) return <td className="px-3 py-2">-</td>;
                        
                        // Calculate change
                        const parsePaceToSeconds = (val) => {
                          if (typeof val === 'string' && val.includes(':')) {
                            const [min, sec] = val.split(':').map(Number);
                            return min * 60 + sec;
                          }
                          return typeof val === 'number' ? val : parseFloat(val) || 0;
                        };
                        
                        const firstMin = sport === 'bike' ? firstZone.min : parsePaceToSeconds(firstZone.min);
                        const firstMax = sport === 'bike' ? firstZone.max : parsePaceToSeconds(firstZone.max);
                        const lastMin = sport === 'bike' ? lastZone.min : parsePaceToSeconds(lastZone.min);
                        const lastMax = sport === 'bike' ? lastZone.max : parsePaceToSeconds(lastZone.max);
                        
                        // For bike: higher is better (more watts)
                        // For pace: lower is better (faster pace = less seconds)
                        const changeMin = sport === 'bike' 
                          ? lastMin - firstMin  // Positive = improvement
                          : firstMin - lastMin; // For pace: positive = improvement (faster = less seconds)
                        const changeMax = sport === 'bike'
                          ? lastMax - firstMax
                          : firstMax - lastMax;
                        
                        const hrChangeMin = lastHR?.min - firstHR?.min;
                        const hrChangeMax = lastHR?.max - firstHR?.max;
                        
                        const formatChange = (change, isPace = false) => {
                          if (Math.abs(change) < 0.1) return '0';
                          const sign = change > 0 ? '+' : '';
                          if (isPace && sport !== 'bike') {
                            const secs = Math.abs(change);
                            const mins = Math.floor(secs / 60);
                            const sec = Math.round(secs % 60);
                            return `${sign}${mins}:${sec.toString().padStart(2, '0')}`;
                          }
                          return `${sign}${Math.round(change)}`;
                        };
                        
                        // Determine if change is improvement
                        // For bike: positive change = improvement
                        // For pace: positive change = improvement (faster = less seconds)
                        const isImprovementMin = changeMin > 0;
                        const isImprovementMax = changeMax > 0;
                        const isHRImprovement = hrChangeMin > 0; // Higher HR zones = better fitness
                        
                        return (
                          <td className="px-3 py-2">
                            <div className="text-xs space-y-1">
                              <div className={changeMin !== 0 ? (isImprovementMin ? 'text-green-600 font-medium' : 'text-red-600') : 'text-gray-500'}>
                                {sport === 'bike' ? 'Power' : 'Pace'}: {formatChange(changeMin, true)} / {formatChange(changeMax, true)}
                              </div>
                              {hrChangeMin !== undefined && hrChangeMin !== 0 && (
                                <div className={isHRImprovement ? 'text-green-600 font-medium' : 'text-red-600'}>
                                  HR: {formatChange(hrChangeMin)} / {formatChange(hrChangeMax)}
                      </div>
                    )}
                            </div>
                </td>
                        );
                      })()}
              </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
        );
      })()}
    </div>
  );
};

export default TestComparison; 