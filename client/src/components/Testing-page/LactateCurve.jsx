import React, { useState, useEffect, useRef } from 'react';
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { convertPowerToPace } from '../../utils/paceConverter';
import { HelpCircle, Info } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Enhanced tooltip component with more detailed information
const CustomTooltip = ({ tooltip, datasets, sport }) => {
  if (!tooltip?.dataPoints) return null;

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;

  const interval = index + 1;
  const power = tooltip.dataPoints[0]?.label || "N/A";
  const bpm = datasets[1]?.data?.[index] ?? "N/A";
  const mmol = datasets[0]?.data?.[index] ?? "N/A";

  return (
    <div
      className="absolute bg-white/95 backdrop-blur-sm shadow-lg p-4 rounded-xl text-sm border border-gray-100"
      style={{
        left: tooltip.caretX,
        top: tooltip.caretY,
        transform: "translate(-50%, -120%)",
        position: "absolute",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 50
      }}
    >
      <div className="font-bold text-gray-900 mb-2">Interval {interval}</div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-gray-700">
          <span className="w-2 h-2 rounded-full bg-gray-500"></span>
          {sport === 'bike' ? 'Power' : 'Pace'}: {power}
        </div>
        <div className="flex items-center gap-2 text-blue-600">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Lactate: {mmol} mmol/L
        </div>
        <div className="flex items-center gap-2 text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          Heart Rate: {bpm} Bpm
        </div>
      </div>
      <div
        className="absolute w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-8 border-t-white"
        style={{
          left: "50%",
          bottom: "-8px",
          transform: "translateX(-50%)",
        }}
      ></div>
    </div>
  );
};

// Info tooltip component
const InfoTooltip = ({ content }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top,
        left: rect.left + rect.width / 2
      });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onMouseEnter={() => {
          updatePosition();
          setIsVisible(true);
        }}
        onMouseLeave={() => setIsVisible(false)}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Info size={16} />
      </button>
      {isVisible && (
        <div 
          className="absolute z-[9999] bg-white text-sm px-4 py-2 rounded-lg shadow-lg border border-gray-100"
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translate(-50%, -100%)',
            marginTop: '-8px',
            minWidth: '200px',
            maxWidth: '300px',
            whiteSpace: 'normal',
            wordWrap: 'break-word'
          }}
        >
          {content}
          <div 
            className="absolute w-2 h-2 bg-white border-l border-b border-gray-100 transform rotate-45"
            style={{
              left: '50%',
              bottom: '-6px',
              transform: 'translateX(-50%) rotate(45deg)'
            }}
          />
        </div>
      )}
    </div>
  );
};

const LactateCurve = ({ mockData, demoMode = false }) => {
  const [tooltip, setTooltip] = useState(null);
  const [showGuide, setShowGuide] = useState(demoMode);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  if (!mockData || !mockData.results || mockData.results.length === 0) {
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <HelpCircle size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-500 text-center">
            Add test results to see the lactate curve
          </p>
          {demoMode && (
            <p className="text-gray-400 text-sm text-center mt-2">
              Fill in the test form above with your interval data
            </p>
          )}
        </div>
      </div>
    );
  }

  // Filter out rows with empty or invalid values
  const validResults = mockData.results.filter(result => {
    console.log('Validating result:', result);
    if (!result || result.power === undefined || result.power === null || result.lactate === undefined || result.lactate === null) {
      console.log('Invalid result - missing power or lactate');
      return false;
    }

    // Check if power is valid
    const power = result.power.toString().replace(',', '.');
    console.log('Power value:', power, 'Sport:', mockData.sport);
    
    if (mockData.sport === 'run' || mockData.sport === 'swim') {
      // For running and swimming, check MM:SS format
      if (typeof power === 'string' && power.includes(':')) {
        const [minutes, seconds] = power.split(':').map(Number);
        console.log('Parsed pace:', { minutes, seconds });
        if (isNaN(minutes) || isNaN(seconds)) {
          console.log('Invalid pace format - NaN values');
          return false;
        }
        if (minutes < 0 || seconds < 0 || seconds >= 60) {
          console.log('Invalid pace values - out of range');
          return false;
        }
      } else if (!isNaN(Number(power))) {
        // If it's a number, try to convert it to MM:SS format
        const totalSeconds = Math.floor(Number(power));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        console.log('Converting number to pace:', { minutes, seconds });
        if (minutes < 0 || seconds < 0 || seconds >= 60) {
          console.log('Invalid converted pace values - out of range');
          return false;
        }
      } else {
        console.log('Invalid pace format - not a number or MM:SS');
        return false;
      }
    } else {
      // For cycling, check if it's a valid number
      if (isNaN(Number(power))) {
        console.log('Invalid power value - not a number');
        return false;
      }
    }

    // Check if lactate is valid
    const lactate = result.lactate.toString().replace(',', '.');
    if (isNaN(Number(lactate))) {
      console.log('Invalid lactate value - not a number');
      return false;
    }

    console.log('Valid result');
    return true;
  });

  console.log('Valid results:', validResults);

  if (validResults.length < 2) {
    console.log('Not enough valid results:', validResults.length);
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <Info size={48} className="text-yellow-400 mb-4" />
          <p className="text-gray-600 text-center">
            Need at least 2 valid data points to create the curve
          </p>
          <p className="text-gray-400 text-sm text-center mt-2">
            Make sure to enter both {mockData.sport === 'bike' ? 'power' : 'pace'} and lactate values
            {mockData.sport !== 'bike' && ' in MM:SS format'}
          </p>
          <p className="text-gray-400 text-xs text-center mt-2">
            Current sport: {mockData.sport}
          </p>
          <p className="text-gray-400 text-xs text-center mt-2">
            Number of results: {mockData.results?.length || 0}
          </p>
        </div>
      </div>
    );
  }

  try {
    const powerData = validResults.map((result) => {
      const power = result.power?.toString().replace(',', '.');
      if (mockData.sport === 'run' || mockData.sport === 'swim') {
        // Convert MM:SS format to seconds
        if (typeof power === 'string' && power.includes(':')) {
          const [minutes, seconds] = power.split(':').map(Number);
          const value = minutes * 60 + seconds;
          return isNaN(value) || !isFinite(value) ? 0 : value;
        }
      }
      const value = Number(power);
      return isNaN(value) || !isFinite(value) ? 0 : value;
    });

    const lactateData = validResults.map((result) => {
      const value = Number(result.lactate.toString().replace(',', '.'));
      return isNaN(value) || !isFinite(value) ? 0 : value;
    });
    const heartRateData = validResults.map((result) => {
      if (!result.heartRate) return 0;
      const value = Number(result.heartRate.toString().replace(',', '.'));
      return isNaN(value) || !isFinite(value) ? 0 : value;
    });

    const datasets = [
      {
        label: "Lactate (mmol/L)",
        data: lactateData,
        borderColor: "#3F8CFE",
        backgroundColor: "#3F8CFE",
        pointStyle: "circle",
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: "#3F8CFE",
      },
      {
        label: "Heart Rate (BPM)",
        data: heartRateData,
        borderColor: "#E7515A",
        backgroundColor: "#E7515A",
        pointStyle: "circle",
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: "#E7515A",
        yAxisID: "y1",
      },
    ];

    const data = { 
      labels: powerData.map(power => {
        if (mockData.sport === 'bike') {
          return `${power}W`;
        } else if (mockData.sport === 'swim') {
          // Convert seconds back to MM:SS format for swimming
          const minutes = Math.floor(power / 60);
          const seconds = Math.floor(power % 60);
          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/100m`;
        } else {
          // Convert seconds back to MM:SS format for running
          const minutes = Math.floor(power / 60);
          const seconds = Math.floor(power % 60);
          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/km`;
        }
      }), 
      datasets 
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            pointRadius: 4,
            font: { size: 12 },
          },
        },
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
            label: (context) => {
              const label = context.dataset.label;
              const value = context.parsed.y;
              const power = powerData[context.dataIndex];
              
              if (mockData.sport === 'bike') {
                return `${label}: ${value.toFixed(2)} mmol/L | ${power}W`;
              } else if (mockData.sport === 'swim') {
                const minutes = Math.floor(power / 60);
                const seconds = Math.floor(power % 60);
                const pace = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/100m`;
                return `${label}: ${value.toFixed(2)} mmol/L | ${pace}`;
              } else {
                const minutes = Math.floor(power / 60);
                const seconds = Math.floor(power % 60);
                const pace = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/km`;
                return `${label}: ${value.toFixed(2)} mmol/L | ${pace}`;
              }
            }
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: "Lactate (mmol/L)" },
          min: 0,
          max: Math.ceil(Math.max(...lactateData) + 1),
          ticks: { display: true },
          border: { dash: [6, 6] },
          grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
            drawTicks: true,
          },
        },
        y1: {
          title: { display: true, text: "Heart Rate (BPM)" },
          min: 100,
          max: Math.max(...heartRateData) + 10,
          position: "right",
          ticks: { display: true },
          grid: {
            drawOnChartArea: true,
            color: "rgba(0, 0, 0, 0)",
            borderDash: [4, 4],
          },
        },
        x: {
          title: {
            display: true,
            text: mockData.sport === 'bike' ? "Power (W)" : 
                  mockData.sport === 'swim' ? "Pace (min/100m)" : "Pace (min/km)"
          },
          border: { dash: [6, 6] },
          grid: {
            color: "rgba(0, 0, 0, 0.15)",
            borderDash: [4, 4],
          },
          ticks: {
            callback: function(value, index) {
              const power = powerData[index];
              if (mockData.sport === 'bike') {
                return `${power}W`;
              } else if (mockData.sport === 'swim') {
                const minutes = Math.floor(power / 60);
                const seconds = Math.floor(power % 60);
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/100m`;
              } else {
                const minutes = Math.floor(power / 60);
                const seconds = Math.floor(power % 60);
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/km`;
              }
            }
          }
        },
      },
    };

    return (
      <div className="relative w-full p-6 bg-white rounded-2xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              Lactate Curve 
              {demoMode && (
                <div className="relative z-[999]">
                  <InfoTooltip content="This graph shows the relationship between your power/pace and lactate levels, helping identify your training zones." />
                </div>
              )}
              <span className="text-xl text-gray-600 ml-2">({formatDate(mockData.date)})</span>
            </h2>
            <p className="text-lg text-gray-500 flex items-center gap-2">
              Base Lactate: 
              <span className="text-blue-500 font-medium">{mockData.baseLactate} mmol/L</span>
              {demoMode && (
                <div className="relative z-[999]">
                  <InfoTooltip content="Your resting lactate level before the test." />
                </div>
              )}
            </p>
          </div>
          {demoMode && (
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-primary hover:text-primary-dark transition-colors relative z-[999]"
            >
              <HelpCircle size={24} />
            </button>
          )}
        </div>

        {demoMode && showGuide && (
          <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <h3 className="font-semibold mb-2">How to Read This Graph:</h3>
            <ul className="space-y-2">
              <li>• Blue line shows lactate concentration at different intensities</li>
              <li>• Red line shows heart rate response</li>
              <li>• Hover over points to see detailed values</li>
              <li>• Sharp increases in lactate indicate threshold points</li>
            </ul>
          </div>
        )}

        <div className="relative" style={{ width: '100%', height: '400px' }}>
          <Line data={data} options={options} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error calculating lactate curve:', error);
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-red-500 mb-4">⚠️</div>
          <p className="text-red-500 text-center">Error calculating lactate curve</p>
          {demoMode && (
            <p className="text-gray-400 text-sm text-center mt-2">
              Please check your input data and try again
            </p>
          )}
        </div>
      </div>
    );
  }
};

export default LactateCurve;
