import React, { useState, useEffect } from 'react';
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
import { HelpCircle, Info } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);


// Info tooltip component
// const InfoTooltip = ({ content }) => {
//   const [isVisible, setIsVisible] = useState(false);
//   const [position, setPosition] = useState({ top: 0, left: 0 });
//   const buttonRef = useRef(null);

//   const updatePosition = () => {
//     if (buttonRef.current) {
//       const rect = buttonRef.current.getBoundingClientRect();
//       setPosition({
//         top: rect.top,
//         left: rect.left + rect.width / 2
//       });
//     }
//   };

//   useEffect(() => {
//     if (isVisible) {
//       updatePosition();
//       window.addEventListener('scroll', updatePosition);
//       window.addEventListener('resize', updatePosition);
//     }
//     return () => {
//       window.removeEventListener('scroll', updatePosition);
//       window.removeEventListener('resize', updatePosition);
//     };
//   }, [isVisible]);

//   return (
//     <div className="relative inline-block">
//       <button
//         ref={buttonRef}
//         onMouseEnter={() => {
//           updatePosition();
//           setIsVisible(true);
//         }}
//         onMouseLeave={() => setIsVisible(false)}
//         className="text-gray-400 hover:text-gray-600 transition-colors"
//       >
//         <Info size={16} />
//       </button>
//       {isVisible && (
//         <div 
//           className="absolute z-[9999] bg-white text-sm px-4 py-2 rounded-lg shadow-lg border border-gray-100"
//           style={{
//             position: 'fixed',
//             top: `${position.top}px`,
//             left: `${position.left}px`,
//             transform: 'translate(-50%, -100%)',
//             marginTop: '-8px',
//             minWidth: '200px',
//             maxWidth: '300px',
//             whiteSpace: 'normal',
//             wordWrap: 'break-word'
//           }}
//         >
//           {content}
//           <div 
//             className="absolute w-2 h-2 bg-white border-l border-b border-gray-100 transform rotate-45"
//             style={{
//               left: '50%',
//               bottom: '-6px',
//               transform: 'translateX(-50%) rotate(45deg)'
//             }}
//           />
//         </div>
//       )}
//     </div>
//   );
// };

const convertSecondsToPace = (seconds) => {
  if (!seconds && seconds !== 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const convertSecondsToSpeed = (seconds, unitSystem) => {
  if (!seconds || seconds <= 0) return 0;
  const speed = 3600 / seconds; // Convert seconds per km to km/h
  return unitSystem === 'imperial' ? speed * 0.621371 : speed; // Convert to mph if imperial
};


const LactateCurve = ({ mockData, demoMode = false }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Get unit system and input mode from mockData or default to metric/pace
  const unitSystem = mockData?.unitSystem || 'metric';
  const inputMode = mockData?.inputMode || 'pace';

  if (!mockData || !mockData.results || mockData.results.length === 0) {
    return (
      <div className={`w-full ${isMobile ? 'h-[400px]' : 'min-h-[500px] h-[600px]'} bg-white ${isMobile ? 'rounded-lg' : 'rounded-2xl'} shadow-lg ${isMobile ? 'p-3' : 'p-6'} flex flex-col`}>
        <div className="flex flex-col items-center justify-center flex-1">
          <HelpCircle size={isMobile ? 32 : 48} className="text-gray-300 mb-4" />
          <p className={`text-gray-500 text-center ${isMobile ? 'text-sm' : ''}`}>
            Add test results to see the lactate curve
          </p>
          {demoMode && (
            <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'} text-center mt-2`}>
              Fill in the test form above with your interval data
            </p>
          )}
        </div>
      </div>
    );
  }

  // Filter out rows with empty or invalid values
  const validResults = mockData.results.filter(result => {
    if (!result || result.power === undefined || result.power === null || result.lactate === undefined || result.lactate === null) {
      console.log('Invalid result - missing power or lactate');
      return false;
    }

    // Check if power is valid
    const power = result.power.toString().replace(',', '.');
    
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

    return true;
  });


  if (validResults.length < 2) {
    console.log('Not enough valid results:', validResults.length);
    return (
      <div className={`w-full ${isMobile ? 'h-[400px]' : 'min-h-[500px] h-[600px]'} bg-white ${isMobile ? 'rounded-lg' : 'rounded-2xl'} shadow-lg ${isMobile ? 'p-3' : 'p-6'} flex flex-col`}>
        <div className="flex flex-col items-center justify-center flex-1">
          <Info size={isMobile ? 32 : 48} className="text-yellow-400 mb-4" />
          <p className={`text-gray-600 text-center ${isMobile ? 'text-sm' : ''}`}>
            Need at least 2 valid data points to create the curve
          </p>
          <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'} text-center mt-2`}>
            Make sure to enter both {mockData.sport === 'bike' ? 'power' : 'pace'} and lactate values
            {mockData.sport !== 'bike' && ' in MM:SS format'}
          </p>
          <p className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-xs'} text-center mt-2`}>
            Current sport: {mockData.sport}
          </p>
          <p className={`text-gray-400 ${isMobile ? 'text-[10px]' : 'text-xs'} text-center mt-2`}>
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
        } else if (mockData.sport === 'run' || mockData.sport === 'swim') {
          if (inputMode === 'pace') {
            return convertSecondsToPace(power);
          } else {
            // Speed mode - convert seconds to speed
            const speed = convertSecondsToSpeed(power, unitSystem);
            const unit = unitSystem === 'imperial' ? 'mph' : 'km/h';
            return `${speed.toFixed(1)} ${unit}`;
          }
        }
        // fallback
        return power;
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
              } else if (mockData.sport === 'run' || mockData.sport === 'swim') {
                if (inputMode === 'pace') {
                  const pace = convertSecondsToPace(power);
                  return `${label}: ${value.toFixed(2)} mmol/L | ${pace}`;
                } else {
                  const speed = convertSecondsToSpeed(power, unitSystem);
                  const unit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                  return `${label}: ${value.toFixed(2)} mmol/L | ${speed.toFixed(1)} ${unit}`;
                }
              } else {
                return `${label}: ${value.toFixed(2)} mmol/L | ${power}`;
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
                  mockData.sport === 'swim' ? 
                    (inputMode === 'pace' ? 
                      (unitSystem === 'imperial' ? "Pace (min/100yd)" : "Pace (min/100m)") :
                      (unitSystem === 'imperial' ? "Speed (mph)" : "Speed (km/h)")
                    ) : 
                    (inputMode === 'pace' ? 
                      (unitSystem === 'imperial' ? "Pace (min/mile)" : "Pace (min/km)") :
                      (unitSystem === 'imperial' ? "Speed (mph)" : "Speed (km/h)")
                    )
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
                if (inputMode === 'pace') {
                  const minutes = Math.floor(power / 60);
                  const seconds = Math.floor(power % 60);
                  const unit = unitSystem === 'imperial' ? '/100yd' : '/100m';
                  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${unit}`;
                } else {
                  const speed = convertSecondsToSpeed(power, unitSystem);
                  const unit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                  return `${speed.toFixed(1)} ${unit}`;
                }
              } else {
                if (inputMode === 'pace') {
                  const minutes = Math.floor(power / 60);
                  const seconds = Math.floor(power % 60);
                  const unit = unitSystem === 'imperial' ? '/mile' : '/km';
                  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${unit}`;
                } else {
                  const speed = convertSecondsToSpeed(power, unitSystem);
                  const unit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                  return `${speed.toFixed(1)} ${unit}`;
                }
              }
            }
          }
        },
      },
    };

    return (
      <div className={`relative w-full ${isMobile ? 'h-[400px]' : 'min-h-[500px] h-[600px]'} ${isMobile ? 'p-1.5' : 'p-2 md:p-4'} bg-white ${isMobile ? 'rounded-lg' : 'rounded-2xl'} shadow-lg overflow-hidden flex flex-col`}>
        <div className="flex-1 min-h-0" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
          <Line data={data} options={options} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error calculating lactate curve:', error);
    return (
      <div className={`w-full ${isMobile ? 'h-[400px]' : 'min-h-[500px] h-[600px]'} bg-white ${isMobile ? 'rounded-lg' : 'rounded-2xl'} shadow-lg ${isMobile ? 'p-3' : 'p-6'} flex flex-col`}>
        <div className="flex flex-col items-center justify-center flex-1">
          <div className={`text-red-500 mb-4 ${isMobile ? 'text-2xl' : 'text-4xl'}`}>⚠️</div>
        <p className={`text-red-500 text-center ${isMobile ? 'text-sm' : ''}`}>Error calculating lactate curve</p>
          {demoMode && (
            <p className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'} text-center mt-2`}>
              Please check your input data and try again
            </p>
          )}
        </div>
      </div>
    );
  }
};

export default LactateCurve;
