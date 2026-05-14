import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Line } from 'react-chartjs-2';
import api from '../../services/api';
import { calculateZonesFromTest } from './zoneCalculator';
import { downloadLactateReportPdf, generatePdfBlob } from './LactateReportPdf';
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
import DataTable, {
  calculateThresholds,
  calculatePolynomialRegression,
  calculatePolynomialRegressionLactateToHR,
  isThresholdDebugEnabled,
} from './DataTable';
import { InformationCircleIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, EnvelopeIcon, DocumentArrowDownIcon, ArrowPathIcon, ArrowDownTrayIcon, CheckIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';
import { useAuth } from '../../context/AuthProvider';
import { getEffectiveLactateInputMode } from '../../utils/lactateTestInputMode';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import UpgradeModal from '../UpgradeModal';
import { usePremium } from '../../hooks/usePremium';

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
      
      // Tie LT lines visibility to zones toggle
      if (ltpLinesVisibleRef) {
        ltpLinesVisibleRef.current = newValue;
      }
      const chart = chartRef?.current;
      if (chart) {
        chart.data.datasets.forEach((ds, index) => {
          if (ds.label === 'LTP1_line' || ds.label === 'LTP2_line') {
            chart.setDatasetVisibility(index, newValue);
          }
        });
        chart.update();
      }
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

const M_PER_YARD = 0.9144;
const KM_PER_MILE = 1.609344;

/** True when this test's run intervals were stored as seconds per mile (see TestingForm / API). */
function testRunPaceStoredPerMile(mockData, sportKey) {
  if (sportKey !== 'run') return false;
  const u = String(mockData?.unitSystem ?? '').trim().toLowerCase();
  return (
    u === 'imperial' ||
    u === 'us' ||
    u === 'mile' ||
    u === 'miles' ||
    u === 'mi' ||
    u === 'mph'
  );
}

/**
 * Seconds suitable for MM:SS labels on the chart / tooltips.
 * - Swim imperial: canonical sec/100m → sec/100yd.
 * - Run: `unitSystem` is resolved display (user + test); `testRunPerMileStorage` is how `power` was saved.
 *   When display is imperial but test stored sec/km → multiply. When display metric but test stored sec/mile → divide.
 */
const paceSecondsToDisplaySeconds = (
  seconds,
  { isSwimming, unitSystem, testRunPerMileStorage = false }
) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return seconds;
  const s = Number(seconds);
  const displayImperial = unitSystem === 'imperial';
  if (isSwimming) {
    if (!displayImperial) return s;
    return s * M_PER_YARD;
  }
  if (displayImperial && !testRunPerMileStorage) return s * KM_PER_MILE;
  if (!displayImperial && testRunPerMileStorage) return s / KM_PER_MILE;
  return s;
};

const convertPaceToSpeed = (seconds, unitSystem = 'metric', isSwimming = false) => {
  if (!seconds || !Number.isFinite(Number(seconds))) return 0;
  const s = Number(seconds);
  if (isSwimming) {
    const kmh = 360 / s;
    if (unitSystem === 'imperial') return kmh * 0.621371;
    return kmh;
  }
  // Run: s is sec/km (metric) or sec/mile (imperial) → km/h or mph via 3600/s
  return 3600 / s;
};

/** Zóny + LT1/LT2 tooltipy — musí být v Chart.register + options.plugins (react-chartjs-2 ignoruje změny plugins z props po mountu). */
const lactateZoneLtpOverlayPlugin = {
  id: 'lactateZoneLtpOverlay',
  beforeDraw(chart) {
    const opts = chart.options.plugins?.lactateZoneLtpOverlay;
    if (!opts) return;

    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const xScale = chart.scales.x;
    // Prefer live chartView from options (same render as Chart); ref updates after paint and can lag.
    const cv = opts.chartView ?? opts.chartViewRef?.current ?? 'power';
    const { zonesVisibleRef, ltpLinesVisibleRef } = opts;
    const sportKey = opts.sportKey;
    const isPaceSport = opts.isPaceSport;
    const inputMode = opts.inputMode;
    const isSwimming = opts.isSwimming;
    const unitSystem = opts.unitSystem;

    if (zonesVisibleRef?.current) {
      const zoneDatasets = chart.data.datasets.filter((ds) => ds.zoneKey);

      zoneDatasets.forEach((dataset) => {
        if (!dataset.zoneKey) return;

        ctx.save();
        ctx.fillStyle = dataset.backgroundColor;

        const minX =
          dataset.minX !== undefined ? dataset.minX : dataset.data?.[0]?.x;
        const maxX =
          dataset.maxX !== undefined ? dataset.maxX : dataset.data?.[1]?.x;

        if (minX === undefined || maxX === undefined) {
          ctx.restore();
          return;
        }

        const x1 = xScale.getPixelForValue(minX);
        const x2 = xScale.getPixelForValue(maxX);
        const y1 = chartArea.top;
        const y2 = chartArea.bottom;

        const leftX = Math.min(x1, x2);
        const rightX = Math.max(x1, x2);
        const width = rightX - leftX;

        ctx.fillRect(leftX, y1, width, y2 - y1);
        ctx.restore();
      });
    }

    if (
      (cv === 'power' || cv === 'hr') &&
      ltpLinesVisibleRef?.current
    ) {
      const ltp1Dataset = chart.data.datasets.find((ds) => ds.label === 'LTP1');
      const ltp2Dataset = chart.data.datasets.find((ds) => ds.label === 'LTP2');

      const ltp1Index = ltp1Dataset
        ? chart.data.datasets.findIndex((ds) => ds.label === 'LTP1')
        : -1;
      const ltp2Index = ltp2Dataset
        ? chart.data.datasets.findIndex((ds) => ds.label === 'LTP2')
        : -1;
      const yAxisTitle = String(
        chart?.options?.scales?.y?.title?.text || ''
      ).toLowerCase();
      // HR tab: X = lactate, Y = HR — must not format threshold X as pace (would mis-read lactate as seconds).
      const isHRView =
        cv === 'hr' ||
        yAxisTitle.includes('heart rate') ||
        yAxisTitle.includes('tepy');

      const labels = [];

      if (isHRView) {
        [
          { dataset: ltp1Dataset, key: 'LTP1', chartDsIndex: ltp1Index },
          { dataset: ltp2Dataset, key: 'LTP2', chartDsIndex: ltp2Index },
        ].forEach(({ dataset, key, chartDsIndex }) => {
          if (!dataset || !dataset.data || dataset.data.length === 0) return;
          if (
            chartDsIndex >= 0 &&
            typeof chart.isDatasetVisible === 'function' &&
            !chart.isDatasetVisible(chartDsIndex)
          ) {
            return;
          }

          const x = Number(dataset.data[0]?.x);
          if (!Number.isFinite(x)) return;
          const xPixel = xScale.getPixelForValue(x);
          const lineColor = colorMap[key] || '#2196F3';

          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = lineColor;
          ctx.moveTo(xPixel, chartArea.top);
          ctx.lineTo(xPixel, chartArea.bottom);
          ctx.stroke();
          ctx.restore();
        });
      }

      [
        { dataset: ltp1Dataset, index: 0, chartDsIndex: ltp1Index },
        { dataset: ltp2Dataset, index: 1, chartDsIndex: ltp2Index },
      ].forEach(({ dataset, index, chartDsIndex }) => {
        if (!dataset || !dataset.data || dataset.data.length === 0) return;

        if (
          chartDsIndex >= 0 &&
          typeof chart.isDatasetVisible === 'function' &&
          !chart.isDatasetVisible(chartDsIndex)
        ) {
          return;
        }

        const point = dataset.data[0];
        const xPixel = xScale.getPixelForValue(point.x);
        const label = index === 0 ? 'LT1' : 'LT2';

        let valueText = '';
        let lactateText = '';

        if (isHRView) {
          lactateText = `Lactate: ${Number(point.x).toFixed(2)} mmol/L`;
          valueText = `HR: ${Math.round(Number(point.y))} bpm`;
        } else {
          const isBikeSport = sportKey === 'bike';
          const useSpeedLabel = isPaceSport && inputMode === 'speed';

          if (isPaceSport && useSpeedLabel) {
            const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
            valueText = `Speed: ${Number(point.x).toFixed(1)}${unit}`;
          } else if (isPaceSport) {
            const displaySec = paceSecondsToDisplaySeconds(point.x, {
              isSwimming,
              unitSystem,
              testRunPerMileStorage: opts.testRunPerMileStorage,
            });
            const paceStr = formatSecondsToMMSS(displaySec);
            const unit = isSwimming
              ? unitSystem === 'imperial'
                ? '/100yd'
                : '/100m'
              : unitSystem === 'imperial'
                ? '/mile'
                : '/km';
            valueText = `Pace: ${paceStr}${unit}`;
          } else if (isBikeSport || (!isPaceSport && point.x >= 20 && point.x <= 1000)) {
            valueText = `Power: ${Math.round(point.x)}W`;
          } else {
            valueText = `Power: ${Math.round(point.x)}W`;
          }
          lactateText = `Lactate: ${Number(point.y).toFixed(2)} mmol/L`;
        }

        labels.push({
          xPixel,
          label,
          valueText,
          lactateText,
          fullLabel: isHRView
            ? `${label}: ${lactateText} | ${valueText}`
            : `${label}: ${valueText} | ${lactateText}`,
          isHRView,
        });
      });

      if (labels.length > 0) {
        ctx.save();

        const mobileMode = opts.isMobile === true;
        const padXBox = mobileMode ? 6 : 10;
        const padYBox = mobileMode ? 4 : 7;
        const lineGap = mobileMode ? 2 : 3;
        const fontPrimary = mobileMode
          ? '600 9px system-ui, -apple-system, "Segoe UI", sans-serif'
          : '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
        const fontSecondary = mobileMode
          ? '8px system-ui, -apple-system, "Segoe UI", sans-serif'
          : '10px system-ui, -apple-system, "Segoe UI", sans-serif';
        const topMargin = mobileMode ? 4 : 6;
        const accentStripH = mobileMode ? 2 : 3;

        const drawTooltip = (labelData, boxTop) => {
          const isLt1 = labelData.label === 'LT1';
          const line1 = labelData.isHRView
            ? `${labelData.label}: ${labelData.lactateText}`
            : labelData.valueText;
          const line2 = labelData.isHRView
            ? labelData.valueText
            : labelData.lactateText;

          const accent =
            labelData.label === 'LT1'
              ? colorMap['LTP1'] || '#16a34a'
              : colorMap['LTP2'] || '#dc2626';

          ctx.font = fontPrimary;
          const w1 = ctx.measureText(line1).width;
          ctx.font = fontSecondary;
          const w2 = ctx.measureText(line2).width;
          const boxW = Math.ceil(Math.max(w1, w2) + padXBox * 2 + 4);
          const line1H = 13;
          const line2H = 12;
          const contentH =
            accentStripH + padYBox + line1H + lineGap + line2H + padYBox;

          const margin = 4;
          const gapFromLine = 10;
          let bx;
          if (isLt1) {
            bx = labelData.xPixel - gapFromLine - boxW;
          } else {
            bx = labelData.xPixel + gapFromLine;
          }
          bx = Math.max(
            chartArea.left + margin,
            Math.min(bx, chartArea.right - boxW - margin)
          );
          const by = boxTop;
          const lineX = labelData.xPixel;
          const r = 8;

          ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
          ctx.lineWidth = 1;

          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(bx, by, boxW, contentH, r);
          } else {
            const rr = r;
            ctx.moveTo(bx + rr, by);
            ctx.arcTo(bx + boxW, by, bx + boxW, by + contentH, rr);
            ctx.arcTo(bx + boxW, by + contentH, bx, by + contentH, rr);
            ctx.arcTo(bx, by + contentH, bx, by, rr);
            ctx.arcTo(bx, by, bx + boxW, by, rr);
            ctx.closePath();
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.stroke();

          ctx.fillStyle = accent;
          ctx.fillRect(bx + r * 0.35, by + 0.5, boxW - r * 0.7, accentStripH);

          const textX = isLt1 ? bx + boxW - padXBox : bx + padXBox;
          let ty = by + accentStripH + padYBox + line1H - 2;
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = isLt1 ? 'right' : 'left';
          ctx.font = fontPrimary;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillText(line1, textX, ty);
          ty += lineGap + line2H;
          ctx.font = fontSecondary;
          ctx.fillStyle = 'rgba(71, 85, 105, 0.95)';
          ctx.fillText(line2, textX, ty);

          // Boční šipka k svislé čáře: LT1 box vlevo → šipka z pravého okraje k čáře; LT2 box vpravo → z levého okraje k čáře
          const midY = by + contentH / 2;
          const halfBase = 6;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
          ctx.lineWidth = 1;
          if (isLt1) {
            const baseX = bx + boxW;
            const tipX = lineX - 3;
            if (tipX > baseX) {
              ctx.beginPath();
              ctx.moveTo(baseX, midY - halfBase);
              ctx.lineTo(baseX, midY + halfBase);
              ctx.lineTo(tipX, midY);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          } else {
            const baseX = bx;
            const tipX = lineX + 3;
            if (tipX < baseX) {
              ctx.beginPath();
              ctx.moveTo(baseX, midY - halfBase);
              ctx.lineTo(baseX, midY + halfBase);
              ctx.lineTo(tipX, midY);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
        };

        const boxTop = chartArea.top + topMargin;
        labels.forEach((labelData) => {
          drawTooltip(labelData, boxTop);
        });

        ctx.restore();
      }
    }
  },
};

ChartJS.register(lactateZoneLtpOverlayPlugin);

const LactateCurveCalculator = ({ mockData, demoMode = false }) => {
  const { user } = useAuth();
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const chartRef = useRef(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [showPdfPreview, setShowPdfPreview]   = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl]     = useState(null);
  // Lock body scroll while PDF preview modal is open
  useEffect(() => {
    if (showPdfPreview) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [showPdfPreview]);
  const [pdfCustomNote, setPdfCustomNote]     = useState('');
  // When set, replaces the auto-generated Analysis paragraph in the PDF.
  // Lets coaches rewrite the boilerplate sentence with their own commentary.
  const [pdfCustomAnalysis, setPdfCustomAnalysis] = useState('');
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [prevTestData, setPrevTestData] = useState(null);
  const [allPrevTests, setAllPrevTests] = useState([]);       // all previous same-sport tests (desc)
  const [selectedCompareIds, setSelectedCompareIds] = useState([]); // up to 2 test IDs for PDF comparison
  const [zoneOverride, setZoneOverride] = useState(null);
  // Manual LT1/LT2 threshold override
  const [ltOverrides, setLtOverrides] = useState({ LTP1: null, LTP2: null, LTP1_lactate: null, LTP2_lactate: null });
  const [ltEditValues, setLtEditValues] = useState({ LTP1: '', LTP2: '' }); // pace/watts raw strings
  const [ltEditLactates, setLtEditLactates] = useState({ LTP1: '', LTP2: '' }); // lactate mmol/L raw strings
  const [showLtOverridePanel, setShowLtOverridePanel] = useState(false);
  const [savingLtOverride, setSavingLtOverride] = useState(false);
  const [ltOverrideStatus, setLtOverrideStatus] = useState(null); // {type:'success'|'error', msg}
  const [showDataTable, setShowDataTable] = useState(window.innerWidth >= 768); // Hidden by default on mobile
  const [zonesVisible, setZonesVisible] = useState(true); // Toggle for showing/hiding zone colors
  const zonesVisibleRef = useRef(true); // Ref for plugin access
  const ltpLinesVisibleRef = useRef(true); // Ref for plugin access to ltpLinesVisible state
  const [chartView, setChartView] = useState('power'); // 'power' = power/pace vs lactate, 'hr' = heart rate vs lactate
  const chartViewRef = useRef(chartView);
  useEffect(() => {
    chartViewRef.current = chartView;
  }, [chartView]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Align with DataTable.calculateThresholds: API may send cycling|running|swimming
  const sportKey = (() => {
    const s = String(mockData?.sport || 'bike').toLowerCase().trim();
    if (s === 'cycling' || s === 'cycle' || s === 'bike') return 'bike';
    if (s === 'running' || s === 'run' || s.includes('run')) return 'run';
    if (s === 'swimming' || s === 'swim' || s.includes('swim')) return 'swim';
    return 'bike';
  })();
  const isRunning = sportKey === 'run';
  const isSwimming = sportKey === 'swim';
  const isPaceSport = isRunning || isSwimming;
  const trainingTitle = (mockData?.title || mockData?.name || '').toString().trim();
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Fetch athlete profile for PDF report
  useEffect(() => {
    const athleteId = mockData?.athleteId;
    if (!athleteId) {
      setAthleteProfile(user || null);
      return;
    }
    let cancelled = false;
    api.get(`/user/athlete/${athleteId}/profile`)
      .then(res => { if (!cancelled) setAthleteProfile(res.data); })
      .catch(() => { if (!cancelled) setAthleteProfile(user || null); });
    return () => { cancelled = true; };
  }, [mockData?.athleteId, user]);

  // Fetch all previous tests (same sport, before current) for PDF comparison selector
  useEffect(() => {
    const athleteId = mockData?.athleteId || user?._id || user?.id;
    const currentId   = mockData?._id;
    const currentDate = mockData?.date;
    const currentSport = mockData?.sport;
    if (!athleteId || !currentId || !currentDate) {
      setPrevTestData(null);
      setAllPrevTests([]);
      setSelectedCompareIds([]);
      return;
    }
    let cancelled = false;
    api.get(`/test/list/${athleteId}`)
      .then(res => {
        if (cancelled) return;
        const all = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.tests) ? res.data.tests : []);
        // Same sport, before current date, not the current test itself
        const sameSport = all.filter(t =>
          t._id !== currentId &&
          (!currentSport || t.sport === currentSport) &&
          new Date(t.date) < new Date(currentDate)
        );
        sameSport.sort((a, b) => new Date(b.date) - new Date(a.date));
        setAllPrevTests(sameSport);
        // Default: select the most recent test
        const defaultFirst = sameSport[0] || null;
        setPrevTestData(defaultFirst);
        setSelectedCompareIds(defaultFirst ? [defaultFirst._id] : []);
      })
      .catch(() => {
        if (!cancelled) {
          setPrevTestData(null);
          setAllPrevTests([]);
          setSelectedCompareIds([]);
        }
      });
    return () => { cancelled = true; };
  }, [mockData?._id, mockData?.athleteId, mockData?.date, mockData?.sport, user]);

  const serverOverrideLt1         = mockData?.thresholdOverrides?.LTP1         ?? null;
  const serverOverrideLt2         = mockData?.thresholdOverrides?.LTP2         ?? null;
  const serverOverrideLt1Lactate  = mockData?.thresholdOverrides?.LTP1_lactate ?? null;
  const serverOverrideLt2Lactate  = mockData?.thresholdOverrides?.LTP2_lactate ?? null;

  // Merge local threshold overrides into mockData so calculations pick them up
  const mockDataWithOverrides = React.useMemo(() => {
    if (!mockData) return mockData;
    if (!ltOverrides.LTP1 && !ltOverrides.LTP2) return mockData;
    return { ...mockData, thresholdOverrides: ltOverrides };
  }, [mockData, ltOverrides]);

  // Sync ltOverrides from server data when test/overrides change
  useEffect(() => {
    setLtOverrides({ LTP1: serverOverrideLt1, LTP2: serverOverrideLt2, LTP1_lactate: serverOverrideLt1Lactate, LTP2_lactate: serverOverrideLt2Lactate });
    setLtEditValues({
      LTP1: serverOverrideLt1 != null ? String(serverOverrideLt1) : '',
      LTP2: serverOverrideLt2 != null ? String(serverOverrideLt2) : '',
    });
    setLtEditLactates({
      LTP1: serverOverrideLt1Lactate != null ? String(serverOverrideLt1Lactate) : '',
      LTP2: serverOverrideLt2Lactate != null ? String(serverOverrideLt2Lactate) : '',
    });
  }, [mockData?._id, serverOverrideLt1, serverOverrideLt2, serverOverrideLt1Lactate, serverOverrideLt2Lactate]);

  // Get unit system and input mode from user profile, mockData, or default to metric/pace
  const unitSystem = resolveDistanceUnitSystem(user, mockData?.unitSystem || 'metric');
  /** How run pace was saved on this test (sec/mile vs sec/km) — independent of user display override. */
  const testRunPerMileStorage = testRunPaceStoredPerMile(mockData, sportKey);
  // Case + nesoulad metadat (speed) vs skutečná data v sekundách po přepnutí jiného testu
  const inputMode = getEffectiveLactateInputMode({ ...mockData, sport: sportKey });
  const rpeScale = mockData?.rpeScale || 'rpe'; // Default to RPE scale if not set

  // Popisek přepínače: bike = Power, běh/plavání podle inputMode (pace vs speed)
  const chartPrimaryIntensityLabel =
    sportKey === 'bike' ? 'Power' : inputMode === 'speed' ? 'Speed' : 'Pace';
  const chartPrimaryVsLactateLabel = `${chartPrimaryIntensityLabel} vs lactate`;
  
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

  // Auto thresholds WITHOUT any overrides — used in the panel to show "go back" values
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rawThresholds = React.useMemo(() => {
    try {
      return calculateThresholds({ ...mockData, thresholdOverrides: null });
    } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockData?._id, mockData?.results?.length]);

  const openEmailModal = () => {
    const mdWithOvr = (!ltOverrides.LTP1 && !ltOverrides.LTP2) ? mockData : { ...mockData, thresholdOverrides: ltOverrides };
    const zones = calculateZonesFromTest(mdWithOvr);
    const thr = calculateThresholds(mdWithOvr);
    const lt1La = Number(thr?.lactates?.['LTP1']);
    const lt2La = Number(thr?.lactates?.['LTP2']);
    const baseLa = Number(mockData?.baseLactate || 1.0);
    const safeLt1 = Number.isFinite(lt1La) ? lt1La : Math.max(baseLa + 0.8, 2.0);
    const safeLt2 = Number.isFinite(lt2La) ? lt2La : Math.max(safeLt1 + 1.2, 3.5);
    const lactateZones = {
      zone1: { min: Number(baseLa.toFixed(1)), max: Number(Math.max(baseLa + 0.2, safeLt1 * 0.9).toFixed(1)) },
      zone2: { min: Number((safeLt1 * 0.9).toFixed(1)), max: Number(safeLt1.toFixed(1)) },
      zone3: { min: Number(safeLt1.toFixed(1)), max: Number((safeLt2 * 0.95).toFixed(1)) },
      zone4: { min: Number((safeLt2 * 0.96).toFixed(1)), max: Number((safeLt2 * 1.04).toFixed(1)) },
      zone5: { min: Number((safeLt2 * 1.05).toFixed(1)), max: Number((safeLt2 * 1.20).toFixed(1)) }
    };
    const mergedZones = zones ? { ...zones, lactate: { ...lactateZones, ...(zones.lactate || {}) } } : { lactate: lactateZones };
    setZoneOverride(mergedZones);
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
      const overrides = {
        inputMode,
        unitSystem,
        ...(zoneOverride ? { zones: zoneOverride } : {})
      };
      await api.post(`/test/${testId}/send-report-email`, {
        toEmail: emailTo?.trim() ? emailTo.trim() : null,
        overrides
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

  // ── Save manual LT1/LT2 overrides to server ─────────────────────────────────
  // Parse pace (mm:ss → seconds) or watts
  const parseLtInput = (v) => {
    const s = String(v || '').trim();
    if (!s) return null;
    const mmssParts = s.match(/^(\d+):(\d{1,2})$/);
    if (mmssParts) return Number(mmssParts[1]) * 60 + Number(mmssParts[2]);
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const handleSaveLtOverrides = async () => {
    const testId = mockData?._id;
    if (!testId) return;
    const lt1 = parseLtInput(ltEditValues.LTP1);
    const lt2 = parseLtInput(ltEditValues.LTP2);
    const la1 = ltEditLactates.LTP1 !== '' ? Number(ltEditLactates.LTP1) || null : null;
    const la2 = ltEditLactates.LTP2 !== '' ? Number(ltEditLactates.LTP2) || null : null;
    const overrides = {
      LTP1: lt1, LTP2: lt2,
      LTP1_lactate: la1, LTP2_lactate: la2,
    };
    try {
      setSavingLtOverride(true);
      setLtOverrideStatus(null);
      await api.put(`/test/${testId}`, { thresholdOverrides: overrides });
      setLtOverrides(overrides);
      setLtOverrideStatus({ type: 'success', msg: 'Saved' });
      setTimeout(() => setLtOverrideStatus(null), 3000);
    } catch (e) {
      setLtOverrideStatus({ type: 'error', msg: e?.response?.data?.error || 'Save failed' });
    } finally {
      setSavingLtOverride(false);
    }
  };

  const handleClearLtOverrides = async () => {
    const testId = mockData?._id;
    if (!testId) return;
    try {
      setSavingLtOverride(true);
      await api.put(`/test/${testId}`, { thresholdOverrides: { LTP1: null, LTP2: null, LTP1_lactate: null, LTP2_lactate: null } });
      setLtOverrides({ LTP1: null, LTP2: null, LTP1_lactate: null, LTP2_lactate: null });
      setLtEditValues({ LTP1: '', LTP2: '' });
      setLtEditLactates({ LTP1: '', LTP2: '' });
      setLtOverrideStatus({ type: 'success', msg: 'Overrides cleared' });
      setTimeout(() => setLtOverrideStatus(null), 3000);
    } catch (e) {
      setLtOverrideStatus({ type: 'error', msg: 'Clear failed' });
    } finally {
      setSavingLtOverride(false);
    }
  };

  // Toggle a test ID in/out of selectedCompareIds (max 2)
  const toggleCompareId = (id) => {
    setSelectedCompareIds(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id);
        // Keep prevTestData in sync with first selection
        const primary = allPrevTests.find(t => t._id === next[0]) || null;
        setPrevTestData(primary);
        return next;
      }
      const next = prev.length >= 2 ? [prev[0], id] : [...prev, id];
      const primary = allPrevTests.find(t => t._id === next[0]) || null;
      setPrevTestData(primary);
      return next;
    });
  };

  // Build the shared PDF params object
  const buildPdfParams = (note = pdfCustomNote) => {
    const testForPdf = { ...mockData, inputMode, unitSystem };
    // Resolve the 1–2 selected comparison tests from allPrevTests
    const compTest1 = allPrevTests.find(t => t._id === selectedCompareIds[0]) ?? prevTestData ?? null;
    const compTest2 = allPrevTests.find(t => t._id === selectedCompareIds[1]) ?? null;
    return {
      test:            testForPdf,
      athlete:         athleteProfile,
      thresholds,
      zones:           zoneOverride || zones,
      prevTest:        compTest1,
      prevThresholds:  compTest1 ? calculateThresholds(compTest1) : null,
      prevTest2:       compTest2,
      prevThresholds2: compTest2 ? calculateThresholds(compTest2) : null,
      customNote:      note,
      customAnalysis:  pdfCustomAnalysis,
      creatorEmail:    user?.email || null,
    };
  };

  // Open preview modal — generates blob URL for iframe
  const handleDownloadPdf = async () => {
    if (!gate('PDF Report Export', 'pro')) return;
    if (!mockData) { setPdfStatus({ type: 'error', message: 'Missing test data.' }); return; }
    try {
      setPdfPreviewLoading(true);
      setPdfStatus(null);
      const blob = await generatePdfBlob(buildPdfParams());
      const url  = URL.createObjectURL(blob);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (e) {
      console.error('[handleDownloadPdf]', e);
      setPdfStatus({ type: 'error', message: e?.message || 'Failed to generate PDF.' });
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  // Regenerate preview after note / zone edits inside modal
  const handleRegeneratePdfPreview = async () => {
    try {
      setPdfPreviewLoading(true);
      const blob = await generatePdfBlob(buildPdfParams());
      const url  = URL.createObjectURL(blob);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
    } catch (e) {
      console.error('[handleRegeneratePdfPreview]', e);
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  // Final download from inside the modal
  const handleFinalDownload = async () => {
    try {
      setDownloadingPdf(true);
      await downloadLactateReportPdf(buildPdfParams());
      setPdfStatus({ type: 'success', message: 'PDF downloaded.' });
      setShowPdfPreview(false);
    } catch (e) {
      setPdfStatus({ type: 'error', message: e?.message || 'Failed to generate PDF.' });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // On iOS Capacitor, blob URLs can't open in a new tab — convert to base64 and embed
  const handleOpenInBrowser = async () => {
    if (!pdfPreviewUrl) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      try {
        const blob = await fetch(pdfPreviewUrl).then(r => r.blob());
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(
              `<html><head><title>Lactate Report</title></head>` +
              `<body style="margin:0;background:#000">` +
              `<embed src="${dataUrl}" type="application/pdf" width="100%" height="100%" />` +
              `</body></html>`
            );
          } else {
            window.location.href = dataUrl;
          }
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error('[LactateCurveCalculator] Failed to open PDF:', e);
      }
    } else {
      window.open(pdfPreviewUrl, '_blank', 'noopener');
    }
  };

  const thresholds = calculateThresholds(mockDataWithOverrides);
  if (isThresholdDebugEnabled()) {
    console.log('[LactateCurveCalculator] thresholds (tabulka + graf)', {
      LTP1_W: thresholds['LTP1'],
      LTP2_W: thresholds['LTP2'],
      LTP1_La: thresholds.lactates?.['LTP1'],
      LTP2_La: thresholds.lactates?.['LTP2'],
    });
  }
  const results = mockData.results;

  // Calculate training zones for visualization
  const zones = calculateZonesFromTest(mockDataWithOverrides);
  
  // Detect "short" stage cutoffs in BOTH duration (sec) and distance (m).
  // Sources, in priority order:
  //   1. Test-level `stageDurationSec` / `stageDistance` from the Protocol section
  //   2. Median of explicit per-row `duration` / `distanceMeters` values
  // Cutoff = 60 % of the reference. Rows shorter than cutoff are excluded from
  // the curve fit / LT1 / LT2 — same behaviour as recovery rows.
  //
  // CRITICAL fallback: if neither test-level setting nor per-row values are
  // present, both cutoffs stay at 0 and the row is ALWAYS kept. So tests
  // saved before this feature, or tests where the user simply didn't fill
  // in duration/distance, are not penalised in any way.
  // Only trust the median as a fallback reference when we have ≥3 explicit
  // values — fewer than that and a single short outlier (e.g. only the
  // truncated last interval has duration set) would erroneously become the
  // reference, with the cutoff sitting just below it and excluding nothing.
  const medianOf = (arr, minCount = 3) => {
    const vals = arr.filter(v => Number.isFinite(v) && v > 0);
    if (vals.length < minCount) return 0;
    const s = [...vals].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const testStageSec  = Number(mockData?.stageDurationSec);
  const testStageDist = Number(mockData?.stageDistance);
  const refDuration   = Number.isFinite(testStageSec) && testStageSec > 0
    ? testStageSec
    : medianOf(results.map(r => Number(r?.duration)));
  const refDistance   = Number.isFinite(testStageDist) && testStageDist > 0
    ? testStageDist
    : medianOf(results.map(r => Number(r?.distanceMeters)));
  const shortStageCutoffSec  = refDuration > 0 ? refDuration * 0.6 : 0;
  const shortStageCutoffDist = refDistance > 0 ? refDistance * 0.6 : 0;

  // First, filter out only truly invalid results (empty, missing, zero values)
  // Keep all valid numeric values for display, even if they might be filtered later for calculations.
  // Rows the user marked as `intervalType === 'recovery'` are post-test samples
  // (e.g. a low-intensity cool-down measurement) — they're saved on the test
  // but must NOT feed the curve fit or LT1/LT2 calc, otherwise the polynomial
  // gets distorted and the X axis shows a duplicate low-power point.
  const allResultsForDisplay = results.filter(r => {
    if (!r) return false;
    if (r.intervalType === 'recovery') return false;
    // Stages markedly shorter than the protocol's typical stage haven't
    // reached the same steady-state lactate — exclude. We check duration
    // AND distance independently because a swim might log only distance.
    // When the row's value is not set OR no reference exists, this is a
    // no-op (the row is kept).
    const rowDur = Number(r.duration);
    if (Number.isFinite(rowDur) && rowDur > 0 && shortStageCutoffSec > 0 && rowDur < shortStageCutoffSec) {
      return false;
    }
    const rowDist = Number(r.distanceMeters);
    if (Number.isFinite(rowDist) && rowDist > 0 && shortStageCutoffDist > 0 && rowDist < shortStageCutoffDist) {
      return false;
    }
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
    return convertPaceToSpeed(v, unitSystem, isSwimming); // speed mode
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
        
        const slowestSpeed = convertPaceToSpeed(slowestPace, unitSystem, isSwimming); // Convert to km/h
        const fastestSpeed = convertPaceToSpeed(fastestPace, unitSystem, isSwimming); // Convert to km/h
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
      ? (inputMode === 'pace' ? xRaw : convertPaceToSpeed(xRaw, unitSystem, isSwimming))
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
  // Use filtered validResults for polynomial regression (excludes unrealistic spikes).
  // If regression fails (e.g. singular matrix with few/collinear points), use [] so chart still renders.
  let polyPointsRaw = [];
  try {
    polyPointsRaw = calculatePolynomialRegression(validResults) || [];
  } catch (e) {
    console.warn('[LactateCurveCalculator] Polynomial regression failed:', e?.message);
  }
  
  // Convert polyPoints to the correct coordinate system (pace/speed/power based on inputMode)
  // Also ensure lactate values are never negative
  const polyPoints = polyPointsRaw.map(point => {
    const y = Math.max(0, point.y); // Ensure lactate is never negative
    if (isPaceSport && inputMode === 'speed') {
      // Convert from pace (seconds) to speed (km/h or mph)
      const speed = convertPaceToSpeed(point.x, unitSystem, isSwimming);
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
        ? (inputMode === 'pace' ? xRaw : convertPaceToSpeed(xRaw, unitSystem, isSwimming))
        : xRaw;
      
      // Keep all measured points visible in chart; only reject non-finite X.
      if (!Number.isFinite(x)) {
        console.warn('[LactateCurveCalculator] Filtering out non-finite x value for measured point');
          return null;
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
    hitRadius: isMobile ? 20 : 10, // Larger hit radius on mobile
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
          return convertPaceToSpeed(interpolatedX, unitSystem, isSwimming);
        }
        return interpolatedX;
      }
    }
    
    // Convert to display units
    if (isPaceSport && inputMode === 'speed') {
      return convertPaceToSpeed(closestPoint.x, unitSystem, isSwimming);
    }
    return closestPoint.x;
  };

  const thresholdDatasets = Object.keys(thresholds)
    .filter(key => !['heartRates', 'lactates', 'LTRatio', 'testAnalysis'].includes(key)) // LTRatio je poměr, ne hodnota power/pace, takže ho nezobrazovat v grafu
    .map(key => {
      const yValue = thresholds.lactates[key];
      
      // Pokud jsou hodnoty nevalidní (NaN, null, undefined), přeskočit tento threshold
      if (yValue == null || isNaN(yValue)) {
        return null;
      }
      
      // Find X value from the displayed curve (polyPointsRaw) for this lactate value
      let xValueFromCurve = findXFromCurve(yValue, polyPointsRaw);
      
      // Kolo: LTP1 i LTP2 — X z calculateThresholds (naměřené body / segmentace), ne průsečík s polynomem.
      // Běh/plavání: LTP1 z thresholds (tempo); ostatní klíče často z křivky.
      let xValue;
      if (!isPaceSport && (key === 'LTP1' || key === 'LTP2') && thresholds[key] != null && Number.isFinite(Number(thresholds[key]))) {
        xValue = Number(thresholds[key]);
      } else if (isPaceSport && key === 'LTP1' && thresholds[key] != null && Number.isFinite(Number(thresholds[key]))) {
        xValue = inputMode === 'pace'
          ? Number(thresholds[key])
          : convertPaceToSpeed(Number(thresholds[key]), unitSystem, isSwimming);
      } else {
        xValue = xValueFromCurve != null
          ? xValueFromCurve
          : (isPaceSport
              ? (inputMode === 'pace' ? thresholds[key] : convertPaceToSpeed(thresholds[key], unitSystem, isSwimming))
              : thresholds[key]);
      }
      
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
        originalPace: isPaceSport
          ? (key === 'LTP1' && Number.isFinite(Number(thresholds[key]))
              ? Number(thresholds[key])
              : (xValueFromCurve != null ? null : thresholds[key]))
          : null
      }],
      borderColor: colorMap[key] || '#2196F3',
      backgroundColor: colorMap[key] || '#2196F3',
      pointRadius: isLTP1 || isLTP2 ? 10 : 6, // Larger points for LTP1 and LTP2
      pointBorderWidth: isLTP1 || isLTP2 ? 3 : 2, // Thicker border for LTP1 and LTP2
      hitRadius: isMobile ? 25 : 12, // Larger hit radius on mobile, especially for threshold points
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
      .flatMap(ds => ds.data.map(d => d.x)),
  ].filter(x => !isNaN(x) && isFinite(x));
  
  const minXForZones = allXValuesForZones.length > 0 ? Math.min(...allXValuesForZones) : 0;
  const maxXForZones = allXValuesForZones.length > 0 ? Math.max(...allXValuesForZones) : 100;

  // ~10 % „pomaleji“ od baseline / nejpomalejšího bodu — jen kousíček osy a Z1, ne celá vypočtená recovery zóna
  const Z1_SLOW_NUDGE_RATIO = 0.1;
  const slowNibbleX = (() => {
    if (!zones || !thresholds['LTP1'] || !thresholds['LTP2']) return null;
    if (allXValuesForZones.length === 0) return null;
    const dMin = minXForZones;
    const dMax = maxXForZones;
    const b = baseLactatePoint && isFinite(baseLactatePoint.x) ? baseLactatePoint.x : null;
    let refSlow;
    if (isPaceSport && inputMode === 'pace') {
      refSlow = b != null ? Math.max(b, dMax) : dMax;
    } else {
      refSlow = b != null ? Math.min(b, dMin) : dMin;
    }
    if (!isFinite(refSlow)) return null;
    if (isPaceSport && inputMode === 'pace') {
      return refSlow / (1 - Z1_SLOW_NUDGE_RATIO);
    }
    return refSlow * (1 - Z1_SLOW_NUDGE_RATIO);
  })();

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
            minPace = convertPaceToSpeed(minPaceSeconds, unitSystem, isSwimming); // Slower pace (higher seconds) = lower speed
            maxPace = convertPaceToSpeed(maxPaceSeconds, unitSystem, isSwimming); // Faster pace (lower seconds) = higher speed
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
              zoneMinX = maxXForZones;
            } else {
              // Other zones start where previous zone ended
              zoneMinX = previousBoundary !== null ? previousBoundary : minPace;
            }
            // Zone ends at maxPace (going from slow to fast: minPace -> maxPace)
            zoneMaxX = zoneKey === 'zone5' ? minXForZones : maxPace;
            previousBoundary = zoneMaxX;
          } else {
            // Normal axis (speed mode): Zone 1 (slowest) starts from left side (minX), Zone 5 (fastest) ends at right side (maxX)
            // minPace = lower speed (slower), maxPace = higher speed (faster)
            if (zoneKey === 'zone1') {
              zoneMinX = minXForZones;
            } else {
              // Other zones start where previous zone ended
              zoneMinX = previousBoundary !== null ? previousBoundary : minPace;
            }
            // Zone ends at maxPace (faster speed, higher value, right side)
            zoneMaxX = zoneKey === 'zone5' ? maxXForZones : maxPace;
            previousBoundary = zoneMaxX;
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
            ? minXForZones
            : (previousMax !== null ? previousMax : zone.min);
          const actualMaxX = zoneKey === 'zone5' ? maxXForZones : zone.max;
          
          previousMax = actualMaxX;
          
          // Store zone boundaries for plugin rendering
          zoneDatasets.push({
            label: zoneNames[zoneKey],
            data: [
              { x: actualMinX, y: 0 },
              { x: actualMaxX, y: 0 },
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
            maxX: actualMaxX,
          });
        });
      }
    }
    
    return zoneDatasets;
  })();

  // Create VO2 dataset if there's VO2 data
  const vo2DataPoints = allMeasuredDataPoints
    .filter(p => p.vo2 !== null && p.vo2 !== undefined && !isNaN(p.vo2) && p.vo2 > 0)
    .map(p => ({ x: p.x, y: p.vo2 }));
  
  // Create function to get legend items with dynamic VO2 only
  const getLegendItems = () => {
    return [
      ...baseLegendItems,
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
    hitRadius: isMobile ? 20 : 10, // Larger hit radius on mobile
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
    ...(vo2DataSet ? [vo2DataSet] : []),
  ];

  // X axis: values from data only (Z1 recovery edge is applied below without inflating padding)
  const allXValues = [
    ...xVals,
    ...(baseLactatePoint ? [baseLactatePoint.x] : []),
    ...(polyPoints.length > 0 ? polyPoints.map(p => p.x) : []),
    ...thresholdDatasets
      .filter(ds => ds !== null)
      .flatMap(ds => ds.data.map(d => d.x)),
  ].filter(x => !isNaN(x) && isFinite(x));

  // Pace + reverse: zahrnout „rychlý“ okraj Z5, ať není úzký pruh a osa sahá až k modelové hranici
  if (isPaceSport && inputMode === 'pace' && isReverse && zones?.pace?.zone5?.max) {
    const raw = zones.pace.zone5.max;
    let z5fast =
      typeof raw === 'string' && raw.includes(':')
        ? (() => {
            const p = raw.split(':');
            if (p.length === 2) {
              return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
            }
            return parseFloat(raw);
          })()
        : raw;
    if (typeof z5fast === 'number' && !isNaN(z5fast) && isFinite(z5fast)) {
      allXValues.push(z5fast);
    }
  }
  
  if (allXValues.length === 0) {
    console.warn('[LactateCurveCalculator] No valid X values for axis');
    return null;
  }
  
  const dataMinX = Math.min(...allXValues);
  const dataMaxX = Math.max(...allXValues);
  const dataXRange = Math.max(dataMaxX - dataMinX, 1e-9);
  // Malý okraj jen u „rychlé“ strany dat (bez velké bílé díry / přetékání)
  const padOuter = Math.max(dataXRange * 0.02, 1e-6);
  const z1ZoneForAxis = zoneDatasets.find(d => d.zoneKey === 'zone1');
  const z1SlowExtent = z1ZoneForAxis ? z1ZoneForAxis.minX : slowNibbleX;

  let xScaleMin;
  let xScaleMax;
  if (isReverse) {
    // Pace (s): vyšší = pomalejší (levá strana grafu). Rychlá strana = min hodnota.
    xScaleMin = Math.max(dataMinX - padOuter, 0);
    const extendSlow = z1SlowExtent != null && z1SlowExtent > dataMaxX;
    const slowBound = extendSlow ? z1SlowExtent : dataMaxX;
    // Stejný datový okraj na pomalé straně jako na rychlé (dřív se při extendSlow vynechával vlevo)
    xScaleMax = slowBound + padOuter;
  } else {
    // Speed / power: pomalejší = menší X vlevo
    const extendSlow = z1SlowExtent != null && z1SlowExtent < dataMinX;
    const slowBound = extendSlow ? z1SlowExtent : dataMinX;
    xScaleMin = Math.max(slowBound - padOuter, 0);
    xScaleMax = dataMaxX + padOuter;
  }

  // Zone 5 fill should match the visible X-axis (incl. padding), not only raw data min/max
  zoneDatasets.forEach((ds) => {
    if (ds.zoneKey !== 'zone5') return;
    if (isReverse) {
      ds.maxX = xScaleMin;
      if (ds.data?.[1]) ds.data[1].x = xScaleMin;
    } else {
      ds.maxX = xScaleMax;
      if (ds.data?.[1]) ds.data[1].x = xScaleMax;
    }
  });

  const xAxisDisplayRange = Math.max(xScaleMax - xScaleMin, 1e-9);

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
          minValue = convertPaceToSpeed(minPaceSeconds, unitSystem, isSwimming); // Slower pace (higher seconds) -> lower speed
          maxValue = convertPaceToSpeed(maxPaceSeconds, unitSystem, isSwimming); // Faster pace (lower seconds) -> higher speed
          
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

  const formatZoneBoundaryPace = (v) =>
    typeof v === 'string'
      ? v
      : formatSecondsToMMSS(
          paceSecondsToDisplaySeconds(v, { isSwimming, unitSystem, testRunPerMileStorage })
        );

  const lactateZoneLtpOverlayOpts = {
    zonesVisibleRef,
    ltpLinesVisibleRef,
    chartView,
    chartViewRef,
    sportKey,
    isPaceSport,
    inputMode,
    isSwimming,
    unitSystem,
    testRunPerMileStorage,
    isMobile,
  };
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        left: 8,
        right: 8,
        top: 4,
        bottom: 4,
      },
    },
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
        min: xScaleMin,
        max: xScaleMax,
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
            const range = xAxisDisplayRange;
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
            // Štítek „Base Lactate“ jen když nejsou zobrazené zóny — se Z1 na grafu je to zbytečné
            if (
              baseLactatePoint &&
              Math.abs(value - baseLactatePoint.x) < 0.01 &&
              !zonesVisible
            ) {
              return 'Base Lactate';
            }
            if (isPaceSport) {
              if (inputMode === 'pace') {
                // value is already pace seconds - round to whole seconds for cleaner display
                const displaySec = paceSecondsToDisplaySeconds(value, {
                  isSwimming,
                  unitSystem,
                  testRunPerMileStorage,
                });
                const totalSeconds = Math.round(displaySec);
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
      lactateZoneLtpOverlay: lactateZoneLtpOverlayOpts,
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
                  const minPace = formatZoneBoundaryPace(zone.power.min);
                  const maxPace = formatZoneBoundaryPace(zone.power.max);
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
            const useSpeed = isPaceSport && inputMode === 'speed';
            if (!isPaceSport) {
              formattedValue = `${Math.round(xVal)}W`;
            } else if (useSpeed) {
              const unit = unitSystem === 'imperial' ? ' mph' : ' km/h';
              formattedValue = `${Number(xVal).toFixed(1)}${unit}`;
            } else if (isPaceSport) {
                const displaySec = paceSecondsToDisplaySeconds(xVal, {
                  isSwimming,
                  unitSystem,
                  testRunPerMileStorage,
                });
                const paceStr = formatSecondsToMMSS(displaySec);
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
                        ? `Pace: ${formatZoneBoundaryPace(zone.power.min)} - ${formatZoneBoundaryPace(zone.power.max)}`
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
        hitRadius: isMobile ? 20 : 10, // Larger hit radius on mobile
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
        hitRadius: isMobile ? 20 : 10, // Larger hit radius on mobile
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
        hitRadius: isMobile ? 25 : 15 // Larger hit radius on mobile for line hovering
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
        hitRadius: isMobile ? 25 : 12, // Larger hit radius on mobile
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
        left: 8,
        right: 8,
        top: 4,
        bottom: 4,
      },
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
      lactateZoneLtpOverlay: lactateZoneLtpOverlayOpts,
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
      point: { radius: 5, hoverRadius: 8, hitRadius: isMobile ? 20 : 10 },
      line: {
        borderWidth: 2,
        tension: 0.4,
        hitRadius: isMobile ? 25 : 15 // Larger hit radius on mobile for line hovering
      }
    },
  };

  const finalData = chartView === 'hr' && hasEnoughHRData ? hrChartData : data;
  const finalOptions = chartView === 'hr' && hasEnoughHRData ? hrChartOptions : options;
  const showHRViewPlaceholder = chartView === 'hr' && !hasEnoughHRData;

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 bg-white rounded-2xl shadow-lg mt-3 sm:mt-5 relative">
      <UpgradeModal {...UpgradeModalProps} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* Left: title + chart-type toggle + icon buttons */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-xl font-bold truncate">
              Lactate Curve
              {trainingTitle && (
                <span className="text-sm sm:text-lg text-gray-800 ml-1 sm:ml-2">
                  {trainingTitle}
                </span>
              )}
              <span className="text-sm sm:text-lg text-gray-600 ml-1 sm:ml-2">({formatDate(mockData.date)})</span>
            </h2>
            <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="group">
              <button
                type="button"
                onClick={() => setChartView('power')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors touch-manipulation ${
                  chartView === 'power' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title={chartPrimaryVsLactateLabel}
              >
                {chartPrimaryVsLactateLabel}
              </button>
              <button
                type="button"
                onClick={() => setChartView('hr')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors touch-manipulation ${
                  chartView === 'hr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Heart rate vs lactate"
              >
                HR vs La
              </button>
            </div>
            <button
              onClick={() => setShowGlossary(true)}
              className="h-9 w-9 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
              aria-label="Show glossary"
              title="Training Glossary"
            >
              <InformationCircleIcon className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => setShowDataTable(!showDataTable)}
              className="h-9 w-9 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
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

          {/* Right: Base Lactate + Set LT1/LT2 + Email + PDF — all in one compact row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Base Lactate */}
            <div className="flex items-center gap-1.5">
              <p className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                Base Lactate:{' '}
                <span className={`font-medium ${(!mockData.baseLactate || mockData.baseLactate === 0) ? 'text-red-500' : 'text-blue-500'}`}>
                  {mockData.baseLactate || 0} mmol/L
                </span>
              </p>
              {(!mockData.baseLactate || mockData.baseLactate === 0) && (
                <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded font-semibold whitespace-nowrap">
                  ⚠️ Missing
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-gray-200 hidden sm:block" />

            {/* Set LT1/LT2 */}
            {!demoMode && (
              <button
                onClick={() => setShowLtOverridePanel(v => !v)}
                className={`h-9 px-3 text-xs rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  (ltOverrides.LTP1 || ltOverrides.LTP2)
                    ? 'bg-violet-50 border-violet-300 text-violet-800 font-semibold'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                title="Manually pin LT1/LT2 threshold values"
              >
                <PencilSquareIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{(ltOverrides.LTP1 || ltOverrides.LTP2) ? 'LT1/LT2 overridden' : 'Set LT1/LT2'}</span>
              </button>
            )}

            {/* Email + PDF */}
            {!demoMode && (
              <div data-tour="tour-lactate-share" className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => {
                      if (!isPremium) { gate('Email Report Export', 'pro'); return; }
                      openEmailModal();
                    }}
                    disabled={sendingEmail}
                    className={`h-9 px-3 text-xs rounded-lg border transition-colors touch-manipulation whitespace-nowrap flex items-center gap-1.5 ${
                      sendingEmail
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 border-gray-200'
                    } ${!isPremium ? 'opacity-60' : ''}`}
                    title="Send report to email"
                  >
                    <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{sendingEmail ? 'Sending…' : 'Email'}</span>
                  </button>
                  {emailStatus?.message && (
                    <div className={`text-xs ${emailStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {emailStatus.message}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={pdfPreviewLoading || downloadingPdf}
                    className={`h-9 px-3 text-xs rounded-lg border transition-colors touch-manipulation whitespace-nowrap flex items-center gap-1.5 ${
                      (pdfPreviewLoading || downloadingPdf)
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 border-gray-200'
                    }`}
                    title="Preview and download full report as PDF"
                  >
                    <DocumentArrowDownIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{pdfPreviewLoading ? 'Preparing…' : 'PDF'}</span>
                  </button>
                  {pdfStatus?.message && (
                    <div className={`text-xs ${pdfStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {pdfStatus.message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LT1/LT2 manual override panel */}
        {showLtOverridePanel && !demoMode && (() => {
          // ── Curve-lookup helpers (closures over polyPointsRaw / hrPolyPoints) ──
          const interpY = (x, pts) => {
            if (!pts || pts.length < 2) return null;
            const s = [...pts].sort((a, b) => a.x - b.x);
            if (x <= s[0].x) return s[0].y;
            if (x >= s[s.length - 1].x) return s[s.length - 1].y;
            for (let i = 0; i < s.length - 1; i++) {
              if (x >= s[i].x && x <= s[i + 1].x) {
                const t = (x - s[i].x) / (s[i + 1].x - s[i].x);
                return s[i].y + t * (s[i + 1].y - s[i].y);
              }
            }
            return null;
          };

          // Given user's typed input → internal units → look up lactate on the poly curve
          const lookupLactate = (rawInput) => {
            const x = parseLtInput(rawInput);
            if (x == null) return null;
            const la = interpY(x, polyPointsRaw);
            return la != null ? Math.max(0, la) : null;
          };

          // Given a lactate value → look up HR on the HR poly curve (x=lactate, y=HR)
          const lookupHR = (lactate) => {
            if (lactate == null || !hrPolyPoints || hrPolyPoints.length < 2) return null;
            return interpY(lactate, hrPolyPoints);
          };

          // Effective lactate for each key: prefer manual edit, else curve lookup
          const effectiveLactate = (key) => {
            const manual = ltEditLactates[key] !== '' ? Number(ltEditLactates[key]) : null;
            if (manual != null && Number.isFinite(manual)) return manual;
            return lookupLactate(ltEditValues[key]);
          };

          return (
            <div className="mx-0 mb-3 p-3 rounded-xl border border-violet-200 bg-violet-50 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-violet-900">Manual threshold override</p>
                <p className="text-xs text-violet-500">{isPaceSport ? 'Pace mm:ss · lactate mmol/L' : 'Watts · lactate mmol/L'}</p>
              </div>

              {/* Auto reference row — clickable to restore auto values */}
              <div className="flex gap-3 text-xs">
                {[
                  { key: 'LTP1', label: 'Auto LT1', accent: 'green' },
                  { key: 'LTP2', label: 'Auto LT2', accent: 'red' },
                ].map(({ key, label, accent }) => {
                  const autoX = rawThresholds?.[key] ?? thresholds[key];
                  const autoLa = rawThresholds?.lactates?.[key];
                  const autoHR = rawThresholds?.heartRates?.[key];
                  const autoXStr = autoX != null
                    ? (isPaceSport && inputMode === 'pace'
                        ? formatSecondsToMMSS(paceSecondsToDisplaySeconds(autoX, { isSwimming, unitSystem, testRunPerMileStorage }))
                        : `${Math.round(autoX)} W`)
                    : null;
                  const isActive = ltOverrides[key] != null;
                  const borderC = accent === 'green' ? 'border-green-200 hover:border-green-400' : 'border-red-200 hover:border-red-400';
                  const textC = accent === 'green' ? 'text-green-700' : 'text-red-700';
                  return (
                    <button
                      key={key}
                      type="button"
                      title="Click to use this auto value"
                      onClick={() => {
                        if (autoX == null) return;
                        const displayStr = autoXStr;
                        setLtEditValues(prev => ({ ...prev, [key]: isPaceSport && inputMode === 'pace' ? displayStr : String(Math.round(autoX)) }));
                        setLtEditLactates(prev => ({ ...prev, [key]: autoLa != null ? autoLa.toFixed(2) : '' }));
                      }}
                      className={`flex-1 text-left px-2 py-1.5 rounded-lg border bg-white transition-colors ${isActive ? 'opacity-60' : ''} ${borderC}`}
                    >
                      <div className={`font-semibold mb-0.5 ${textC}`}>{label}</div>
                      <div className="text-violet-700">
                        {autoXStr ?? '—'}
                        {autoLa != null ? <span className="text-violet-500"> · {autoLa.toFixed(2)} mmol/L</span> : ''}
                        {autoHR != null ? <span className="text-violet-400"> · {Math.round(autoHR)} bpm</span> : ''}
                      </div>
                      <div className="text-[9px] text-violet-400 mt-0.5">click to use</div>
                    </button>
                  );
                })}
              </div>

              {/* Input columns */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'LTP1', label: 'LT1 (Aerobic)', accent: 'green' },
                  { key: 'LTP2', label: 'LT2 (Anaerobic)', accent: 'red' },
                ].map(({ key, label, accent }) => {
                  const la = effectiveLactate(key);
                  const hr = lookupHR(la);
                  const textAccent = accent === 'green' ? 'text-green-700' : 'text-red-700';
                  const borderAccent = accent === 'green' ? 'border-green-300 focus:ring-green-400' : 'border-red-300 focus:ring-red-400';

                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <span className={`text-xs font-semibold ${textAccent}`}>{label}</span>

                      {/* Pace / Watts */}
                      <div>
                        <label className="text-[10px] text-violet-600 font-medium uppercase tracking-wide mb-0.5 block">
                          {isPaceSport ? 'Pace' : 'Power (W)'}
                        </label>
                        <input
                          type="text"
                          value={ltEditValues[key]}
                          onChange={e => {
                            const v = e.target.value;
                            setLtEditValues(prev => ({ ...prev, [key]: v }));
                            // Auto-populate lactate from curve when user types a valid pace/watts
                            const la = lookupLactate(v);
                            if (la != null) {
                              setLtEditLactates(prev => ({ ...prev, [key]: la.toFixed(2) }));
                            } else if (!v.trim()) {
                              setLtEditLactates(prev => ({ ...prev, [key]: '' }));
                            }
                          }}
                          placeholder={isPaceSport ? 'e.g. 4:15' : 'e.g. 280'}
                          className={`w-full px-2 py-1.5 text-sm border ${borderAccent} rounded-lg bg-white focus:outline-none focus:ring-2`}
                        />
                      </div>

                      {/* Lactate — editable, auto-filled from curve */}
                      <div>
                        <label className="text-[10px] text-violet-600 font-medium uppercase tracking-wide mb-0.5 block">
                          Lactate (mmol/L)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ltEditLactates[key]}
                          onChange={e => setLtEditLactates(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder="auto"
                          className="w-full px-2 py-1.5 text-sm border border-violet-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>

                      {/* HR — read-only, derived from lactate via HR curve */}
                      {hr != null && (
                        <div className="flex items-center gap-1.5 text-xs text-violet-700">
                          <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                          </svg>
                          <span className="font-semibold">{Math.round(hr)} bpm</span>
                          <span className="text-violet-400">from curve</span>
                        </div>
                      )}

                      {/* Pinned badge */}
                      {ltOverrides[key] != null && (
                        <span className="text-[10px] text-violet-600 bg-violet-100 rounded px-1.5 py-0.5 self-start">
                          Pinned: {isPaceSport && inputMode === 'pace'
                            ? formatSecondsToMMSS(paceSecondsToDisplaySeconds(ltOverrides[key], { isSwimming, unitSystem, testRunPerMileStorage }))
                            : `${Math.round(ltOverrides[key])} W`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleSaveLtOverrides}
                  disabled={savingLtOverride}
                  className="px-3 py-1.5 text-xs font-semibold bg-violet-700 text-white rounded-lg hover:bg-violet-800 disabled:opacity-50 transition-colors"
                >
                  {savingLtOverride ? 'Saving…' : 'Save & apply'}
                </button>
                {(ltOverrides.LTP1 != null || ltOverrides.LTP2 != null) && (
                  <button
                    onClick={handleClearLtOverrides}
                    disabled={savingLtOverride}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 disabled:opacity-50 transition-colors"
                  >
                    Reset to auto
                  </button>
                )}
                {ltOverrideStatus && (
                  <span className={`text-xs font-medium ${ltOverrideStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {ltOverrideStatus.msg}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-violet-500 leading-relaxed">
                Lactate is auto-filled from the curve — you can override it manually. HR is always derived from the curve.
              </p>
            </div>
          );
        })()}
        
        <div className="flex flex-col lg:flex-row gap-4">
          <div
            className={showDataTable ? "flex-1 min-w-0" : "w-full"}
            style={{
              height: isMobile ? 'clamp(320px, 68vw, 460px)' : 'clamp(260px, 40vw, 400px)',
              minHeight: isMobile ? '300px' : '220px',
            }}
          >
            {showHRViewPlaceholder ? (
              <div className="h-full flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center p-6">
                <div>
                  <p className="text-gray-600 font-medium">No heart rate data for this test</p>
                  <p className="text-sm text-gray-500 mt-1">Add heart rate (bpm) to at least 2 steps to see Heart rate vs lactate.</p>
                </div>
              </div>
            ) : (
            <Line 
              key={`${mockData?._id || 'test'}-${sportKey}-${inputMode}`}
              ref={chartRef} 
              data={finalData} 
              options={finalOptions}
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
                <DataTable mockData={mockDataWithOverrides} />
                {Number.isFinite(thresholds?.confidence) && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 bg-white/60 text-xs text-gray-600">
                    <span className="font-medium text-gray-700">Threshold confidence:</span>
                    <span
                      className="relative group inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 cursor-help text-[10px] font-bold flex-shrink-0"
                      tabIndex={0}
                    >
                      ?
                      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-xl bg-gray-900 px-3 py-2 text-white text-[11px] leading-snug opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-xl">
                        Score 0–100 reflecting the quality of lactate data. Based on number of data points, consistency of the lactate curve, and how clearly the inflection points are defined. Higher = more reliable thresholds.
                        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                      </span>
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          thresholds.confidence >= 65 ? 'bg-emerald-500' :
                          thresholds.confidence >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                        }`}
                        style={{ width: `${thresholds.confidence}%` }}
                      />
                    </div>
                    <span className={`font-semibold tabular-nums ${
                      thresholds.confidence >= 65 ? 'text-emerald-700' :
                      thresholds.confidence >= 40 ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {thresholds.confidence}
                    </span>
                    <span className="text-gray-400">/100</span>
                  </div>
                )}
              </div>
            </>
          )}
          {thresholds?.testAnalysis && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 sm:p-4 text-sm space-y-3">
              <div className="font-semibold text-indigo-900 text-base">Test quality &amp; protocol analysis</div>
              <p className="text-xs text-indigo-800/90">
                Heuristic model (breakpoint + baseline rules). Shown alongside classic LTP1/LTP2 in the table — use both for context.
              </p>
              <div className="flex flex-wrap gap-2">
                {thresholds.testAnalysis.flags?.highBaselineLactate && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-xs font-medium">High baseline La</span>
                )}
                {thresholds.testAnalysis.flags?.sharpRise && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 text-xs font-medium">Sharp lactate rise</span>
                )}
                {thresholds.testAnalysis.flags?.poorLt1Detectability && (
                  <span className="px-2 py-0.5 rounded-md bg-gray-200 text-gray-800 text-xs font-medium">Low LT1 detectability</span>
                )}
                {!thresholds.testAnalysis.loadMonotonicOk && (
                  <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-900 text-xs font-medium">Non-monotonic load</span>
                )}
                {!thresholds.testAnalysis.hrMonotonicOk && (
                  <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 text-xs font-medium">HR not steadily rising</span>
                )}
              </div>
              <div className="text-xs text-gray-700 space-y-1">
                <div>
                  Baseline (analysis): <span className="font-medium">{Number(thresholds.testAnalysis.baselineLactate).toFixed(2)}</span> mmol/L
                  {thresholds.testAnalysis.baselineLevel && (
                    <span className="text-gray-500"> — {thresholds.testAnalysis.baselineLevel}</span>
                  )}
                </div>
                {thresholds.testAnalysis.lt1 && (
                  <div>
                    LT1 (analysis):{' '}
                    <span className="font-medium">
                      {isPaceSport && inputMode === 'pace'
                        ? formatSecondsToMMSS(
                            paceSecondsToDisplaySeconds(thresholds.testAnalysis.lt1.power, {
                              isSwimming,
                              unitSystem,
                              testRunPerMileStorage,
                            })
                          )
                        : isPaceSport && inputMode === 'speed'
                          ? `${Number(thresholds.testAnalysis.lt1.power).toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`
                          : `${Math.round(thresholds.testAnalysis.lt1.power)} W`}
                    </span>
                    {thresholds.testAnalysis.lt1.hr != null && (
                      <span className="text-gray-600"> · HR {Math.round(thresholds.testAnalysis.lt1.hr)} · La {Number(thresholds.testAnalysis.lt1.lactate).toFixed(2)}</span>
                    )}
                    <span className={` ml-1 text-xs font-semibold ${
                      thresholds.testAnalysis.lt1.confidence === 'high' ? 'text-emerald-700' :
                      thresholds.testAnalysis.lt1.confidence === 'medium' ? 'text-amber-700' : 'text-red-700'
                    }`}>
                      ({thresholds.testAnalysis.lt1.confidence})
                    </span>
                  </div>
                )}
                {thresholds.testAnalysis.lt2 && (
                  <div>
                    LT2 (analysis @ 4.0 mmol):{' '}
                    <span className="font-medium">
                      {isPaceSport && inputMode === 'pace'
                        ? formatSecondsToMMSS(
                            paceSecondsToDisplaySeconds(thresholds.testAnalysis.lt2.power, {
                              isSwimming,
                              unitSystem,
                              testRunPerMileStorage,
                            })
                          )
                        : isPaceSport && inputMode === 'speed'
                          ? `${Number(thresholds.testAnalysis.lt2.power).toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`
                          : `${Math.round(thresholds.testAnalysis.lt2.power)} W`}
                    </span>
                    {thresholds.testAnalysis.lt2.hr != null && (
                      <span className="text-gray-600"> · HR {Math.round(thresholds.testAnalysis.lt2.hr)}</span>
                    )}
                    <span className={` ml-1 text-xs font-semibold ${
                      thresholds.testAnalysis.lt2.confidence === 'high' ? 'text-emerald-700' :
                      thresholds.testAnalysis.lt2.confidence === 'medium' ? 'text-amber-700' : 'text-red-700'
                    }`}>
                      ({thresholds.testAnalysis.lt2.confidence})
                    </span>
                  </div>
                )}
              </div>
              {thresholds.testAnalysis.insights?.length > 0 && (
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-1 border-t border-indigo-100 pt-2">
                  {thresholds.testAnalysis.insights.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
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
                      const main = sportKey === 'bike' ? zoneOverride.power?.[zKey] : zoneOverride.pace?.[zKey];
                      const hr = zoneOverride.heartRate?.[zKey];
                      const lactate = zoneOverride.lactate?.[zKey];
                      const mainLabel = chartPrimaryIntensityLabel;

                      const setMain = (field, val) => {
                        setZoneOverride((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev };
                          if (sportKey === 'bike') {
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

                      const setLactate = (field, val) => {
                        setZoneOverride((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev };
                          next.lactate = { ...(next.lactate || {}) };
                          next.lactate[zKey] = { ...(next.lactate[zKey] || {}) };
                          next.lactate[zKey][field] = Number(val);
                          return next;
                        });
                      };

                      return (
                        <div key={zKey} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                          <div className="sm:col-span-2 text-sm font-semibold text-gray-900">Z{zNum}</div>
                          <div className="sm:col-span-4">
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
                          <div className="sm:col-span-3">
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
                          <div className="sm:col-span-3">
                            <div className="text-[11px] font-semibold text-gray-600 mb-1">Lactate</div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={lactate?.min ?? ''}
                                onChange={(e) => setLactate('min', e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                placeholder="min"
                              />
                              <input
                                value={lactate?.max ?? ''}
                                onChange={(e) => setLactate('max', e.target.value)}
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

      {/* ── PDF Preview Modal — rendered via portal to escape overflow:auto on iOS ── */}
      {showPdfPreview && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPdfPreview(false)} />
          <div className="relative w-full max-w-6xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            style={{ height: '100dvh', maxHeight: '100dvh' }}>

            {/* Modal header — always visible, sticky at top; safe-area-top ensures notch is covered */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 flex-shrink-0 bg-white z-10"
              style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }}>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold text-gray-900">PDF Preview</div>
                <div className="text-xs text-gray-400 truncate">{mockData?.title || 'Lactate Report'} · {formatDate(mockData?.date)}</div>
              </div>
              <button
                onClick={() => setShowPdfPreview(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors text-gray-600 touch-manipulation flex-shrink-0"
                aria-label="Close PDF preview"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Main area:
                Mobile  → flex-col: PDF on top (scrollable), sidebar collapsible below
                Desktop → flex-row: PDF left, sidebar right */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0">

              {/* ── PDF viewer ── */}
              <div className="flex-1 md:order-1 relative bg-gray-100 min-h-0 flex flex-col" style={{ minHeight: 0 }}>
                {pdfPreviewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-gray-500">Generating preview…</span>
                    </div>
                  </div>
                )}
                {pdfPreviewUrl && (
                  <>
                    {/* Mobile: open in new tab — iframe PDF scroll doesn't work on iOS/WKWebView */}
                    <div className="md:hidden flex flex-col h-full">
                      <div className="flex-1 overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <object
                          data={pdfPreviewUrl}
                          type="application/pdf"
                          className="w-full"
                          style={{ height: '60dvh' }}
                        >
                          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <p className="text-sm text-gray-500">PDF preview not supported in this browser.</p>
                          </div>
                        </object>
                      </div>
                      {/* Always-visible open-in-browser button on mobile */}
                      <div className="flex-shrink-0 p-3 bg-white border-t border-gray-100">
                        <button
                          onClick={handleOpenInBrowser}
                          className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold touch-manipulation active:opacity-70"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          Open full PDF in browser
                        </button>
                      </div>
                    </div>
                    {/* Desktop: regular iframe */}
                    <iframe
                      src={pdfPreviewUrl}
                      title="PDF Preview"
                      className="hidden md:block w-full h-full border-0"
                    />
                  </>
                )}
              </div>

              {/* Sidebar — on mobile collapsible below PDF, on desktop fixed right column */}
              <div className="flex-shrink-0 md:w-72 md:order-2 md:border-l border-t md:border-t-0 border-gray-100 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[38dvh] md:max-h-none" style={{ WebkitOverflowScrolling: 'touch' }}>

                  {/* Custom analysis (overrides the auto-generated paragraph) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Analysis (override)</label>
                    <p className="text-xs text-gray-400 mb-2">Leave blank for auto-generated text. Filled text replaces the Analysis paragraph in the PDF.</p>
                    <textarea
                      value={pdfCustomAnalysis}
                      onChange={(e) => setPdfCustomAnalysis(e.target.value)}
                      rows={5}
                      placeholder="Write your own analysis to replace the default text…"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  {/* Custom note (appended after analysis) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Coach / Athlete Notes</label>
                    <p className="text-xs text-gray-400 mb-2">Appended after the Analysis paragraph.</p>
                    <textarea
                      value={pdfCustomNote}
                      onChange={(e) => setPdfCustomNote(e.target.value)}
                      rows={4}
                      placeholder="Add notes, observations, training recommendations…"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  {/* Previous test comparison selector */}
                  {allPrevTests.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Compare with previous tests</label>
                      <p className="text-xs text-gray-400 mb-2">Select up to 2 tests to compare in the report.</p>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                        {allPrevTests.map((t) => {
                          const isSelected = selectedCompareIds.includes(t._id);
                          const selIdx = selectedCompareIds.indexOf(t._id);
                          return (
                            <button
                              key={t._id}
                              onClick={() => toggleCompareId(t._id)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors text-left touch-manipulation ${
                                isSelected
                                  ? 'border-primary bg-primary/5 text-primary'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center font-bold border transition-colors ${
                                isSelected
                                  ? 'bg-primary text-white border-primary'
                                  : 'border-gray-300 bg-white text-transparent'
                              }`}>
                                {isSelected ? (selIdx === 0 ? '1' : '2') : ''}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate">{formatDate(t.date)}</div>
                                <div className="text-gray-400 truncate">{t.title || t.name || t.sport || '—'}</div>
                              </div>
                              {isSelected && <CheckIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Zone overrides */}
                  {zoneOverride && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">Training Zones</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2">
                        {['zone1','zone2','zone3','zone4','zone5'].map((zKey, zi) => {
                          const zNum = zKey.replace('zone','');
                          const main = sportKey === 'bike' ? zoneOverride.power?.[zKey] : zoneOverride.pace?.[zKey];
                          const hr   = zoneOverride.heartRate?.[zKey];
                          const setMain = (field, val) => setZoneOverride(prev => {
                            if (!prev) return prev;
                            const next = { ...prev };
                            if (sportKey === 'bike') {
                              next.power = { ...(next.power || {}) };
                              next.power[zKey] = { ...(next.power[zKey] || {}), [field]: Number(val) };
                            } else {
                              next.pace = { ...(next.pace || {}) };
                              next.pace[zKey] = { ...(next.pace[zKey] || {}), [field]: val };
                            }
                            return next;
                          });
                          const setHr = (field, val) => setZoneOverride(prev => {
                            if (!prev) return prev;
                            const next = { ...prev };
                            next.heartRate = { ...(next.heartRate || {}) };
                            next.heartRate[zKey] = { ...(next.heartRate[zKey] || {}), [field]: Number(val) };
                            return next;
                          });
                          const zoneColors = ['bg-green-500','bg-lime-400','bg-yellow-400','bg-orange-400','bg-red-500'];
                          return (
                            <div key={zKey} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${zoneColors[zi]}`} />
                                <span className="text-xs font-semibold text-gray-800">Z{zNum}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <input value={main?.min ?? ''} onChange={e => setMain('min', e.target.value)}
                                  className="px-2 py-1.5 text-xs border border-gray-200 rounded" placeholder="min" />
                                <input value={main?.max ?? ''} onChange={e => setMain('max', e.target.value)}
                                  className="px-2 py-1.5 text-xs border border-gray-200 rounded" placeholder="max" />
                                {hr != null && <>
                                  <input value={hr?.min ?? ''} onChange={e => setHr('min', e.target.value)}
                                    className="px-2 py-1.5 text-xs border border-gray-100 rounded text-gray-400" placeholder="HR min" />
                                  <input value={hr?.max ?? ''} onChange={e => setHr('max', e.target.value)}
                                    className="px-2 py-1.5 text-xs border border-gray-100 rounded text-gray-400" placeholder="HR max" />
                                </>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex-shrink-0 border-t border-gray-100 p-3 sm:p-4 flex flex-row md:flex-col gap-2"
                  style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>
                  <button
                    onClick={handleRegeneratePdfPreview}
                    disabled={pdfPreviewLoading}
                    className="flex-1 md:flex-none min-h-[44px] px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors touch-manipulation flex items-center justify-center gap-2"
                  >
                    <ArrowPathIcon className={`w-4 h-4 flex-shrink-0 ${pdfPreviewLoading ? 'animate-spin' : ''}`} />
                    {pdfPreviewLoading ? 'Updating…' : 'Update Preview'}
                  </button>
                  <button
                    onClick={handleFinalDownload}
                    disabled={downloadingPdf || pdfPreviewLoading}
                    className="flex-1 md:flex-none min-h-[44px] px-3 py-2 text-sm rounded-lg border border-primary bg-primary text-white hover:opacity-90 active:opacity-80 disabled:opacity-50 transition-colors font-medium touch-manipulation flex items-center justify-center gap-2"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
                    {downloadingPdf ? 'Downloading…' : 'Download PDF'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default LactateCurveCalculator;
