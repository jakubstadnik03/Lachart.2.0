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
  Legend,
} from 'chart.js';
import { calculateThresholds, calculatePolynomialRegression, calculatePolynomialRegressionLactateToHR } from './DataTable';
import { convertPowerToPace } from '../../utils/paceConverter';
import { calculateZonesFromTest } from './zoneCalculator';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const TestComparison = ({ tests = [] }) => {
  const chartRef = useRef(null);
  const [showThresholdPoints, setShowThresholdPoints] = useState(true);
  const [showHeartRateGraph, setShowHeartRateGraph] = useState(false);

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
    'LTP1': '#16a34a',
    'LTP2': '#dc2626',
    'LTRatio': '#94a3b8'
  };

  // Distinct shades for LT1/LT2 dashed lines per test so each test is recognizable
  const ltp1Shades = ['22, 163, 74', '34, 197, 94', '74, 222, 128', '134, 239, 172', '187, 247, 208']; // zelené: tmavší → světlejší
  const ltp2Shades = ['220, 38, 38', '248, 113, 113', '252, 165, 165', '254, 202, 202', '254, 226, 226'];  // červené: tmavší → světlejší
  const getLtp1Color = (testIndex) => `rgba(${ltp1Shades[Math.min(testIndex, ltp1Shades.length - 1)]}, 0.9)`;
  const getLtp2Color = (testIndex) => `rgba(${ltp2Shades[Math.min(testIndex, ltp2Shades.length - 1)]}, 0.9)`;

  // Vypočítáme thresholds pro každý test + HR polynom pro HR view
  const testsWithThresholds = validTests.map(test => {
    const thresholds = calculateThresholds(test);
    const polyPoints = calculatePolynomialRegression(test.results);
    const polyPointsLactateToHR = calculatePolynomialRegressionLactateToHR(test.results);
    const resultsWithHR = (test.results || []).filter(r => {
      const hr = r.heartRate;
      if (hr == null || hr === '') return false;
      const n = Number(String(hr).replace(',', '.'));
      return !isNaN(n) && n >= 40 && n <= 220;
    });
    return {
      ...test,
      thresholds,
      polyPoints,
      polyPointsLactateToHR,
      resultsWithHR
    };
  });

  // Vytvoříme datasety pro křivky (power/pace view)
  const datasetsPower = testsWithThresholds.map((test, testIndex) => {
    const opacity = validTests.length === 1 ? 1 : 0.3 + ((0.7 * (validTests.length - 1 - testIndex)) / (validTests.length - 1));

    const measuredDataset = {
      label: `${new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} - Data points`,
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

    const polyDataset = {
      label: `${new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} - Polynomial Fit`,
      data: test.polyPoints.map(point => ({ ...point, testIndex: testIndex })),
      borderColor: `rgba(33, 150, 243, ${opacity})`,
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointBorderWidth: 0,
      borderWidth: 2,
      tension: 0.4,
      showLine: true,
      order: testIndex * 3 + 1,
      hitRadius: 10 // Allow hovering over the line
    };

    const thresholdDatasets = Object.entries(test.thresholds)
      .filter(([key]) => !['heartRates', 'lactates', 'LTRatio'].includes(key))
      .map(([key, value]) => {
        const color = zoneColors[key];
        const rgbaColor = `rgba(${hexToRgb(color)}, ${opacity})`;
        return {
          label: `${new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} - ${key}`,
          data: [{ x: value, y: test.thresholds.lactates[key] || 0, label: key, testIndex: testIndex }],
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

  // Datasety pro HR view: X = lactate (mmol/L), Y = tepy (heart rate bpm), červená křivka
  const datasetsHR = testsWithThresholds.map((test, testIndex) => {
    const opacity = validTests.length === 1 ? 1 : 0.3 + ((0.7 * (validTests.length - 1 - testIndex)) / (validTests.length - 1));
    const redRgba = `rgba(220, 38, 38, ${opacity})`;

    const measuredDataset = {
      label: `${new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} - Data points`,
      data: test.resultsWithHR.map((r, pointIndex) => ({
        x: Number(String(r.lactate).replace(',', '.')),
        y: Number(String(r.heartRate).replace(',', '.')),
        pointIndex: pointIndex + 1,
        testIndex: testIndex
      })),
      borderColor: redRgba,
      backgroundColor: 'transparent',
      pointRadius: 6,
      pointBorderColor: `rgba(0, 0, 0, ${opacity})`,
      pointBackgroundColor: `rgba(254, 242, 242, ${opacity})`,
      pointBorderWidth: 2,
      borderWidth: 2,
      tension: 0.4,
      showLine: false,
      order: testIndex * 3
    };

    const polyDataset = {
      label: `${new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} - Polynomial Fit`,
      data: test.polyPointsLactateToHR.map(point => ({ ...point, testIndex: testIndex })),
      borderColor: redRgba,
      backgroundColor: 'transparent',
      pointRadius: 0,
      pointBorderWidth: 0,
      borderWidth: 2,
      tension: 0.4,
      showLine: true,
      order: testIndex * 3 + 1,
      hitRadius: 10 // Allow hovering over the line
    };

    const thresholdDatasets = (test.thresholds?.heartRates && test.thresholds?.lactates)
      ? (['LTP1', 'LTP2', 'IAT', 'Log-log']).filter(key => {
          const hr = test.thresholds.heartRates[key];
          const la = test.thresholds.lactates[key];
          return hr != null && !isNaN(Number(hr)) && la != null && !isNaN(Number(la));
        }).map(key => {
          const color = zoneColors[key];
          const rgbaColor = `rgba(${hexToRgb(color)}, ${opacity})`;
          return {
            label: `${new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} - ${key}`,
            data: [{ x: Number(test.thresholds.lactates[key]), y: Number(test.thresholds.heartRates[key]), label: key, testIndex: testIndex }],
            borderColor: rgbaColor,
            backgroundColor: rgbaColor,
            pointRadius: 8,
            pointStyle: 'circle',
            showLine: false,
            order: testIndex * 3 + 2
          };
        })
      : [];

    return [measuredDataset, polyDataset, ...thresholdDatasets];
  }).flat();

  const datasets = showHeartRateGraph ? datasetsHR : datasetsPower;
  const hasAnyHRData = testsWithThresholds.some(t => (t.resultsWithHR || []).length >= 2);

  const displayDatasets = showThresholdPoints
    ? datasets
    : datasets.filter(ds => {
        const suffix = ds.label.split(' - ')[1];
        return suffix === 'Data points' || suffix === 'Polynomial Fit';
      });

  const allPowerValues = validTests.flatMap(test => test.results.map(result => result.power));
  const minPower = Math.min(...allPowerValues);
  const maxPower = Math.max(...allPowerValues);
  const powerRange = maxPower - minPower;
  const axisLimitsPower = {
    min: minPower - (powerRange * 0.1),
    max: maxPower + (powerRange * 0.1)
  };

  const allHRValues = validTests.flatMap(test =>
    (test.results || []).map(r => Number(String(r.heartRate).replace(',', '.'))).filter(n => !isNaN(n) && n >= 40 && n <= 220)
  ).concat(
    testsWithThresholds.flatMap(t => Object.values(t.thresholds?.heartRates || {}).filter(v => v != null && !isNaN(Number(v))).map(Number))
  );
  const minHR = allHRValues.length ? Math.min(...allHRValues) : 80;
  const maxHR = allHRValues.length ? Math.max(...allHRValues) : 180;
  const hrRange = maxHR - minHR || 50;
  const axisLimitsHRY = {
    min: Math.max(0, minHR - hrRange * 0.1),
    max: Math.min(250, maxHR + hrRange * 0.1)
  };

  const allLactateValuesHR = validTests.flatMap(test =>
    (test.results || []).map(r => Number(String(r.lactate).replace(',', '.'))).filter(n => !isNaN(n))
  ).concat(
    testsWithThresholds.flatMap(t => Object.values(t.thresholds?.lactates || {}).filter(v => v != null && !isNaN(Number(v))).map(Number))
  );
  const minLactateHR = allLactateValuesHR.length ? Math.min(...allLactateValuesHR) : 0;
  const maxLactateHR = allLactateValuesHR.length ? Math.max(...allLactateValuesHR) : 4;
  const lactateRangeHR = maxLactateHR - minLactateHR || 1;
  const axisLimitsHRX = {
    min: Math.max(0, minLactateHR - lactateRangeHR * 0.1),
    max: maxLactateHR + lactateRangeHR * 0.1
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    scales: {
      y: {
        beginAtZero: showHeartRateGraph ? false : true,
        min: showHeartRateGraph ? axisLimitsHRY.min : undefined,
        max: showHeartRateGraph ? axisLimitsHRY.max : undefined,
        grid: { color: "rgba(0, 0, 0, 0.1)", borderDash: [5, 5] },
        title: {
          display: true,
          text: showHeartRateGraph ? "Heart rate (bpm) / Tepy" : "Lactate (mmol/L)",
          font: { size: 14 }
        },
        ticks: showHeartRateGraph ? { callback: (value) => Math.round(value) } : undefined
      },
      x: {
        type: 'linear',
        min: showHeartRateGraph ? axisLimitsHRX.min : axisLimitsPower.min,
        max: showHeartRateGraph ? axisLimitsHRX.max : axisLimitsPower.max,
        reverse: !showHeartRateGraph && sport !== 'bike',
        grid: { color: "rgba(0, 0, 0, 0.1)", borderDash: [5, 5] },
        title: {
          display: true,
          text: showHeartRateGraph ? "Lactate (mmol/L)" : (sport === 'bike' ? "Power (W)" : "Pace (min/km)"),
          font: { size: 14 }
        },
        ticks: {
          callback: function(value) {
            if (showHeartRateGraph) return value.toFixed(1);
            return convertPowerToPace(value, sport);
          }
        }
      },
    },
    plugins: {
      tooltip: {
        enabled: true,
        mode: 'nearest',
        intersect: false,
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
          title: function(tooltipItems) {
            const item = tooltipItems[0];
            const date = item.dataset.label.split(' - ')[0];
            return date;
          },
          label: function(context) {
            const point = context.raw;
            const testIndex = point.testIndex;
            const currentTest = testsWithThresholds[testIndex];
            const datasetLabel = context.dataset.label.split(' - ')[1];

            if (showHeartRateGraph) {
              const lactateStr = `${point.x.toFixed(1)} mmol/L`;
              const hrStr = `${Math.round(point.y)} bpm`;
              if (datasetLabel === 'Data points' || datasetLabel === 'Polynomial Fit') {
                return `Lactate: ${lactateStr} | HR: ${hrStr}`;
              }
              return `${datasetLabel}: Lactate ${lactateStr} | HR ${hrStr}`;
            }

            const xValue = sport === 'bike' ? `${Math.round(point.x)} W` : convertPowerToPace(point.x, sport);

            if (datasetLabel === 'Data points' || datasetLabel === 'Polynomial Fit') {
              return `${datasetLabel}: ${sport === 'bike' ? 'Power' : 'Pace'} ${xValue} | Lactate ${point.y.toFixed(1)} mmol/L`;
            }

            if (datasetLabel === 'LTRatio') {
              return `${datasetLabel}: Ratio ${currentTest.thresholds.LTRatio || 'N/A'}`;
            }

            const hr = currentTest.thresholds.heartRates[datasetLabel];
            return `${datasetLabel}: ${sport === 'bike' ? 'Power' : 'Pace'} ${xValue} | Lactate ${point.y.toFixed(1)} mmol/L | HR ${hr ? Math.round(hr) : 'N/A'} bpm`;
          }
        }
      },
      legend: { display: false }
    },
  };

  return (
    <div className="w-full p-2 sm:p-4 bg-white rounded-2xl shadow-lg overflow-x-auto">
      <div className="flex items-center justify-end gap-2 mb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowHeartRateGraph(s => !s)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showHeartRateGraph ? 'bg-white border-gray-200 text-gray-700 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
          title={showHeartRateGraph ? 'Switch to power/pace vs lactate' : 'Switch to heart rate vs lactate'}
        >
          {showHeartRateGraph ? 'Show power/pace graph' : 'Show heart rate graph'}
        </button>
        <button
          type="button"
          onClick={() => setShowThresholdPoints(s => !s)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showThresholdPoints
              ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              : 'bg-gray-100 border-gray-200 text-gray-600'
          }`}
          title={showThresholdPoints ? 'Hide LTP1, LTP2, OBLA, etc. and show only curves and data points' : 'Show threshold points again'}
        >
          {showThresholdPoints ? 'Hide threshold points' : 'Show threshold points'}
        </button>
      </div>
      <div className="relative w-full h-[350px] sm:h-[600px] md:h-[400px]">
        {showHeartRateGraph && !hasAnyHRData ? (
          <div className="h-full flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center p-6">
            <p className="text-gray-600">No heart rate data in selected tests. Add HR (bpm) to at least 2 steps per test to see heart rate vs lactate.</p>
          </div>
        ) : (
          <Line 
            key={validTests.map(t => t._id).join(',')}
            ref={chartRef}
            options={options} 
            data={{ datasets: displayDatasets }}
            plugins={[{
              id: 'ltpLinesPlugin',
              afterDraw: (chart) => {
                if (showHeartRateGraph || !showThresholdPoints) return;
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const xScale = chart.scales.x;
                const testsList = testsWithThresholds;
                const dateStr = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                for (let testIndex = 0; testIndex < testsList.length; testIndex++) {
                  const test = testsList[testIndex];
                  const ltp1 = test.thresholds != null ? test.thresholds['LTP1'] : null;
                  const ltp2 = test.thresholds != null ? test.thresholds['LTP2'] : null;
                  const ltp1Lactate = test.thresholds?.lactates?.['LTP1'];
                  const ltp2Lactate = test.thresholds?.lactates?.['LTP2'];
                  const testDate = dateStr(test.date);
                  const linesToDraw = [];
                  if (ltp1 != null && ltp1 !== '') linesToDraw.push({ value: ltp1, lactate: ltp1Lactate, label: 'LT1', color: getLtp1Color(testIndex) });
                  if (ltp2 != null && ltp2 !== '') linesToDraw.push({ value: ltp2, lactate: ltp2Lactate, label: 'LT2', color: getLtp2Color(testIndex) });
                  for (let i = 0; i < linesToDraw.length; i++) {
                    const ltp = linesToDraw[i];
                    const xPixel = xScale.getPixelForValue(ltp.value);
                    if (xPixel < chartArea.left || xPixel > chartArea.right) continue;
                    ctx.save();
                    ctx.strokeStyle = ltp.color;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(xPixel, chartArea.top);
                    ctx.lineTo(xPixel, chartArea.bottom);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    const valueText = sport === 'bike' ? `Power: ${Math.round(ltp.value)}W` : convertPowerToPace(ltp.value, sport);
                    const lactateText = ltp.lactate != null ? `${Number(ltp.lactate).toFixed(2)} mmol/L` : '';
                    ctx.font = '11px sans-serif';
                    ctx.fillStyle = '#1f2937';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    const labelX = xPixel + 8;
                    const labelY = chartArea.top + 15 + testIndex * 28 + i * 14;
                    const fullLabel = testDate ? `${ltp.label} (${testDate}): ${valueText}${lactateText ? ' | ' + lactateText : ''}` : `${ltp.label}: ${valueText}${lactateText ? ' | ' + lactateText : ''}`;
                    ctx.fillText(fullLabel, labelX, labelY);
                    ctx.restore();
                  }
                }
              }
            }]}
          />
        )}
      </div>
      
      {/* Zones Comparison Table */}
      {validTests.length > 0 && (() => {
        const zonesForTests = validTests.map(test => calculateZonesFromTest(test));
        const hasValidZones = zonesForTests.some(z => z !== null);
        
        if (!hasValidZones) return null;
        
        const parsePaceToSeconds = (val) => {
          if (val == null) return 0;
          if (typeof val === 'number' && !isNaN(val)) return val;
          if (typeof val === 'string' && val.includes(':')) {
            const parts = val.split(':').map(Number);
            return (parts[0] || 0) * 60 + (parts[1] || 0);
          }
          return parseFloat(val) || 0;
        };
        const formatChangeValue = (change, isPace = false) => {
          if (change == null || Math.abs(change) < 0.1) return '0';
          const sign = change > 0 ? '+' : '';
          if (isPace && sport !== 'bike') {
            const secs = Math.abs(change);
            const mins = Math.floor(secs / 60);
            const sec = Math.round(secs % 60);
            return `${sign}${mins}:${sec.toString().padStart(2, '0')}`;
          }
          return `${sign}${Math.round(change)}`;
        };
        const renderChangeCell = (prevZones, currZones, zoneKey) => {
          if (!prevZones || !currZones) return null;
          const prevZone = (prevZones.power || prevZones.pace)?.[zoneKey];
          const currZone = (currZones.power || currZones.pace)?.[zoneKey];
          const prevHR = prevZones.heartRate?.[zoneKey];
          const currHR = currZones.heartRate?.[zoneKey];
          if (!prevZone || !currZone) return <td className="px-2 py-1.5 text-gray-400">−</td>;
          const prevMin = sport === 'bike' ? prevZone.min : parsePaceToSeconds(prevZone.min);
          const currMin = sport === 'bike' ? currZone.min : parsePaceToSeconds(currZone.min);
          const prevMax = sport === 'bike' ? prevZone.max : parsePaceToSeconds(prevZone.max);
          const currMax = sport === 'bike' ? currZone.max : parsePaceToSeconds(currZone.max);
          const changeMin = sport === 'bike' ? currMin - prevMin : prevMin - currMin;
          const changeMax = sport === 'bike' ? currMax - prevMax : prevMax - currMax;
          const isImprove = changeMin > 0;
          const hrChangeMin = currHR?.min != null && prevHR?.min != null ? currHR.min - prevHR.min : null;
          const hrChangeMax = currHR?.max != null && prevHR?.max != null ? currHR.max - prevHR.max : null;
          const hrImprove = hrChangeMin != null && hrChangeMin > 0;
          const noChange = Math.abs(changeMin) < 0.1 && (hrChangeMin == null || Math.abs(hrChangeMin) < 1);
          const bgClass = noChange ? 'bg-gray-50' : isImprove ? 'bg-emerald-50' : 'bg-red-50';
          const arrow = noChange ? '−' : isImprove ? '↑' : '↓';
          const textClass = noChange ? 'text-gray-500' : isImprove ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold';
          return (
            <td className={`px-2 py-1.5 text-xs border-l border-gray-200 ${bgClass}`} title={noChange ? 'No change' : isImprove ? 'Improvement' : 'Decline'}>
              <div className="space-y-0.5">
                <div className={textClass}>
                  <span className="mr-1" aria-hidden>{arrow}</span>
                  {sport === 'bike' ? `${formatChangeValue(changeMin)} / ${formatChangeValue(changeMax)} W` : `${formatChangeValue(changeMin, true)} / ${formatChangeValue(changeMax, true)}`}
                </div>
                {hrChangeMin != null && (hrChangeMin !== 0 || hrChangeMax !== 0) && (
                  <div className={hrImprove ? 'text-emerald-600 text-[10px]' : 'text-red-600 text-[10px]'}>
                    <span aria-hidden>{hrImprove ? '↑' : '↓'}</span> HR {formatChangeValue(hrChangeMin)} / {formatChangeValue(hrChangeMax)}
                  </div>
                )}
              </div>
            </td>
          );
        };

        return (
          <div className="mt-6 overflow-x-auto">
            <h3 className="text-lg font-semibold mb-4">Training Zones Comparison</h3>
            <p className="text-xs text-gray-500 mb-2">
              <span className="inline-flex items-center gap-1"><span className="text-emerald-600 font-medium">↑ improvement</span></span>
              {' · '}
              <span className="inline-flex items-center gap-1"><span className="text-red-600 font-medium">↓ decline</span></span>
              {' · '}
              Change columns = vs previous test.
            </p>
            <table className="min-w-full text-xs sm:text-sm border-collapse border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold border-r border-gray-200">Zone</th>
                  {validTests.map((test, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <th className="px-2 py-1.5 text-center font-medium text-gray-600 bg-gray-50 border-r border-gray-200 whitespace-nowrap" colSpan={1}>
                          Change
                        </th>
                      )}
                      <th className="px-3 py-2 text-left font-semibold border-r border-gray-200" colSpan={2}>
                        {new Date(test.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-600 border-r border-gray-200"></th>
                  {validTests.map((_, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <th className="px-2 py-1 text-center text-[10px] font-medium text-gray-500 bg-gray-50 border-r border-gray-200">vs prev.</th>}
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-600 border-r border-gray-200">{sport === 'bike' ? 'Power (W)' : 'Pace'}</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-gray-600 border-r border-gray-200">HR</th>
                    </React.Fragment>
                  ))}
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
                    <tr key={zoneNum} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-3 py-2 font-medium border-r border-gray-200">
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
                        if (testIndex > 0) {
                          return (
                            <React.Fragment key={`ch-${testIndex}`}>
                              {renderChangeCell(zonesForTests[testIndex - 1], zones, zoneKey)}
                              <td className="px-2 py-2 border-r border-gray-200">
                                {zones && (zones.power || zones.pace)?.[zoneKey]
                                  ? (sport === 'bike' ? `${(zones.power || zones.pace)[zoneKey].min}-${(zones.power || zones.pace)[zoneKey].max} W` : `${(zones.power || zones.pace)[zoneKey].min}–${(zones.power || zones.pace)[zoneKey].max}`)
                                  : '−'}
                              </td>
                              <td className="px-2 py-2 border-r border-gray-200">
                                {zones?.heartRate?.[zoneKey] ? `${zones.heartRate[zoneKey].min}-${zones.heartRate[zoneKey].max}` : '−'}
                              </td>
                            </React.Fragment>
                          );
                        }
                        return (
                          <React.Fragment key={testIndex}>
                            <td className="px-2 py-2 border-r border-gray-200">
                              {zones && (zones.power || zones.pace)?.[zoneKey]
                                ? (sport === 'bike' ? `${(zones.power || zones.pace)[zoneKey].min}-${(zones.power || zones.pace)[zoneKey].max} W` : `${(zones.power || zones.pace)[zoneKey].min}–${(zones.power || zones.pace)[zoneKey].max}`)
                                : '−'}
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              {zones?.heartRate?.[zoneKey] ? `${zones.heartRate[zoneKey].min}-${zones.heartRate[zoneKey].max}` : '−'}
                            </td>
                          </React.Fragment>
                        );
                      })}
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