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
import DataTable, { calculateThresholds, calculatePolynomialRegression, calculatePolynomialRegressionLactateToHR } from './DataTable';
import { InformationCircleIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';
import { useAuth } from '../../context/AuthProvider';

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
    'LTP1': '#16a34a',          // green-600 - tmavší zelená
    'LTP2': '#dc2626',          // red-600 - červená
    'LTRatio': '#94a3b8',
    'Glucose': '#f59e0b',       // amber-500 - pro glucose křivku
    'VO2': '#8b5cf6'            // violet-500 - pro VO2 křivku
  };

 
  const baseLegendItems = [
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
    { color: 'bg-green-600', label: 'LTP1', dsLabel: 'LTP1' },
    { color: 'bg-red-600', label: 'LTP2', dsLabel: 'LTP2' }
  ];
  const Legend = ({ chartRef, zonesVisible, setZonesVisible, ltpLinesVisibleRef, getLegendItems }) => {
    const [hiddenDatasets, setHiddenDatasets] = useState({});
    const [hideAllActive, setHideAllActive] = useState(false);
    const [previousHiddenState, setPreviousHiddenState] = useState({});
    const [ltpLinesVisible, setLtpLinesVisible] = useState(true);
  
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
        // Skip zone datasets - they shouldn't be affected by hover
        if (ds.zoneKey) return;
        
        const originalColor = colorMap[ds.label];
        if (!originalColor) return; // Skip if no color defined
        
        if (ds.label === dsLabel) {
          // Highlight the hovered dataset
          if (ds.label === "Polynomial Fit") {
            ds.borderColor = 'rgba(33,150,243)';
            ds.pointRadius = 0;
          } else {
            ds.pointRadius = 8;
            ds.borderColor = originalColor;
            ds.backgroundColor = originalColor;
          }
        } else {
          // Dim other datasets
          if (ds.label === "Polynomial Fit") {
            ds.borderColor = 'rgba(33,150,243,0.1)';
            ds.pointRadius = 0;
          } else {
            // Convert hex to rgba with 30% opacity
            const r = parseInt(originalColor.slice(1, 3), 16);
            const g = parseInt(originalColor.slice(3, 5), 16);
            const b = parseInt(originalColor.slice(5, 7), 16);
            ds.borderColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
            ds.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
            ds.pointRadius = 6;
          }
        }
      });
    
      chart.update();
    };
    
    const handleMouseLeave = () => {
      const chart = chartRef?.current;
      if (!chart) return;
    
      chart.data.datasets.forEach((ds) => {
        // Skip zone datasets
        if (ds.zoneKey) return;
        
        const originalColor = colorMap[ds.label];
        if (!originalColor) return; // Skip if no color defined
        
        // Restore original colors
        if (ds.label === "Polynomial Fit") {
          ds.borderColor = 'rgba(33,150,243)';
          ds.pointRadius = 0;
        } else {
          ds.borderColor = originalColor;
          ds.backgroundColor = originalColor;
          // Restore original point radius based on dataset type
          if (ds.label === 'Measured data') {
            ds.pointRadius = 5;
          } else {
            ds.pointRadius = 6;
          }
        }
      });
    
      chart.update();
    };

    const handleToggleZones = () => {
      const newValue = !zonesVisible;
      setZonesVisible(newValue);
      
      // Update will be handled by parent component's setZonesVisible
    };
    
    const handleToggleLtpLines = () => {
      const chart = chartRef?.current;
      if (!chart) return;
      
      const newValue = !ltpLinesVisible;
      setLtpLinesVisible(newValue);
      if (ltpLinesVisibleRef) {
        ltpLinesVisibleRef.current = newValue;
      }
      
      // Hide/show LTP1_line and LTP2_line datasets
      chart.data.datasets.forEach((ds, index) => {
        if (ds.label === 'LTP1_line' || ds.label === 'LTP2_line') {
          chart.setDatasetVisibility(index, newValue);
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
        <div
          className={`cursor-pointer flex items-center ${
            !zonesVisible ? 'line-through text-gray-400' : ''
          }`}
          onClick={handleToggleZones}
          title="Hide/show training zones"
        >
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-gradient-to-r from-green-400 via-blue-400 via-yellow-400 via-red-400 to-purple-400" />
            <div className="whitespace-nowrap">Hide zones</div>
          </div>
        </div>
        <div
          className={`cursor-pointer flex items-center ${
            !ltpLinesVisible ? 'line-through text-gray-400' : ''
          }`}
          onClick={handleToggleLtpLines}
          title="Hide/show LT1 and LT2 lines"
        >
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-shrink-0 w-2.5 h-2.5 border-2 border-green-600 border-dashed bg-transparent" />
            <div className="whitespace-nowrap">Hide LT lines</div>
          </div>
        </div>
        {(getLegendItems ? getLegendItems() : baseLegendItems).map((item, index) => (
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

  // Legend component for HR view
  const HRLegend = ({ chartRef }) => {
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
      
      if (hideAllActive) {
        setHideAllActive(false);
      }
    };
  
    const handleHideAll = () => {
      const chart = chartRef?.current;
      if (!chart) return;
  
      if (hideAllActive) {
        chart.data.datasets.forEach((ds, index) => {
          const wasHidden = previousHiddenState[ds.label] || false;
          chart.setDatasetVisibility(index, !wasHidden);
        });
        setHiddenDatasets(previousHiddenState);
        setHideAllActive(false);
      } else {
        const currentState = {};
        chart.data.datasets.forEach((ds, index) => {
          currentState[ds.label] = !chart.isDatasetVisible(index);
        });
        setPreviousHiddenState(currentState);
        
        const newHiddenState = {};
        chart.data.datasets.forEach((ds, index) => {
          if (ds.label === 'Measured data' || ds.label === 'Polynomial Fit') {
            chart.setDatasetVisibility(index, true);
            newHiddenState[ds.label] = false;
          } else {
            chart.setDatasetVisibility(index, false);
            newHiddenState[ds.label] = true;
          }
        });
        
        setHiddenDatasets(newHiddenState);
        setHideAllActive(true);
      }
      
      chart.update();
    };
  
    const hrLegendItems = [
      { color: 'border border-red-600 border-solid bg-red-50', label: 'Data points', dsLabel: 'Measured data' },
      { color: 'bg-red-600', label: 'Polynomial Fit', dsLabel: 'Polynomial Fit' },
      { color: 'bg-green-600', label: 'LTP1', dsLabel: 'LTP1' },
      { color: 'bg-red-600', label: 'LTP2', dsLabel: 'LTP2' },
      { color: 'bg-blue-500', label: 'IAT', dsLabel: 'IAT' },
      { color: 'bg-zinc-700', label: 'Log-log', dsLabel: 'Log-log' }
    ];
  
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
        {hrLegendItems.map((item, index) => (
          <div
            key={index}
            className={`cursor-pointer flex items-center ${
              hiddenDatasets[item.dsLabel] ? 'line-through text-gray-400' : ''
            }`}
            onClick={() => handleToggle(item.dsLabel)}
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


const LactateCurveCalculator = ({ mockData, demoMode = false }) => {
  const { user } = useAuth();
  const chartRef = useRef(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [zoneOverride, setZoneOverride] = useState(null);
  const [showDataTable, setShowDataTable] = useState(true); // Toggle for showing/hiding DataTable
  const [zonesVisible, setZonesVisible] = useState(true); // Toggle for showing/hiding zone colors
  const zonesVisibleRef = useRef(true); // Ref for plugin access
  const ltpLinesVisibleRef = useRef(true); // Ref for plugin access to ltpLinesVisible state
  const [chartView, setChartView] = useState('power'); // 'power' = power/pace vs lactate, 'hr' = heart rate vs lactate
  const isRunning = mockData?.sport === 'run';
  const isSwimming = mockData?.sport === 'swim';
  const isPaceSport = isRunning || isSwimming;
  const trainingTitle = (mockData?.title || mockData?.name || '').toString().trim();
  
  // Get unit system and input mode from user profile, mockData, or default to metric/pace
  const unitSystem = user?.units?.distance === 'imperial' ? 'imperial' : (mockData?.unitSystem || 'metric');
  const inputMode = mockData?.inputMode || 'pace';
  const rpeScale = mockData?.rpeScale || 'rpe'; // Default to RPE scale if not set
  
  // Determine if axis should be reversed (for pace mode in pace sports)
  // Must be defined early because it's used in zoneDatasets calculation
  const isReverse = Boolean(isPaceSport && inputMode === 'pace');

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

  const handleDownloadPdf = async () => {
    const testId = mockData?._id;
    if (!testId) {
      setPdfStatus({ type: 'error', message: 'Missing test id.' });
      return;
    }
    try {
      setDownloadingPdf(true);
      setPdfStatus(null);
      const { data } = await api.get(`/test/${testId}/report-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lactate-report-${testId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setPdfStatus({ type: 'success', message: 'PDF downloaded.' });
    } catch (e) {
      const status = e?.response?.status;
      let reason = e?.response?.data?.error || e?.response?.data?.reason;
      if (e?.response?.data?.constructor?.name === 'Blob') {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text);
          reason = j.error || j.reason;
        } catch {
          reason = status === 503 ? 'pdf_not_available' : 'failed';
        }
      }
      const msg =
        reason === 'pdf_not_available' || reason === 'pdf_generation_failed' || status === 503
          ? 'PDF generation is not available on this server.'
          : reason === 'forbidden' || status === 403
            ? 'You do not have access to this report.'
            : reason === 'test_not_found' || status === 404
              ? 'Test not found.'
              : (e?.response?.data?.message || 'Failed to download PDF.');
      setPdfStatus({ type: 'error', message: msg });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const thresholds = calculateThresholds(mockData);
  const results = mockData.results;
  
  // Calculate training zones for visualization
  const zones = calculateZonesFromTest(mockData);
  
  // First, filter out only truly invalid results (empty, missing, zero values)
  // Keep all valid numeric values for display, even if they might be filtered later for calculations
  const allResultsForDisplay = results.filter(r => {
    if (!r) return false;
    const powerStr = r.power?.toString().trim();
    const lactateStr = r.lactate?.toString().trim();
    if (!powerStr || powerStr === '' || powerStr === '0' || 
        !lactateStr || lactateStr === '' || lactateStr === '0' ||
        r.power === undefined || r.power === null || 
        r.lactate === undefined || r.lactate === null) {
      return false;
    }
    const powerNum = Number(powerStr.replace(',', '.'));
    const lactateNum = Number(lactateStr.replace(',', '.'));
    if (isNaN(powerNum) || isNaN(lactateNum)) return false;
    if (isPaceSport) {
      if (powerNum <= 0 || powerNum < 60) return false;
    } else {
      if (powerNum <= 0 || powerNum < 50) return false;
    }
    if (lactateNum <= 0 || lactateNum > 20) return false;
    return true;
  });

  // Filter out invalid results first - exclude empty rows and rows with missing/invalid values
  // This is used for calculations (polynomial regression, thresholds)
  let validResults = allResultsForDisplay.filter(r => {
    // Check if row exists
    if (!r) return false;
    
    // Check if power and lactate are present and not empty
    const powerStr = r.power?.toString().trim();
    const lactateStr = r.lactate?.toString().trim();
    
    if (!powerStr || powerStr === '' || powerStr === '0' || 
        !lactateStr || lactateStr === '' || lactateStr === '0' ||
        r.power === undefined || r.power === null || 
        r.lactate === undefined || r.lactate === null) {
      return false;
    }
    
    const power = powerStr.replace(',', '.');
    const lactate = lactateStr.replace(',', '.');
    const powerNum = Number(power);
    const lactateNum = Number(lactate);
    
    // Check if values are valid numbers
    if (isNaN(powerNum) || isNaN(lactateNum)) {
      return false;
    }
    
    if (isPaceSport) {
      // For pace sports, power should be positive (seconds) - minimum reasonable pace is ~60 seconds (1 min/km)
      if (powerNum <= 0 || powerNum < 60) return false;
    } else {
      // For bike, power should be positive (watts) - minimum reasonable power is ~50W
      if (powerNum <= 0 || powerNum < 50) return false;
    }
    
    // Lactate should be positive and reasonable (0.1 - 20 mmol/L)
    if (lactateNum <= 0 || lactateNum > 20) return false;
    
    return true;
  });

  // Additional validation: detect and filter unrealistic lactate spikes followed by drops
  // This catches cases like 13.5 mmol/L followed by 6.2 mmol/L (measurement error)
  if (validResults.length > 2) {
    const sortedByPower = [...validResults].sort((a, b) => {
      const aPower = Number(a.power?.toString().replace(',', '.'));
      const bPower = Number(b.power?.toString().replace(',', '.'));
      return isPaceSport ? bPower - aPower : aPower - bPower; // Reverse for pace sports
    });

    const filteredResults = [];
    for (let i = 0; i < sortedByPower.length; i++) {
      const current = sortedByPower[i];
      const currentLactate = Number(current.lactate?.toString().replace(',', '.'));
      
      // Check if this is an unrealistic spike (> 10 mmol/L)
      if (currentLactate > 10) {
        // Check if next value is significantly lower (drop of more than 3 mmol/L)
        if (i < sortedByPower.length - 1) {
          const next = sortedByPower[i + 1];
          const nextLactate = Number(next.lactate?.toString().replace(',', '.'));
          const drop = currentLactate - nextLactate;
          
          if (drop > 3) {
            // This is likely a measurement error - skip this high value
            console.warn(`[LactateCurveCalculator] Filtering out unrealistic lactate spike: ${currentLactate} mmol/L (followed by ${nextLactate} mmol/L, drop of ${drop.toFixed(1)} mmol/L)`);
            continue; // Skip this value
          }
        }
        
        // Also check if previous value was much lower (spike of more than 5 mmol/L from previous)
        if (i > 0) {
          const prev = sortedByPower[i - 1];
          const prevLactate = Number(prev.lactate?.toString().replace(',', '.'));
          const spike = currentLactate - prevLactate;
          
          if (spike > 5 && prevLactate < 5) {
            // Unrealistic spike from low value - likely measurement error
            console.warn(`[LactateCurveCalculator] Filtering out unrealistic lactate spike: ${currentLactate} mmol/L (spike of ${spike.toFixed(1)} mmol/L from ${prevLactate} mmol/L)`);
            continue; // Skip this value
          }
        }
      }
      
      filteredResults.push(current);
    }
    
    // Update validResults with filtered results (preserve original order)
    const filteredIds = new Set(filteredResults.map(r => `${r.power}_${r.lactate}`));
    validResults = validResults.filter(r => {
      const id = `${r.power}_${r.lactate}`;
      return filteredIds.has(id);
    });
  }

  // Points that have both heart rate and lactate (for HR vs lactate view)
  const validResultsWithHR = validResults.filter(r => {
    const hr = r.heartRate;
    if (hr === undefined || hr === null || hr === '') return false;
    const hrNum = Number(String(hr).replace(',', '.'));
    return !isNaN(hrNum) && hrNum >= 40 && hrNum <= 220;
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
  const xValsMeasured = validResults.map(r => {
    const power = r.power?.toString().replace(',', '.');
    const v = Number(power);
    if (!isPaceSport) return v;
    if (inputMode === 'pace') return v; // seconds
    return convertPaceToSpeed(v, unitSystem); // speed mode
  });
  
  const yValsMeasured = validResults.map(r => {
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
    
    // Place base lactate proportionally before the slowest measurement
    // This ensures the polynomial regression can properly calculate the curve
    // For pace sports: use the slowest pace (highest value) and go proportionally slower
    // For bike: use the lowest power and go proportionally lower
    let baseX;
    if (isPaceSport) {
      if (inputMode === 'pace') {
        // In pace mode: xVals are in seconds, highest = slowest
        const maxPace = Math.max(...xValsMeasured); // Slowest pace (highest seconds)
        const minPace = Math.min(...xValsMeasured); // Fastest pace (lowest seconds)
        const paceRange = maxPace - minPace;
        
        // Place base lactate closer to the slowest point - smaller gap for better visual
        const proportionalGap = paceRange * 0.05; // 5% of the range - smaller gap
        const basePace = maxPace + proportionalGap;
        baseX = basePace;
      } else {
        // In speed mode: xVals are already in km/h (converted from pace)
        // We need to find the slowest and fastest pace from valid data, then convert to speed
        const slowestPace = Math.max(...validResults.map(r => {
          const power = r.power?.toString().replace(',', '.');
          return Number(power);
        })); // Slowest pace in seconds
        const fastestPace = Math.min(...validResults.map(r => {
          const power = r.power?.toString().replace(',', '.');
          return Number(power);
        })); // Fastest pace in seconds
        
        const slowestSpeed = convertPaceToSpeed(slowestPace, unitSystem); // Convert to km/h
        const fastestSpeed = convertPaceToSpeed(fastestPace, unitSystem); // Convert to km/h
        const speedRange = slowestSpeed - fastestSpeed;
        
        // Place base lactate closer to the slowest point - smaller gap
        const proportionalGap = speedRange * 0.05; // 5% of the range - smaller gap
        baseX = Math.max(0.1, slowestSpeed + proportionalGap);
        
        // Validate: for running, speed should be reasonable (max ~30 km/h for elite, ~20 km/h for normal)
        // For swimming, max ~8 km/h
        const maxReasonableSpeed = isSwimming ? 10 : 30;
        if (baseX > maxReasonableSpeed) {
          // If calculated speed is too high, use an even smaller proportional gap
          baseX = slowestSpeed + (speedRange * 0.03); // 3% instead
          if (baseX > maxReasonableSpeed) {
            // If still too high, don't show base lactate point
            return null;
          }
        }
      }
    } else {
      // For bike: lowest power = slowest
      const minPower = Math.min(...xValsMeasured);
      const maxPower = Math.max(...xValsMeasured);
      const powerRange = maxPower - minPower;
      
      // Place base lactate closer to the lowest point - smaller gap
      const proportionalGap = powerRange * 0.05; // 5% of the range - smaller gap
      baseX = Math.max(0, minPower - proportionalGap);
    }
    
    return {
      x: baseX,
      y: baseLaNum,
      label: 'Base Lactate',
      originalPace: isPaceSport && inputMode === 'pace' ? baseX : null
    };
  })();

  // Include base lactate in polynomial regression if available
  // Combine base lactate with measured values for curve calculation
  const xVals = baseLactatePoint 
    ? [baseLactatePoint.x, ...xValsMeasured]
    : xValsMeasured;

  // Sort by intensity: slowest first (pace desc, power asc)
  const sortedResults = isPaceSport 
    ? [...validResults].sort((a, b) => {
        const aPower = Number(a.power?.toString().replace(',', '.'));
        const bPower = Number(b.power?.toString().replace(',', '.'));
        return bPower - aPower; // Descending (slowest to fastest)
      })
    : [...validResults].sort((a, b) => {
        const aPower = Number(a.power?.toString().replace(',', '.'));
        const bPower = Number(b.power?.toString().replace(',', '.'));
        return aPower - bPower; // Ascending (low to high power)
      });

  // Body seřazené podle intenzity (slowest->fastest) s x,y pro regresi
  const sortedPoints = sortedResults.map(r => {
    const power = r.power?.toString().replace(',', '.');
    const lactate = r.lactate?.toString().replace(',', '.');
    const xRaw = Number(power);
    const x = isPaceSport
      ? (inputMode === 'pace' ? xRaw : convertPaceToSpeed(xRaw, unitSystem))
      : xRaw;
    return { x, y: Number(lactate) };
  });

  // Do fitu zahrnout jen body tvořící rostoucí (nebo neklesající) posloupnost laktátu
  // (slowest → fastest: lactate by měl růst). Body "mimo" (pokles) se do křivky nepočítají.
  const TOLERANCE_MMOL = 0.05; // malá tolerance na šum měření
  const increasingPoints = [];
  for (let i = 0; i < sortedPoints.length; i++) {
    const pt = sortedPoints[i];
    const lastY = increasingPoints.length ? increasingPoints[increasingPoints.length - 1].y : -Infinity;
    if (pt.y >= lastY - TOLERANCE_MMOL) {
      increasingPoints.push(pt);
    }
  }
  // Pokud by nám zůstaly méně než 2 body, použijeme všechny (aby se graf nezlomil)
  // Note: increasingPoints and sortedPoints are calculated but not used - polynomial regression uses mockData.results directly

  // Generate polynomial curve using the same method as TestComparison.jsx
  // Use original results directly (same as TestComparison.jsx uses test.results)
  // This is critical - we must use the original results without any filtering or conversion
  // Use mockData.results directly, just like TestComparison.jsx uses test.results
  // Use filtered validResults for polynomial regression (excludes unrealistic spikes)
  const polyPointsRaw = calculatePolynomialRegression(validResults);
  
  // Convert polyPoints to the correct coordinate system (pace/speed/power based on inputMode)
  // Also ensure lactate values are never negative
  const polyPoints = polyPointsRaw.map(point => {
    const y = Math.max(0, point.y); // Ensure lactate is never negative
    if (isPaceSport && inputMode === 'speed') {
      // Convert from pace (seconds) to speed (km/h or mph)
      const speed = convertPaceToSpeed(point.x, unitSystem);
      return { x: speed, y };
    }
    // For pace mode or bike, x is already correct (seconds for pace, watts for bike)
    return { x: point.x, y };
  });

  // Create measured data points from ALL results for display (including filtered ones)
  const allSortedResultsForDisplay = isPaceSport 
    ? [...allResultsForDisplay].sort((a, b) => {
        const aPower = Number(a.power?.toString().replace(',', '.'));
        const bPower = Number(b.power?.toString().replace(',', '.'));
        return bPower - aPower; // Descending (slowest to fastest)
      })
    : [...allResultsForDisplay].sort((a, b) => {
        const aPower = Number(a.power?.toString().replace(',', '.'));
        const bPower = Number(b.power?.toString().replace(',', '.'));
        return aPower - bPower; // Ascending (low to high power)
      });

  const measuredDataPoints = allSortedResultsForDisplay
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
        originalPace: isPaceSport ? r.power : null,
        rpe: r.RPE !== undefined && r.RPE !== null && r.RPE !== '' ? Number(r.RPE) : null,
        heartRate: r.heartRate !== undefined && r.heartRate !== null && r.heartRate !== '' ? Number(r.heartRate) : null,
        glucose: r.glucose !== undefined && r.glucose !== null && r.glucose !== '' ? Number(r.glucose) : null,
        vo2: r.vo2 !== undefined && r.vo2 !== null && r.vo2 !== '' ? Number(r.vo2) : null
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

  // Helper function to find X value from displayed curve for a given lactate value
  // Uses polyPointsRaw (original units) and converts to display units
  const findXFromCurve = (targetLactate, curvePointsRaw) => {
    if (!curvePointsRaw || curvePointsRaw.length === 0) return null;
    
    // Find the point on the curve closest to target lactate
    let closestPoint = curvePointsRaw[0];
    let minDiff = Math.abs(closestPoint.y - targetLactate);
    
    for (const point of curvePointsRaw) {
      const diff = Math.abs(point.y - targetLactate);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
      }
    }
    
    // If we have points on both sides, interpolate
    const index = curvePointsRaw.findIndex(p => p.y >= targetLactate);
    if (index > 0 && index < curvePointsRaw.length) {
      const prev = curvePointsRaw[index - 1];
      const next = curvePointsRaw[index];
      if (prev.y !== next.y) {
        const ratio = (targetLactate - prev.y) / (next.y - prev.y);
        const interpolatedX = prev.x + (next.x - prev.x) * ratio;
        // Convert to display units
        if (isPaceSport && inputMode === 'speed') {
          return convertPaceToSpeed(interpolatedX, unitSystem);
        }
        return interpolatedX;
      }
    }
    
    // Convert to display units
    if (isPaceSport && inputMode === 'speed') {
      return convertPaceToSpeed(closestPoint.x, unitSystem);
    }
    return closestPoint.x;
  };

  const thresholdDatasets = Object.keys(thresholds)
    .filter(key => !['heartRates', 'lactates', 'LTRatio'].includes(key)) // LTRatio je poměr, ne hodnota power/pace, takže ho nezobrazovat v grafu
    .map(key => {
      const yValue = thresholds.lactates[key];
      
      // Pokud jsou hodnoty nevalidní (NaN, null, undefined), přeskočit tento threshold
      if (yValue == null || isNaN(yValue)) {
        return null;
      }
      
      // Find X value from the displayed curve (polyPointsRaw) for this lactate value
      // This ensures thresholds match the displayed curve
      let xValueFromCurve = findXFromCurve(yValue, polyPointsRaw);
      
      // Fallback to original threshold value if curve doesn't have enough points
      let xValue = xValueFromCurve != null 
        ? xValueFromCurve
        : (isPaceSport
            ? (inputMode === 'pace' ? thresholds[key] : convertPaceToSpeed(thresholds[key], unitSystem))
            : thresholds[key]);
      
      // Validate x value - filter out unrealistic values for speed mode
      if (isPaceSport && inputMode === 'speed') {
        const maxReasonableSpeed = isSwimming ? 10 : 30;
        if (xValue > maxReasonableSpeed || xValue < 0.1) {
          console.warn(`[LactateCurveCalculator] Filtering out unrealistic threshold speed value: ${xValue} km/h for ${key}`);
          return null;
        }
      }
      
      if (xValue == null || isNaN(xValue)) {
        return null;
      }
      
      // Special styling for LTP1 and LTP2 to make them more visible
      const isLTP1 = key === 'LTP1';
      const isLTP2 = key === 'LTP2';
      
      return {
      label: key,
      data: [{
          x: xValue,
          y: Math.max(0, yValue), // Ensure lactate is never negative
        originalPace: isPaceSport ? (xValueFromCurve != null ? null : thresholds[key]) : null
      }],
      borderColor: colorMap[key] || '#2196F3',
      backgroundColor: colorMap[key] || '#2196F3',
      pointRadius: isLTP1 || isLTP2 ? 10 : 6, // Larger points for LTP1 and LTP2
      pointBorderWidth: isLTP1 || isLTP2 ? 3 : 2, // Thicker border for LTP1 and LTP2
      showLine: false,
      };
    })
    .filter(dataset => {
      if (!dataset) return false;
      return true;
    })
    .filter(dataset => dataset !== null); // Odstranit null hodnoty

  // Ensure LT1 has lower lactate than LT2 in threshold datasets
  const ltp1Dataset = thresholdDatasets.find(ds => ds && ds.label === 'LTP1');
  const ltp2Dataset = thresholdDatasets.find(ds => ds && ds.label === 'LTP2');
  if (ltp1Dataset && ltp2Dataset && ltp1Dataset.data[0].y > ltp2Dataset.data[0].y) {
    console.warn('[LactateCurveCalculator] LT1 lactate higher than LT2, swapping datasets');
    // Swap the datasets
    const temp = ltp1Dataset.data[0];
    ltp1Dataset.data[0] = ltp2Dataset.data[0];
    ltp2Dataset.data[0] = temp;
  }

  // Vytvořit datasets pro čárkované vertikální čáry LT1 a LT2 (přes celý graf)
  // Use max from valid data points only (not filtered out spikes)
  const maxLactateForAxis = (() => {
    const allYValues = [
      ...yValsMeasured, // Only measured values (already filtered)
      ...(baseLactatePoint ? [baseLactatePoint.y] : []),
      ...(polyPoints.length > 0 ? polyPoints.map(p => p.y).filter(y => y >= 0 && y <= 20) : []),
      ...thresholdDatasets
        .filter(ds => ds !== null)
        .flatMap(ds => ds.data.map(d => d.y))
        .filter(y => y >= 0 && y <= 20)
    ].filter(y => !isNaN(y) && isFinite(y) && y >= 0);
    
    if (allYValues.length === 0) return 15;
    return Math.ceil(Math.max(...allYValues) * 1.1 + 1);
  })();
  const ltpLineDatasets = ['LTP1', 'LTP2']
    .map((key) => {
      const thresholdDs = thresholdDatasets.find(ds => ds && ds.label === key);
      if (!thresholdDs || !thresholdDs.data || !thresholdDs.data.length) return null;
      const x = thresholdDs.data[0].x;
      const color = colorMap[key] || '#2196F3';
      return {
        label: `${key}_line`,
        data: [
          { x, y: 0 },
          { x, y: maxLactateForAxis }
        ],
        borderColor: color,
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        showLine: true,
        // vykreslit za body thresholdů, ale před zónami (zbytek pořadí určí Chart.js)
        order: -0.5,
      };
    })
    .filter(Boolean);

  // Calculate X axis range first (needed for zone rendering)
  const allXValuesForZones = [
    ...xVals,
    ...(baseLactatePoint ? [baseLactatePoint.x] : []),
    ...(polyPoints.length > 0 ? polyPoints.map(p => p.x) : []),
    ...thresholdDatasets
      .filter(ds => ds !== null)
      .flatMap(ds => ds.data.map(d => d.x))
  ].filter(x => !isNaN(x) && isFinite(x));
  
  const minXForZones = allXValuesForZones.length > 0 ? Math.min(...allXValuesForZones) : 0;
  const maxXForZones = allXValuesForZones.length > 0 ? Math.max(...allXValuesForZones) : 100;
  const xRangeForZones = maxXForZones - minXForZones;

  // Create zone datasets for colored background areas
  const zoneDatasets = (() => {
    if (!zones || !thresholds['LTP1'] || !thresholds['LTP2']) {
      return [];
    }
    
    const zoneColors = {
      zone1: 'rgba(34, 197, 94, 0.3)',   // Bright Green - Recovery
      zone2: 'rgba(59, 130, 246, 0.3)',  // Blue - Aerobic
      zone3: 'rgba(251, 191, 36, 0.3)',  // Amber/Yellow - Tempo
      zone4: 'rgba(239, 68, 68, 0.3)',   // Red - Threshold
      zone5: 'rgba(139, 92, 246, 0.3)',   // Purple - VO2max
    };
    
    const zoneNames = {
      zone1: 'Zone 1 - Recovery',
      zone2: 'Zone 2 - Aerobic',
      zone3: 'Zone 3 - Tempo',
      zone4: 'Zone 4 - Threshold',
      zone5: 'Zone 5 - VO2max',
    };
    
    const zoneDatasets = [];
    
    if (isPaceSport) {
      // For pace sports, zones are in pace (seconds)
      const paceZones = zones.pace;
      if (paceZones) {
        const zoneKeys = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
        let previousBoundary = null;
        
        zoneKeys.forEach((zoneKey, index) => {
          const zone = paceZones[zoneKey];
          if (!zone || !zone.min || !zone.max) return;
          
          // Convert pace strings back to numbers if needed
          let minPace, maxPace;
          if (inputMode === 'pace') {
            // Pace mode: zones are in pace (seconds or M:SS format)
            minPace = typeof zone.min === 'string' 
              ? (() => {
                  const parts = zone.min.split(':');
                  if (parts.length === 2) {
                    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                  }
                  return parseFloat(zone.min);
                })()
              : zone.min;
            maxPace = typeof zone.max === 'string'
              ? (() => {
                  const parts = zone.max.split(':');
                  if (parts.length === 2) {
                    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                  }
                  return parseFloat(zone.max);
                })()
              : zone.max;
          } else {
            // Speed mode: zones are stored in pace, but need to be converted to speed (km/h or mph)
            // First parse pace from string format (M:SS) to seconds
            let minPaceSeconds = typeof zone.min === 'string' 
              ? (() => {
                  const parts = zone.min.split(':');
                  if (parts.length === 2) {
                    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                  }
                  return parseFloat(zone.min);
                })()
              : zone.min;
            let maxPaceSeconds = typeof zone.max === 'string'
              ? (() => {
                  const parts = zone.max.split(':');
                  if (parts.length === 2) {
                    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                  }
                  return parseFloat(zone.max);
                })()
              : zone.max;
            
            // Convert pace (seconds) to speed (km/h or mph)
            // For pace zones: min is slower (higher seconds), max is faster (lower seconds)
            // For speed: min should be slower (lower speed), max should be faster (higher speed)
            // So: slower pace (zone.min, higher seconds) -> lower speed
            //     faster pace (zone.max, lower seconds) -> higher speed
            minPace = convertPaceToSpeed(minPaceSeconds, unitSystem); // Slower pace (higher seconds) = lower speed
            maxPace = convertPaceToSpeed(maxPaceSeconds, unitSystem); // Faster pace (lower seconds) = higher speed
          }
          
          if (isNaN(minPace) || isNaN(maxPace)) return;
          
          // For reverse axis (pace mode): zones go from fast (low value, right side) to slow (high value, left side)
          // Zone 1 is fastest (lowest pace value), Zone 5 is slowest (highest pace value)
          // For normal axis (speed mode): zones go from slow (low value, left side) to fast (high value, right side)
          // Zone 1 is slowest (lowest speed), Zone 5 is fastest (highest speed)
          
          let zoneMinX, zoneMaxX;
          
          if (isReverse) {
            // Reverse axis (pace mode): Zone 1 (slowest) starts from left side, Zone 5 (fastest) ends at right side
            // For pace zones: minPace = slower (higher seconds), maxPace = faster (lower seconds)
            // With reverse axis: left = slower (higher seconds = minPace), right = faster (lower seconds = maxPace)
            // Zone 1 (slowest) should be on left (starts at minPace), Zone 5 (fastest) should be on right (ends at maxPace)
            // Same logic as speed mode but with reverse axis
            if (zoneKey === 'zone1') {
              // Zone 1 starts from the left edge (slowest pace, highest value = minPace)
              zoneMinX = maxXForZones + (xRangeForZones * 0.1);
            } else {
              // Other zones start where previous zone ended
              zoneMinX = previousBoundary !== null ? previousBoundary : minPace;
            }
            // Zone ends at maxPace (going from slow to fast: minPace -> maxPace)
            zoneMaxX = maxPace;
            previousBoundary = maxPace;
          } else {
            // Normal axis (speed mode): Zone 1 (slowest) starts from left side (minX), Zone 5 (fastest) ends at right side (maxX)
            // minPace = lower speed (slower), maxPace = higher speed (faster)
            if (zoneKey === 'zone1') {
              // Zone 1 starts from the left edge (slowest speed, lowest value)
              zoneMinX = Math.max(0, minXForZones - (xRangeForZones * 0.1));
            } else {
              // Other zones start where previous zone ended
              zoneMinX = previousBoundary !== null ? previousBoundary : minPace;
            }
            // Zone ends at maxPace (faster speed, higher value, right side)
            zoneMaxX = maxPace;
            previousBoundary = maxPace;
          }
          
          // Store zone boundaries for plugin rendering
          zoneDatasets.push({
            label: zoneNames[zoneKey],
            data: [
              { x: zoneMinX, y: 0 },
              { x: zoneMaxX, y: 0 },
            ],
            backgroundColor: zoneColors[zoneKey],
            borderColor: 'transparent',
            borderWidth: 0,
            pointRadius: 0,
            showLine: false,
            order: -1 - index, // Render zones behind other data
            zoneKey: zoneKey,
            zoneInfo: {
              name: zoneNames[zoneKey],
              power: { min: zone.min, max: zone.max },
              heartRate: zones.heartRate?.[zoneKey] || null,
            },
            minX: zoneMinX,
            maxX: zoneMaxX,
          });
        });
      }
    } else {
      // For bike, zones are in power (watts)
      const powerZones = zones.power;
      if (powerZones) {
        const zoneKeys = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
        let previousMax = null;
        
        zoneKeys.forEach((zoneKey, index) => {
          const zone = powerZones[zoneKey];
          if (!zone || zone.min === undefined || zone.max === undefined) return;
          
          // For Zone 1, start from the beginning of the graph
          // For other zones, start where previous zone ended (no gaps)
          const actualMinX = (zoneKey === 'zone1') 
            ? Math.max(0, minXForZones - (xRangeForZones * 0.1)) 
            : (previousMax !== null ? previousMax : zone.min);
          
          previousMax = zone.max;
          
          // Store zone boundaries for plugin rendering
          zoneDatasets.push({
            label: zoneNames[zoneKey],
            data: [
              { x: actualMinX, y: 0 },
              { x: zone.max, y: 0 },
            ],
            backgroundColor: zoneColors[zoneKey],
            borderColor: 'transparent',
            borderWidth: 0,
            pointRadius: 0,
            showLine: false,
            order: -1 - index, // Render zones behind other data
            zoneKey: zoneKey,
            zoneInfo: {
              name: zoneNames[zoneKey],
              power: { min: zone.min, max: zone.max },
              heartRate: zones.heartRate?.[zoneKey] || null,
            },
            minX: actualMinX,
            maxX: zone.max,
          });
        });
      }
    }
    
    return zoneDatasets;
  })();

  // Create Glucose dataset if there's glucose data
  const glucoseDataPoints = allMeasuredDataPoints
    .filter(p => p.glucose !== null && p.glucose !== undefined && !isNaN(p.glucose) && p.glucose > 0)
    .map(p => ({ x: p.x, y: p.glucose }));
  
  const glucoseDataSet = glucoseDataPoints.length > 0 ? {
    label: 'Glucose',
    data: glucoseDataPoints,
    borderColor: '#f59e0b', // amber-500
    backgroundColor: 'transparent',
    pointRadius: 4,
    pointBackgroundColor: '#f59e0b',
    pointBorderColor: '#f59e0b',
    showLine: true,
    borderWidth: 2,
    tension: 0.4,
    yAxisID: 'y1', // Use secondary Y axis
  } : null;

  // Create VO2 dataset if there's VO2 data
  const vo2DataPoints = allMeasuredDataPoints
    .filter(p => p.vo2 !== null && p.vo2 !== undefined && !isNaN(p.vo2) && p.vo2 > 0)
    .map(p => ({ x: p.x, y: p.vo2 }));
  
  // Create function to get legend items with dynamic Glucose and VO2
  const getLegendItems = () => {
    return [
      ...baseLegendItems,
      ...(glucoseDataPoints.length > 0 ? [{ color: 'bg-amber-500', label: 'Glucose', dsLabel: 'Glucose' }] : []),
      ...(vo2DataPoints.length > 0 ? [{ color: 'bg-violet-500', label: 'VO₂', dsLabel: 'VO2' }] : [])
    ];
  };
  
  const vo2DataSet = vo2DataPoints.length > 0 ? {
    label: 'VO2',
    data: vo2DataPoints,
    borderColor: '#8b5cf6', // violet-500
    backgroundColor: 'transparent',
    pointRadius: 4,
    pointBackgroundColor: '#8b5cf6',
    pointBorderColor: '#8b5cf6',
    showLine: true,
    borderWidth: 2,
    tension: 0.4,
    yAxisID: 'y2', // Use tertiary Y axis
  } : null;

  const allDatasets = [
    ...zoneDatasets,
    ...ltpLineDatasets,
    ...thresholdDatasets,
    measuredDataSet,
    ...(polyDataSet ? [polyDataSet] : []),
    ...(glucoseDataSet ? [glucoseDataSet] : []),
    ...(vo2DataSet ? [vo2DataSet] : []),
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
  
  // Calculate Y axis max from all valid data points (after thresholdDatasets is defined)
  const maxYValue = (() => {
    const allYValues = [
      ...yValsMeasured, // Only measured values (already filtered)
      ...(baseLactatePoint ? [baseLactatePoint.y] : []),
      ...(polyPoints.length > 0 ? polyPoints.map(p => p.y).filter(y => y >= 0 && y <= 20) : []), // Only reasonable polynomial values
      ...thresholdDatasets
        .filter(ds => ds !== null)
        .flatMap(ds => ds.data.map(d => d.y))
        .filter(y => y >= 0 && y <= 20) // Only reasonable threshold values
    ].filter(y => !isNaN(y) && isFinite(y) && y >= 0);
    
    if (allYValues.length === 0) return 15; // Default max
    
    const maxY = Math.max(...allYValues);
    // Add 10% padding, but ensure minimum of 1 mmol/L padding
    return Math.ceil(maxY * 1.1 + 1);
  })();
  
  // Helper function to parse pace string (M:SS) to seconds
  const parsePaceToSeconds = (paceStr) => {
    if (typeof paceStr !== 'string') return paceStr;
    const parts = paceStr.split(':');
    if (parts.length !== 2) return null;
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return null;
    return minutes * 60 + seconds;
  };
  
  // Helper function to get zone info for a given x value
  const getZoneForX = (xValue) => {
    if (!zones) return null;
    
    if (isPaceSport) {
      const paceZones = zones.pace;
      if (!paceZones) return null;
      
      for (const [zoneKey, zone] of Object.entries(paceZones)) {
        if (!zone || !zone.min || !zone.max) continue;
        
        let minValue, maxValue;
        if (inputMode === 'pace') {
          // Pace mode: parse pace strings to seconds
          minValue = typeof zone.min === 'string' ? parsePaceToSeconds(zone.min) : zone.min;
          maxValue = typeof zone.max === 'string' ? parsePaceToSeconds(zone.max) : zone.max;
          
          // For pace: check if xValue is between min and max (considering reverse axis)
          const inZone = isReverse 
            ? (xValue <= minValue && xValue >= maxValue)
            : (xValue >= minValue && xValue <= maxValue);
          
          if (inZone) {
            return {
              key: zoneKey,
              name: {
                zone1: 'Zone 1 - Recovery',
                zone2: 'Zone 2 - Aerobic',
                zone3: 'Zone 3 - Tempo',
                zone4: 'Zone 4 - Threshold',
                zone5: 'Zone 5 - VO2max',
              }[zoneKey],
              power: zone,
              heartRate: zones.heartRate?.[zoneKey] || null,
            };
          }
        } else {
          // Speed mode: convert pace to speed
          // Zone.min is slower pace (higher seconds) -> lower speed
          // Zone.max is faster pace (lower seconds) -> higher speed
          const minPaceSeconds = typeof zone.min === 'string' 
            ? parsePaceToSeconds(zone.min) 
            : zone.min;
          const maxPaceSeconds = typeof zone.max === 'string' 
            ? parsePaceToSeconds(zone.max) 
            : zone.max;
          
          if (isNaN(minPaceSeconds) || isNaN(maxPaceSeconds)) continue;
          
          // Convert to speed: slower pace (higher seconds) = lower speed, faster pace (lower seconds) = higher speed
          // zone.min is slower pace (higher seconds) -> lower speed
          // zone.max is faster pace (lower seconds) -> higher speed
          minValue = convertPaceToSpeed(minPaceSeconds, unitSystem); // Slower pace (higher seconds) -> lower speed
          maxValue = convertPaceToSpeed(maxPaceSeconds, unitSystem); // Faster pace (lower seconds) -> higher speed
          
          // For speed mode (normal axis): check if xValue is between min (slower) and max (faster)
          // Zone 1: slowest (lowest speed), Zone 5: fastest (highest speed)
          if (xValue >= minValue && xValue <= maxValue) {
            return {
              key: zoneKey,
              name: {
                zone1: 'Zone 1 - Recovery',
                zone2: 'Zone 2 - Aerobic',
                zone3: 'Zone 3 - Tempo',
                zone4: 'Zone 4 - Threshold',
                zone5: 'Zone 5 - VO2max',
              }[zoneKey],
              power: {
                min: minValue.toFixed(1),
                max: maxValue.toFixed(1)
              },
              heartRate: zones.heartRate?.[zoneKey] || null,
            };
          }
        }
      }
    } else {
      const powerZones = zones.power;
      if (!powerZones) return null;
      
      for (const [zoneKey, zone] of Object.entries(powerZones)) {
        if (!zone || zone.min === undefined || zone.max === undefined) continue;
        
        if (xValue >= zone.min && xValue <= zone.max) {
          return {
            key: zoneKey,
            name: {
              zone1: 'Zone 1 - Recovery',
              zone2: 'Zone 2 - Aerobic',
              zone3: 'Zone 3 - Tempo',
              zone4: 'Zone 4 - Threshold',
              zone5: 'Zone 5 - VO2max',
            }[zoneKey],
            power: zone,
            heartRate: zones.heartRate?.[zoneKey] || null,
          };
        }
      }
    }
    
    return null;
  };
  
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
          // Calculate step size for more ticks
          stepSize: (() => {
            const range = maxX - minX;
            if (isPaceSport && inputMode === 'pace') {
              // For pace: aim for ~8-12 ticks, step should be nice round seconds (15s, 30s, 1min, etc.)
              const idealStep = range / 10;
              // Round to nice values: 15s, 30s, 60s, 90s, 120s, etc.
              if (idealStep <= 20) return 15;
              if (idealStep <= 40) return 30;
              if (idealStep <= 75) return 60;
              if (idealStep <= 105) return 90;
              return Math.round(idealStep / 30) * 30; // Round to nearest 30 seconds
            } else if (isPaceSport && inputMode === 'speed') {
              // For speed: aim for ~8-12 ticks, step should be nice values (0.5, 1, 2 km/h)
              const idealStep = range / 10;
              if (idealStep <= 0.75) return 0.5;
              if (idealStep <= 1.5) return 1;
              return Math.round(idealStep);
            } else {
              // For power: aim for ~8-12 ticks, step should be nice values (10W, 20W, 50W, etc.)
              const idealStep = range / 10;
              if (idealStep <= 15) return 10;
              if (idealStep <= 30) return 20;
              if (idealStep <= 60) return 50;
              return Math.round(idealStep / 50) * 50; // Round to nearest 50W
            }
          })(),
          maxTicksLimit: 15, // Maximum number of ticks
          callback: function(value) {
            // Show "Base Lactate" for base lactate point position
            if (baseLactatePoint && Math.abs(value - baseLactatePoint.x) < 0.01) {
              return 'Base Lactate';
            }
            if (isPaceSport) {
              if (inputMode === 'pace') {
                // value is already pace seconds - round to whole seconds for cleaner display
                const totalSeconds = Math.round(value);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const unit = isSwimming ? (unitSystem === 'imperial' ? '/100yd' : '/100m') : (unitSystem === 'imperial' ? '/mile' : '/km');
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${unit}`;
              } else {
                // Speed mode - show speed values rounded to 1 decimal
                const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
                return `${value.toFixed(1)}${unit}`;
              }
            }
            // For power: always round to whole watts
            return `${Math.round(value)}W`;
          }
        }
      },
      y: {
        type: 'linear',
        min: 0,
        max: maxYValue, // Use pre-calculated max from valid data points
        title: { display: true, text: 'Lactate (mmol/L)' },
        border: { dash: [6, 6] },
        grid: {
          color: "rgba(0, 0, 0, 0.15)",
          borderDash: [4, 4],
          drawTicks: true,
        },
        position: 'left',
      },
      ...(glucoseDataPoints.length > 0 ? {
        y1: {
          type: 'linear',
          min: 0,
          max: Math.max(...glucoseDataPoints.map(p => p.y)) * 1.1,
          title: { display: true, text: 'Glucose (mmol/L)', color: '#f59e0b' },
          position: 'right',
          grid: {
            drawOnChartArea: false, // Only draw grid for primary Y axis
          },
          ticks: {
            color: '#f59e0b',
          },
        }
      } : {}),
      ...(vo2DataPoints.length > 0 ? {
        y2: {
          type: 'linear',
          min: 0,
          max: Math.max(...vo2DataPoints.map(p => p.y)) * 1.1,
          title: { display: true, text: 'VO₂ (ml/kg/min)', color: '#8b5cf6' },
          position: 'right',
          grid: {
            drawOnChartArea: false, // Only draw grid for primary Y axis
          },
          ticks: {
            color: '#8b5cf6',
          },
        }
      } : {}),
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
          title: (items) => {
            // Check if hovering over a zone
            if (items.length > 0) {
              const firstItem = items[0];
              const xVal = firstItem.parsed.x;
              const zone = getZoneForX(xVal);
              
              if (zone) {
                return zone.name;
              }
            }
            return '';
          },
          label: (ctx) => {
            const label = ctx.dataset.label;
            const xVal = ctx.parsed.x;
            const yVal = ctx.parsed.y;
            const point = ctx.raw;
            const isLTP1 = label === 'LTP1';
            const isLTP2 = label === 'LTP2';
            
            // Check if hovering over a zone dataset (colored background)
            const zone = getZoneForX(xVal);
            if (zone && ctx.dataset.zoneKey) {
              // Show zone information when hovering over zone background
              const labels = [];
              
              if (isPaceSport) {
                if (inputMode === 'pace') {
                  const minPace = typeof zone.power.min === 'string' ? zone.power.min : formatSecondsToMMSS(zone.power.min);
                  const maxPace = typeof zone.power.max === 'string' ? zone.power.max : formatSecondsToMMSS(zone.power.max);
                  const unit = isSwimming ? (unitSystem === 'imperial' ? '/100yd' : '/100m') : (unitSystem === 'imperial' ? '/mile' : '/km');
                  labels.push(`Pace: ${minPace}${unit} - ${maxPace}${unit}`);
                } else {
                  // Speed mode: zone.power already contains converted speed values (min = slower, max = faster)
                  const minSpeed = typeof zone.power.min === 'string' ? zone.power.min : parseFloat(zone.power.min).toFixed(1);
                  const maxSpeed = typeof zone.power.max === 'string' ? zone.power.max : parseFloat(zone.power.max).toFixed(1);
                  const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
                  labels.push(`Speed: ${minSpeed}${unit} - ${maxSpeed}${unit}`);
                }
              } else {
                labels.push(`Power: ${zone.power.min}W - ${zone.power.max}W`);
              }
              
              if (zone.heartRate) {
                labels.push(`HR: ${zone.heartRate.min} - ${zone.heartRate.max} bpm`);
              }
              
              return labels;
            }
            
            // If hovering over data point, show normal tooltip (zone info will be in afterBody)
            
            // Check if this is the base lactate point
            if (point && point.label === 'Base Lactate') {
              // For base lactate, show only the lactate value, not power/pace
              return `Base Lactate: ${yVal.toFixed(2)} mmol/L`;
            }
            
            // Enhanced display for LTP1 and LTP2 – same unit as X-axis (speed/pace/power)
            let formattedValue;
            const useSpeed = isPaceSport && (inputMode === 'speed' || (xVal > 0 && xVal < 100));
            if (!isPaceSport) {
              formattedValue = `${Math.round(xVal)}W`;
            } else if (useSpeed) {
              const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
              formattedValue = `${Number(xVal).toFixed(1)}${unit}`;
            } else if (isPaceSport) {
                const paceStr = formatSecondsToMMSS(xVal);
                const unit = isSwimming ? (unitSystem === 'imperial' ? '/100yd' : '/100m') : (unitSystem === 'imperial' ? '/mile' : '/km');
              formattedValue = `${paceStr}${unit}`;
              } else {
              formattedValue = `${Math.round(xVal)}W`;
              }
            
            // Add RPE/Borg and HR to tooltip if available
            let additionalInfo = [];
            if (point && point.rpe !== null && point.rpe !== undefined) {
              const rpeLabel = rpeScale === 'borg' ? 'Borg' : 'RPE';
              additionalInfo.push(`${rpeLabel}: ${point.rpe}`);
            }
            if (point && point.heartRate !== null && point.heartRate !== undefined) {
              additionalInfo.push(`HR: ${Math.round(point.heartRate)} bpm`);
            }
            
            // For LTP1/LTP2 thresholds
            if (isLTP1 || isLTP2) {
              const thresholdLabel = isLTP1 ? 'LT1 (Aerobic Threshold)' : 'LT2 (Anaerobic Threshold)';
              const mainLabel = `${thresholdLabel}: ${formattedValue} | ${yVal.toFixed(2)} mmol/L`;
              return additionalInfo.length > 0 
                ? `${mainLabel} | ${additionalInfo.join(' | ')}`
                : mainLabel;
            }
            
            // For regular data points
            const mainLabel = `${formattedValue} | ${yVal.toFixed(2)} mmol/L`;
            return additionalInfo.length > 0 
              ? `${mainLabel} | ${additionalInfo.join(' | ')}`
              : mainLabel;
          },
          labelPointStyle: (context) => {
            return {
              pointStyle: 'circle',
              rotation: 0
            };
          },
          afterBody: (items) => {
            // Add zone info if hovering over a zone but not a zone dataset
            if (items.length > 0) {
              const firstItem = items[0];
              const xVal = firstItem.parsed.x;
              const zone = getZoneForX(xVal);
              
              if (zone && !firstItem.dataset.zoneKey) {
                // Show zone info below the main tooltip
                return [
                  '',
                  `Zone: ${zone.name}`,
                  isPaceSport 
                    ? (inputMode === 'pace' 
                        ? `Pace: ${typeof zone.power.min === 'string' ? zone.power.min : formatSecondsToMMSS(zone.power.min)} - ${typeof zone.power.max === 'string' ? zone.power.max : formatSecondsToMMSS(zone.power.max)}`
                        : `Speed: ${typeof zone.power.min === 'string' ? zone.power.min : parseFloat(zone.power.min).toFixed(1)} - ${typeof zone.power.max === 'string' ? zone.power.max : parseFloat(zone.power.max).toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`)
                    : `Power: ${zone.power.min}W - ${zone.power.max}W`,
                  zone.heartRate ? `HR: ${zone.heartRate.min} - ${zone.heartRate.max} bpm` : null,
                ].filter(Boolean);
              }
            }
            return [];
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

  // Heart rate vs lactate view: X = lactate (mmol/L), Y = tepy (heart rate bpm), červená křivka
  const hasEnoughHRData = validResultsWithHR.length >= 2;
  const hrMeasuredPoints = hasEnoughHRData
    ? [...validResultsWithHR]
        .map(r => ({
          x: Number(String(r.lactate).replace(',', '.')),
          y: Number(String(r.heartRate).replace(',', '.'))
        }))
        .sort((a, b) => a.x - b.x)
    : [];
  const hrPolyPoints = hasEnoughHRData ? calculatePolynomialRegressionLactateToHR(validResultsWithHR) : [];
  const hrMeasuredDataSet = hasEnoughHRData
    ? {
        label: 'Measured data',
        data: hrMeasuredPoints,
        showLine: false,
        pointBackgroundColor: '#fef2f2',
        pointBorderColor: '#dc2626',
        pointBorderWidth: 2,
        pointRadius: 5,
      }
    : null;
  const hrPolyDataSet = hasEnoughHRData && hrPolyPoints.length > 0
    ? {
        label: 'Polynomial Fit',
        data: hrPolyPoints,
        borderColor: '#dc2626',
        backgroundColor: 'transparent',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.4,
        showLine: true,
        hitRadius: 10 // Allow hovering over the line
      }
    : null;
  const hrThresholdDatasets = hasEnoughHRData && thresholds?.heartRates && thresholds?.lactates
    ? (['LTP1', 'LTP2', 'IAT', 'Log-log']).filter(key => {
        const hr = thresholds.heartRates[key];
        const la = thresholds.lactates[key];
        return hr != null && !isNaN(Number(hr)) && la != null && !isNaN(Number(la));
      }).map(key => ({
        label: key,
        data: [{ x: Number(thresholds.lactates[key]), y: Number(thresholds.heartRates[key]) }],
        borderColor: colorMap[key] || '#dc2626',
        backgroundColor: colorMap[key] || '#dc2626',
        pointRadius: 6,
        showLine: false,
      }))
    : [];
  const hrChartData = hasEnoughHRData
    ? { datasets: [hrMeasuredDataSet, hrPolyDataSet, ...hrThresholdDatasets].filter(Boolean) }
    : { datasets: [] };
  const hrXValues = hrMeasuredPoints.map(p => p.x).concat(hrThresholdDatasets.flatMap(ds => ds.data.map(d => d.x)));
  const hrYValues = hrMeasuredPoints.map(p => p.y).concat(hrThresholdDatasets.flatMap(ds => ds.data.map(d => d.y)));
  const hrMinX = hrXValues.length ? Math.min(...hrXValues) : 0;
  const hrMaxX = hrXValues.length ? Math.max(...hrXValues) : 4;
  const hrMinY = hrYValues.length ? Math.min(...hrYValues) : 80;
  const hrMaxY = hrYValues.length ? Math.max(...hrYValues) : 180;
  const hrXPadding = (hrMaxX - hrMinX) * 0.1 || 0.2;
  const hrYPadding = (hrMaxY - hrMinY) * 0.1 || 10;
  const hrChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    layout: {
      padding: {
        right: 20 // Add padding on right for HR view
      }
    },
    scales: {
      x: {
        type: 'linear',
        min: Math.max(0, hrMinX - hrXPadding),
        max: hrMaxX + hrXPadding,
        title: { display: true, text: 'Lactate (mmol/L)' },
        border: { dash: [6, 6] },
        grid: { color: 'rgba(0, 0, 0, 0.15)', borderDash: [4, 4], drawTicks: true },
      },
      y: {
        type: 'linear',
        min: Math.max(0, hrMinY - hrYPadding),
        max: Math.min(250, hrMaxY + hrYPadding),
        title: { display: true, text: 'Heart rate (bpm) / Tepy' },
        border: { dash: [6, 6] },
        grid: { color: 'rgba(0, 0, 0, 0.15)', borderDash: [4, 4], drawTicks: true },
        ticks: { callback: (value) => `${Math.round(value)}` }
      },
    },
    plugins: {
      legend: { display: false },
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
          label: (ctx) => {
            const x = ctx.parsed.x;
            const y = ctx.parsed.y;
            return ctx.dataset.label === 'Measured data'
              ? `Lactate: ${x.toFixed(2)} mmol/L | HR: ${Math.round(y)} bpm`
              : `${ctx.dataset.label}: Lactate ${x.toFixed(2)} mmol/L | HR ${Math.round(y)} bpm`;
          },
        },
      },
    },
    elements: { 
      point: { radius: 5, hoverRadius: 8, hitRadius: 8 },
      line: {
        borderWidth: 2,
        tension: 0.4,
        hitRadius: 10 // Allow hovering over the line
      }
    },
  };

  const finalData = chartView === 'hr' && hasEnoughHRData ? hrChartData : data;
  const finalOptions = chartView === 'hr' && hasEnoughHRData ? hrChartOptions : options;
  const showHRViewPlaceholder = chartView === 'hr' && !hasEnoughHRData;

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 bg-white rounded-2xl shadow-lg mt-3 sm:mt-5 relative">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold">
              Lactate Curve
              {trainingTitle && (
                <span className="text-base sm:text-lg text-gray-800 ml-2">
                  {trainingTitle}
                </span>
              )}
              <span className="text-base sm:text-lg text-gray-600 ml-2">({formatDate(mockData.date)})</span>
            </h2>
            <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="group">
              <button
                type="button"
                onClick={() => setChartView('power')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  chartView === 'power' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Power or pace vs lactate"
              >
                Power/pace vs lactate
              </button>
              <button
                type="button"
                onClick={() => setChartView('hr')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  chartView === 'hr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Heart rate vs lactate"
              >
                Heart rate vs lactate
              </button>
            </div>
            <button
              onClick={() => setShowGlossary(true)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Show glossary"
              title="Training Glossary"
            >
              <InformationCircleIcon className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => setShowDataTable(!showDataTable)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label={showDataTable ? "Expand curve" : "Show table"}
              title={showDataTable ? "Expand curve to full width" : "Show data table"}
            >
              {showDataTable ? (
                <ArrowsPointingOutIcon className="w-5 h-5 text-gray-500" />
              ) : (
                <ArrowsPointingInIcon className="w-5 h-5 text-gray-500" />
              )}
            </button>
          </div>
          {!demoMode && (
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2">
              <div className="flex flex-col gap-1">
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
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className={`px-3 py-2 text-xs sm:text-sm rounded-lg border transition-colors ${
                    downloadingPdf
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-200'
                  }`}
                  title="Download full report as PDF (includes comparison with previous tests)"
                >
                  {downloadingPdf ? 'Preparing…' : 'Download PDF'}
                </button>
                {pdfStatus?.message && (
                  <div className={`text-xs ${pdfStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {pdfStatus.message}
                  </div>
                )}
              </div>
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
          <div className={showDataTable ? "flex-1 min-w-0" : "w-full"} style={{ height: '400px', minHeight: '300px' }}>
            {showHRViewPlaceholder ? (
              <div className="h-full flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center p-6">
                <div>
                  <p className="text-gray-600 font-medium">No heart rate data for this test</p>
                  <p className="text-sm text-gray-500 mt-1">Add heart rate (bpm) to at least 2 steps to see Heart rate vs lactate.</p>
                </div>
              </div>
            ) : (
            <Line 
              ref={chartRef} 
              data={finalData} 
              options={finalOptions}
              plugins={[{
                id: 'zonePlugin',
                beforeDraw: (chart) => {
                  const ctx = chart.ctx;
                  const chartArea = chart.chartArea;
                  const xScale = chart.scales.x;
                  
                  // Draw zones if they are visible
                  if (zonesVisibleRef.current) {
                  // Find zone datasets
                  const zoneDatasets = chart.data.datasets.filter(ds => ds.zoneKey);
                  
                  zoneDatasets.forEach((dataset) => {
                    if (!dataset.zoneKey) return;
                    
                    ctx.save();
                    ctx.fillStyle = dataset.backgroundColor;
                    
                    // Get zone boundaries
                    const minX = dataset.minX !== undefined ? dataset.minX : (dataset.data?.[0]?.x);
                    const maxX = dataset.maxX !== undefined ? dataset.maxX : (dataset.data?.[1]?.x);
                    
                    if (minX === undefined || maxX === undefined) {
                      ctx.restore();
                      return;
                    }
                    
                    // Convert values to pixel positions
                    // Chart.js handles reverse axis automatically in getPixelForValue
                    const x1 = xScale.getPixelForValue(minX);
                    const x2 = xScale.getPixelForValue(maxX);
                    const y1 = chartArea.top;
                    const y2 = chartArea.bottom;
                    
                    // Ensure x1 < x2 for proper rectangle drawing
                    // (Chart.js reverse axis may return x1 > x2, so we need to handle that)
                    const leftX = Math.min(x1, x2);
                    const rightX = Math.max(x1, x2);
                    const width = rightX - leftX;
                    
                    // Draw rectangle
                    ctx.fillRect(leftX, y1, width, y2 - y1);
                    ctx.restore();
                  });
                  }
                  
                  // Draw labels for LTP1 and LTP2 lines only if they are visible (only for power/pace view, not HR view)
                  if (chartView === 'power' && zonesVisibleRef.current && ltpLinesVisibleRef.current) {
                    const ltp1Dataset = chart.data.datasets.find(ds => ds.label === 'LTP1');
                    const ltp2Dataset = chart.data.datasets.find(ds => ds.label === 'LTP2');
                    
                    const labels = [];
                    
                    // Collect label data
                    [ltp1Dataset, ltp2Dataset].forEach((dataset, index) => {
                      if (!dataset || !dataset.data || dataset.data.length === 0) return;
                      
                      const point = dataset.data[0];
                      const xPixel = xScale.getPixelForValue(point.x);
                      const label = index === 0 ? 'LT1' : 'LT2';
                      
                      // Format value for label: use same unit as X-axis (sport + inputMode; infer from point.x when needed)
                      const currentSport = mockData?.sport || '';
                      const isBikeSport = currentSport === 'bike';
                      // When axis is Speed (km/h), point.x is in 0.5–30 (run) or 0.5–8 (swim). When axis is Pace, point.x is seconds (e.g. 180–600).
                      const looksLikeSpeed = isPaceSport && point.x > 0 && point.x < 100;
                      const useSpeedLabel = isPaceSport && (inputMode === 'speed' || looksLikeSpeed);

                      let valueText = '';
                      if (isBikeSport || (!isPaceSport && point.x >= 20 && point.x <= 1000)) {
                        // Bike or power-based: show Power (W)
                        valueText = `Power: ${Math.round(point.x)}W`;
                      } else if (isPaceSport && useSpeedLabel) {
                        // Run/swim, axis in km/h: point.x is speed
                        const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
                        valueText = `Speed: ${Number(point.x).toFixed(1)}${unit}`;
                      } else if (isPaceSport) {
                        // Run/swim, axis in pace: point.x is seconds per km/100m
                        const paceStr = formatSecondsToMMSS(point.x);
                        const unit = isSwimming ? (unitSystem === 'imperial' ? '/100yd' : '/100m') : (unitSystem === 'imperial' ? '/mile' : '/km');
                        valueText = `Pace: ${paceStr}${unit}`;
                      } else {
                        valueText = `Power: ${Math.round(point.x)}W`;
                      }
                      const lactateText = `${point.y.toFixed(2)} mmol/L`;
                      
                      labels.push({
                        xPixel,
                        label,
                        valueText,
                        lactateText,
                        fullLabel: `${label}: ${valueText} | ${lactateText}`
                      });
                    });
                    
                    // Draw labels with collision detection
                    if (labels.length > 0) {
                      ctx.save();
                      ctx.font = '11px sans-serif'; // Smaller font
                      ctx.fillStyle = '#000000'; // Black text
                      ctx.textAlign = 'left'; // Align to left (text will be to the right of line)
                      ctx.textBaseline = 'middle';
                      
                      // Measure text width to detect overlaps
                      const minSpacing = 150; // Minimum spacing between labels in pixels
                      const labelHeight = 14; // Height of each label line
                      
                      labels.forEach((labelData, index) => {
                        let labelX = labelData.xPixel + 8; // 8px offset from line
                        let labelY = chartArea.top + 15; // Near top
                        
                        // Check if labels are too close together
                        if (labels.length === 2 && index === 1) {
                          const prevLabel = labels[0];
                          const prevLabelX = prevLabel.xPixel + 8;
                          
                          // If labels would overlap, stack them vertically
                          if (Math.abs(labelData.xPixel - prevLabel.xPixel) < minSpacing) {
                            // Stack vertically - second label below first
                            labelY = chartArea.top + 15 + labelHeight;
                            // Try to align X positions if they're very close
                            if (Math.abs(labelData.xPixel - prevLabel.xPixel) < 50) {
                              labelX = prevLabelX; // Align X positions when very close
                            }
                          } else {
                            // Labels are far enough apart, can use same Y
                            labelY = chartArea.top + 15;
                          }
                        }
                        
                        ctx.fillText(labelData.fullLabel, labelX, labelY);
                      });
                      
                      ctx.restore();
                    }
                  }
                }
              }]}
            />
            )}
          </div>
          
          {showDataTable && (
            <>
              {chartView === 'power' && (
                <div className="w-full lg:w-[80px] shrink-0">
                  <Legend 
                    chartRef={chartRef} 
                    zonesVisible={zonesVisible} 
                    setZonesVisible={(value) => {
                      setZonesVisible(value);
                      zonesVisibleRef.current = value;
                      if (chartRef.current) chartRef.current.update();
                    }} 
                    ltpLinesVisibleRef={ltpLinesVisibleRef}
                    getLegendItems={getLegendItems}
                  />
                </div>
              )}
              {chartView === 'hr' && hasEnoughHRData && (
                <div className="w-full lg:w-[100px] shrink-0">
                  <HRLegend chartRef={chartRef} />
                </div>
              )}
              <div className="w-full lg:w-[400px] shrink-0">
                <DataTable mockData={mockData} />
              </div>
            </>
          )}
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
