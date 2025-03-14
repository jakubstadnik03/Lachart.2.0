import React, { useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { calculateThresholds } from './DataTable';
import { convertPowerToPace, getPaceAxisLimits } from '../../utils/paceConverter';

const TestComparison = ({ tests = [] }) => {
  const chartRef = useRef(null);
  const [hiddenPoints, setHiddenPoints] = useState(new Set());

  if (!tests.length) return null;

  const sport = tests[0]?.sport;
  const colorPalette = ['#2196F3', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];

  // Pomocná funkce pro převod hex na rgb - přesunuta nahoru
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
      : '0, 0, 0';
  };

  // Definice barev pro zóny (stejné jako v LactateCurveCalculator)
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
  const testsWithThresholds = tests.map(test => ({
    ...test,
    thresholds: calculateThresholds(test)
  }));

  // Vytvoříme datasety pro křivky
  const datasets = testsWithThresholds.map((test, testIndex) => {
    // Opravený výpočet opacity - pokud je jen jeden test, bude mít opacity 1
    const opacity = tests.length === 1 ? 1 : 0.3 + ((0.7 * testIndex) / (tests.length - 1));

    // Dataset pro křivku
    const curveDataset = {
      label: `${new Date(test.date).toLocaleDateString()} - Data points`,
      data: test.results.map((result, pointIndex) => ({
        x: result.power,
        y: result.lactate,
        pointIndex: pointIndex + 1
      })),
      borderColor: `rgba(33, 150, 243, ${opacity})`,
      backgroundColor: 'transparent',
      pointRadius: 6,
      pointBorderColor: `rgba(0, 0, 0, ${opacity})`,
      pointBackgroundColor: `rgba(255, 255, 255, ${opacity})`,
      pointBorderWidth: 2,
      borderWidth: 2,
      tension: 0.4,
      order: testIndex * 2
    };

    // Dataset pro thresholds
    const thresholdDatasets = Object.entries(test.thresholds)
      .filter(([key]) => !['heartRates', 'lactates', 'LTRatio'].includes(key))
      .map(([key, value]) => {
        const color = zoneColors[key];
        const rgbaColor = `rgba(${hexToRgb(color)}, ${opacity})`;
        return {
          label: `${new Date(test.date).toLocaleDateString()} - ${key}`,
          data: [{
            x: value,
            y: test.thresholds.lactates[key] || 0,
            label: key
          }],
          borderColor: rgbaColor,
          backgroundColor: rgbaColor,
          pointRadius: 8,
          pointStyle: 'circle',
          showLine: false,
          order: testIndex * 2 + 1
        };
      });

    return [curveDataset, ...thresholdDatasets];
  }).flat();

  // Najdeme všechny hodnoty power pro nastavení osy X
  const allPowerValues = tests.flatMap(test => 
    test.results.map(result => result.power)
  );
  
  // Přidáme 10% mezeru na obou stranách
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
        callbacks: {
          title: function(tooltipItems) {
            const item = tooltipItems[0];
            const date = item.dataset.label.split(' - ')[0];
            const label = item.raw.label || 'Data point';
            if (item.raw.pointIndex) {
              return `${date}\n${label} #${item.raw.pointIndex}`;
            }
            return `${date}\n${label}`;
          },
          label: function(context) {
            const point = context.raw;
            const xValue = sport === 'bike' 
              ? `${Math.round(point.x)}W` 
              : convertPowerToPace(point.x, sport);
            return `Power: ${xValue}\nLactate: ${point.y.toFixed(1)} mmol/L`;
          }
        }
      },
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
          generateLabels: function(chart) {
            const datasets = chart.data.datasets;
            return datasets.map(dataset => ({
              text: dataset.label.split(' - ')[1], // Zobrazí pouze název metody
              fillStyle: dataset.backgroundColor,
              strokeStyle: dataset.borderColor,
              lineWidth: dataset.borderWidth,
              hidden: !dataset.visible,
              index: dataset.index,
              pointStyle: 'circle'
            }));
          }
        },
        onClick: function(e, legendItem, legend) {
          const index = legendItem.index;
          const chart = legend.chart;
          const meta = chart.getDatasetMeta(index);

          // Přepne viditelnost datasetu
          meta.hidden = meta.hidden === null ? !meta.hidden : null;
          chart.update();
        }
      }
    },
  };

  return (
    <div className="w-full p-4 bg-white rounded-2xl shadow-lg">
      <div className="relative" style={{ width: '100%', height: '400px' }}>
        <Line 
          ref={chartRef}
          options={{ ...options, plugins: { ...options.plugins, legend: { display: false } } }} 
          data={{ datasets }} 
        />
      </div>
      
      {/* Tabulka s porovnáním zón a legendou */}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left">Zone</th>
              {testsWithThresholds.map((test, i) => (
                <th key={i} className="px-4 py-2 text-left" colSpan={2}>
                  {new Date(test.date).toLocaleDateString()}
                </th>
              ))}
              <th className="px-4 py-2 text-left">Show/Hide</th>
            </tr>
            <tr className="bg-gray-50 border-t">
              <th className="px-4 py-2 text-left"></th>
              {testsWithThresholds.map((_, i) => (
                <React.Fragment key={i}>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                    {sport === 'bike' ? 'Power' : 'Pace'}
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">HR</th>
                </React.Fragment>
              ))}
              <th className="px-4 py-2 text-left"></th>
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
                <td className="px-4 py-2 font-medium">{zone}</td>
                {testsWithThresholds.map((test, i) => (
                  <React.Fragment key={i}>
                    <td className="px-4 py-2">
                      {zone === 'LTRatio' 
                        ? test.thresholds[zone] || 'N/A'
                        : test.thresholds[zone] 
                          ? sport === 'bike'
                            ? `${Math.round(test.thresholds[zone])}W`
                            : convertPowerToPace(test.thresholds[zone], sport)
                          : 'N/A'
                      }
                    </td>
                    <td className="px-4 py-2">
                      {zone !== 'LTRatio' && test.thresholds.heartRates && test.thresholds.heartRates[zone]
                        ? `${Math.round(test.thresholds.heartRates[zone])}bpm`
                        : 'N/A'
                      }
                    </td>
                  </React.Fragment>
                ))}
                <td className="px-4 py-2">
                  <button
                    className="w-6 h-6 rounded-full relative"
                    style={{
                      backgroundColor: zone === 'Data points' ? 'transparent' : zoneColors[zone],
                      border: '2px solid',
                      borderColor: zone === 'Data points' ? '#000' : zoneColors[zone],
                      opacity: hiddenPoints.has(zone) ? 0.5 : 1
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
                          fontSize: '1.2em',
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