"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useAuth } from '../../context/AuthProvider';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// ── Custom tooltip overlay ──────────────────────────────────────────────────
const CustomTooltip = ({ tooltip, datasets, sport, unitSystem = 'metric' }) => {
  if (!tooltip?.dataPoints) return null;
  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index === undefined) return null;
  const label = tooltip.dataPoints[0]?.label;
  const dataPoint = datasets[index];
  if (!dataPoint) return null;

  const formatPace = (seconds) => {
    if (!seconds) return null;
    const secPerUnit = unitSystem === 'imperial' ? seconds * 1.60934 : seconds;
    const minutes = Math.floor(secPerUnit / 60);
    const remainingSeconds = Math.floor(secPerUnit % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}${unitSystem === 'imperial' ? '/mi' : '/km'}`;
  };

  const formatDistance = (distance) => {
    if (!distance && distance !== 0) return null;
    let numDistance, isInMeters = false;
    if (typeof distance === 'string') {
      const c = distance.trim().toLowerCase();
      if (c.includes('km')) { const m = c.match(/^([\d.]+)\s*km$/); if (m) { numDistance = parseFloat(m[1]); } }
      else if (c.includes('m')) { const m = c.match(/^([\d.]+)\s*m$/); if (m) { numDistance = parseFloat(m[1]); isInMeters = true; } }
      else { numDistance = parseFloat(c.replace(/km|m| /gi, '').trim()); if (!isNaN(numDistance) && numDistance > 100 && numDistance % 1 === 0) isInMeters = true; }
    } else { numDistance = parseFloat(distance); if (!isNaN(numDistance) && numDistance > 100 && numDistance % 1 === 0) isInMeters = true; }
    if (isNaN(numDistance)) return null;
    const km = isInMeters ? numDistance / 1000 : numDistance;
    if (km < 1) { const m = isInMeters ? Math.round(numDistance) : Math.round(km * 1000); return unitSystem === 'imperial' ? `${Math.round(m * 3.28084)} ft` : `${m} m`; }
    return unitSystem === 'imperial' ? `${(km * 0.621371).toFixed(2)} mi` : `${km.toFixed(2)} km`;
  };

  const formatLength = (duration) => {
    if (!duration) return null;
    if (typeof duration === 'string' && (duration.includes('km') || duration.includes('m') || duration.includes('min') || duration.includes(':'))) return duration;
    const n = parseFloat(duration);
    if (!isNaN(n)) return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
    return null;
  };

  const metrics = [];
  if (dataPoint.power && dataPoint.power !== 0) {
    const isRun = sport === 'run' || sport === 'running';
    metrics.push({ label: isRun ? 'Pace' : 'Power', formattedValue: isRun ? formatPace(dataPoint.power) : `${dataPoint.power}W`, color: '#3B82F6' });
  }
  if (dataPoint.heartRate && dataPoint.heartRate !== 0)
    metrics.push({ label: 'Heart Rate', formattedValue: `${dataPoint.heartRate} bpm`, color: '#EF4444' });
  if (dataPoint.duration && dataPoint.duration !== 0) {
    const durationType = dataPoint.durationType || 'time';
    const fmt = durationType === 'distance' ? formatDistance(dataPoint.duration) : formatLength(dataPoint.duration);
    if (fmt) metrics.push({ label: durationType === 'distance' ? 'Distance' : 'Duration', formattedValue: fmt, color: '#10B981' });
  }
  if (dataPoint.lactate && dataPoint.lactate !== 0)
    metrics.push({ label: 'Lactate', formattedValue: `${dataPoint.lactate} mmol/L`, color: '#8B5CF6' });
  if (dataPoint.rpe && dataPoint.rpe !== 0)
    metrics.push({ label: 'RPE', formattedValue: `${dataPoint.rpe}`, color: '#F97316' });

  return (
    <div
      className="absolute bg-white/95 backdrop-blur-sm shadow-lg p-3 rounded-xl text-xs border border-slate-100"
      style={{ left: tooltip.caretX, top: tooltip.caretY, transform: 'translate(-50%, -120%)', position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 50 }}
    >
      <div className="font-semibold text-slate-800 mb-1.5">Interval {label}</div>
      {metrics.map((m, i) => (
        <div key={i} className="flex items-center gap-1.5 text-slate-600 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
          <span className="text-slate-500">{m.label}:</span>
          <span className="font-medium text-slate-800">{m.formattedValue}</span>
        </div>
      ))}
      <div className="absolute w-0 h-0" style={{ left: '50%', bottom: '-6px', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid white' }} />
    </div>
  );
};

// ── Compact pill select ─────────────────────────────────────────────────────
const CompactSelect = ({ value, onChange, options, placeholder }) => (
  <div className="relative inline-flex items-center">
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 text-xs font-medium rounded-lg pl-2.5 pr-6 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 border-0 max-w-[160px] truncate"
      style={{ WebkitAppearance: 'none' }}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <svg className="absolute right-1.5 w-3 h-3 text-slate-400 pointer-events-none shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  </div>
);

// ── Settings dropdown ───────────────────────────────────────────────────────
const SettingsDropdown = ({ isOpen, availableSports, currentSelectedSport, onSportChange, titleOptions, selectedTitle, onTitleChange, trainingOptions, selectedTraining, onTrainingChange }) => {
  if (!isOpen) return null;
  return (
    <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-slate-200 z-50 p-3 flex flex-col gap-3">
      {/* Sport */}
      {availableSports.length > 1 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Sport</p>
          <div className="flex flex-wrap gap-1">
            {['all', ...availableSports].map(s => {
              const active = currentSelectedSport === s;
              const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
              return (
                <button
                  key={s}
                  onClick={() => onSportChange(s)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Training title */}
      {titleOptions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Training</p>
          <CompactSelect
            value={selectedTitle}
            onChange={onTitleChange}
            options={titleOptions}
            placeholder="Select training"
          />
        </div>
      )}

      {/* Date */}
      {trainingOptions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Date</p>
          <CompactSelect
            value={selectedTraining}
            onChange={onTrainingChange}
            options={trainingOptions}
            placeholder="Select date"
          />
        </div>
      )}
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────────────
const TrainingGraph = ({
  trainingList = [],
  selectedTitle,
  setSelectedTitle,
  selectedTraining,
  setSelectedTraining,
  selectedSport,
  setSelectedSport
}) => {
  const { user } = useAuth();
  const unitSystem = resolveDistanceUnitSystem(user, 'metric');
  const settingsRef = useRef(null);

  const normalizeSport = useCallback((sport) => {
    const value = String(sport || '').toLowerCase();
    if (value === 'bike') return 'cycling';
    if (value === 'run') return 'running';
    if (value === 'swim') return 'swimming';
    return value;
  }, []);

  const trainingSport = useCallback((training) => normalizeSport(training?.sport), [normalizeSport]);
  const matchesSport = useCallback(
    (training, sport) => sport === 'all' || trainingSport(training) === normalizeSport(sport),
    [trainingSport, normalizeSport]
  );

  const availableSports = [...new Set((trainingList || []).map((t) => trainingSport(t)))].filter(Boolean);

  const [internalSelectedSport, setInternalSelectedSport] = useState(() => {
    if (selectedSport) return normalizeSport(selectedSport);
    const saved = localStorage.getItem('trainingGraph_selectedSport');
    const normalizedSaved = normalizeSport(saved);
    if (normalizedSaved && (normalizedSaved === 'all' || availableSports.includes(normalizedSaved))) return normalizedSaved;
    return 'all';
  });

  const currentSelectedSport = selectedSport ? normalizeSport(selectedSport) : internalSelectedSport;
  const setCurrentSelectedSport = (value) => {
    const v = normalizeSport(value);
    if (setSelectedSport) setSelectedSport(v); else setInternalSelectedSport(v);
    localStorage.setItem('trainingGraph_selectedSport', v);
  };

  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [ranges, setRanges] = useState({ power: { min: 0, max: 0 }, heartRate: { min: 0, max: 0 } });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const formatPace = (seconds) => {
    const secPerUnit = unitSystem === 'imperial' ? seconds * 1.60934 : seconds;
    const minutes = Math.floor(secPerUnit / 60);
    const remainingSeconds = Math.floor(secPerUnit % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}${unitSystem === 'imperial' ? '/mi' : '/km'}`;
  };

  const formatPowerValue = (value, sport) => {
    if (normalizeSport(sport) === 'cycling') return `${value}W`;
    return formatPace(value);
  };

  const handleSportChange = (newSport) => {
    setCurrentSelectedSport(newSport);
    const sportTrainings = newSport === 'all' ? trainingList : trainingList.filter((t) => matchesSport(t, newSport));
    const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
    if (sportTrainings.length > 0) {
      const firstTitle = uniqueTitles[0];
      const firstTraining = sportTrainings.find(t => t.title === firstTitle)?._id;
      if (firstTitle) { setSelectedTitle(firstTitle); if (firstTraining) setSelectedTraining(firstTraining); }
    } else { setSelectedTitle(null); setSelectedTraining(null); }
  };

  const handleTitleChange = (newTitle) => {
    const sportTrainings = currentSelectedSport === 'all' ? trainingList : trainingList.filter((t) => matchesSport(t, currentSelectedSport));
    const trainingsWithTitle = sportTrainings.filter(t => t.title === newTitle).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (setSelectedTitle) setSelectedTitle(newTitle);
    if (setSelectedTraining && trainingsWithTitle[0]) setSelectedTraining(trainingsWithTitle[0]._id);
  };

  const handleTrainingChange = (trainingId) => {
    setSelectedTraining(trainingId);
    const training = trainingList.find(t => t._id === trainingId);
    if (training && setSelectedTitle) setSelectedTitle(training.title);
  };

  // Sync selection when trainings or sport changes
  useEffect(() => {
    if (!trainingList || trainingList.length === 0) return;
    setLoading(false);
    const sportTrainings = currentSelectedSport === 'all' ? trainingList : trainingList.filter((t) => matchesSport(t, currentSelectedSport));
    if (sportTrainings.length === 0) { if (setSelectedTitle) setSelectedTitle(null); if (setSelectedTraining) setSelectedTraining(null); return; }
    if (selectedTraining) {
      const currentTraining = trainingList.find(t => t._id === selectedTraining);
      if (currentTraining && matchesSport(currentTraining, currentSelectedSport)) {
        if (setSelectedTitle && currentTraining.title !== selectedTitle) setSelectedTitle(currentTraining.title);
        return;
      }
    }
    if (selectedTitle) {
      const trainingsWithTitle = sportTrainings.filter(t => t.title === selectedTitle).sort((a, b) => new Date(b.date) - new Date(a.date));
      if (trainingsWithTitle.length > 0) { if (setSelectedTraining) setSelectedTraining(trainingsWithTitle[0]._id); return; }
    }
    const sortedTrainings = [...sportTrainings].sort((a, b) => new Date(b.date) - new Date(a.date));
    const newest = sortedTrainings[0];
    if (newest) { if (setSelectedTitle) setSelectedTitle(newest.title); if (setSelectedTraining) setSelectedTraining(newest._id); }
  }, [currentSelectedSport, trainingList, selectedTraining, selectedTitle, setSelectedTitle, setSelectedTraining, matchesSport]);

  // Update ranges + close-on-outside-click
  useEffect(() => {
    if (selectedTraining && trainingList?.length > 0) {
      const selectedData = trainingList.find(t => t._id === selectedTraining);
      if (selectedData?.results) {
        const powers = selectedData.results.map(r => r.power).filter(Boolean);
        const heartRates = selectedData.results.map(r => r.heartRate).filter(Boolean);
        if (powers.length && heartRates.length) {
          setRanges({
            power: { min: Math.floor(Math.min(...powers) - 20), max: Math.ceil(Math.max(...powers) + 20) },
            heartRate: { min: Math.floor(Math.min(...heartRates) - 5), max: Math.ceil(Math.max(...heartRates) + 5) }
          });
        }
      }
    }
    const handleClickOutside = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setIsSettingsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedTraining, trainingList]);

  // ── Shared header button ────────────────────────────────────────────────
  const SettingsButton = () => (
    <div className="relative shrink-0" ref={settingsRef}>
      <button
        onClick={() => setIsSettingsOpen(o => !o)}
        className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-slate-200 text-slate-700' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}
        title="Filter"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
      </button>
      <SettingsDropdown
        isOpen={isSettingsOpen}
        availableSports={availableSports}
        currentSelectedSport={currentSelectedSport}
        onSportChange={(s) => { handleSportChange(s); }}
        titleOptions={[]}
        selectedTitle={selectedTitle}
        onTitleChange={handleTitleChange}
        trainingOptions={[]}
        selectedTraining={selectedTraining}
        onTrainingChange={handleTrainingChange}
      />
    </div>
  );

  // ── Loading / no data states ────────────────────────────────────────────
  if (!trainingList) return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-bold text-slate-900">Training Graph</h3>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-bold text-slate-900">Training Graph</h3>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>
    </div>
  );

  const sportTrainings = currentSelectedSport === 'all'
    ? (trainingList || [])
    : (trainingList || []).filter((t) => matchesSport(t, currentSelectedSport));
  const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];

  if (trainingList.length === 0 || sportTrainings.length === 0) return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 leading-tight">Training Graph</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Power · Heart Rate per interval</p>
        </div>
        <SettingsButton />
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-slate-400">
        No training data{currentSelectedSport !== 'all' ? ` for ${currentSelectedSport}` : ''}
      </div>
    </div>
  );

  const selectedTrainingData = trainingList.find(t => t._id === selectedTraining);

  const trainingsWithSelectedTitle = sportTrainings.filter(t => t.title === selectedTitle);
  const trainingOptions = trainingsWithSelectedTitle
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(training => ({
      value: training._id,
      label: new Date(training.date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }));
  const titleOptions = uniqueTitles.map(t => ({ value: t, label: t }));

  if (!selectedTrainingData?.results) return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 leading-tight">Training Graph</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Power · Heart Rate per interval</p>
        </div>
        <div className="relative shrink-0" ref={settingsRef}>
          <button
            onClick={() => setIsSettingsOpen(o => !o)}
            className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-slate-200 text-slate-700' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
          <SettingsDropdown
            isOpen={isSettingsOpen}
            availableSports={availableSports}
            currentSelectedSport={currentSelectedSport}
            onSportChange={handleSportChange}
            titleOptions={titleOptions}
            selectedTitle={selectedTitle}
            onTitleChange={handleTitleChange}
            trainingOptions={trainingOptions}
            selectedTraining={selectedTraining}
            onTrainingChange={handleTrainingChange}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-slate-400">
        Select a training to view data
      </div>
    </div>
  );

  const sportForScale = currentSelectedSport === 'all' && selectedTrainingData ? selectedTrainingData.sport : currentSelectedSport;
  const isRunScale = normalizeSport(sportForScale) === 'running' || sportForScale === 'run';

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "start",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          padding: 16,
          font: { size: 11, family: 'inherit' },
          color: '#64748b',
        }
      },
      tooltip: {
        enabled: false,
        external: (context) => {
          if (context.tooltip.opacity === 0) setTooltip(null);
          else setTooltip(context.tooltip);
        },
      },
    },
    scales: {
      y: {
        position: 'left',
        title: { display: false },
        min: ranges.power.min,
        max: ranges.power.max,
        reverse: isRunScale,
        ticks: {
          stepSize: Math.round((ranges.power.max - ranges.power.min) / 4),
          callback: (value) => formatPowerValue(value, sportForScale),
          display: true,
          autoSkip: false,
          font: { size: 10, family: 'inherit' },
          color: '#94a3b8',
        },
        border: { dash: [4, 4], color: 'transparent' },
        grid: { color: 'rgba(148,163,184,0.15)', borderDash: [4, 4] },
      },
      y1: {
        position: 'right',
        title: { display: false },
        min: ranges.heartRate.min,
        max: ranges.heartRate.max,
        ticks: {
          stepSize: Math.round((ranges.heartRate.max - ranges.heartRate.min) / 4),
          callback: (value) => `${value}`,
          display: true,
          autoSkip: false,
          font: { size: 10, family: 'inherit' },
          color: '#94a3b8',
        },
        grid: { display: false },
        border: { display: false },
      },
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 11, family: 'inherit' }, color: '#94a3b8' },
      }
    },
  };

  const hasSpecifics = selectedTrainingData.specifics?.specific || selectedTrainingData.specifics?.weather;
  const hasComment = selectedTrainingData.comments || selectedTrainingData.description;

  return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Header — single row ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        {/* Title select */}
        {titleOptions.length > 1 ? (
          <CompactSelect
            value={selectedTitle || ''}
            onChange={handleTitleChange}
            options={titleOptions}
          />
        ) : (
          <span className="text-sm font-bold text-slate-900 truncate max-w-[200px]">
            {selectedTitle || 'Training Graph'}
          </span>
        )}

        {/* Date select */}
        {trainingOptions.length > 0 && (
          <CompactSelect
            value={selectedTraining || ''}
            onChange={handleTrainingChange}
            options={trainingOptions}
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Filter button — sport + anything else */}
        <div className="relative shrink-0" ref={settingsRef}>
          <button
            onClick={() => setIsSettingsOpen(o => !o)}
            className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen ? 'bg-slate-200 text-slate-700' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}
            title="Filter"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
          <SettingsDropdown
            isOpen={isSettingsOpen}
            availableSports={availableSports}
            currentSelectedSport={currentSelectedSport}
            onSportChange={handleSportChange}
            titleOptions={titleOptions}
            selectedTitle={selectedTitle}
            onTitleChange={handleTitleChange}
            trainingOptions={trainingOptions}
            selectedTraining={selectedTraining}
            onTrainingChange={handleTrainingChange}
          />
        </div>
      </div>

      {/* ── Chart — fills remaining height ── */}
      <div className="flex-1 min-h-0 relative px-3 pt-2 pb-1">
        <Line
          data={{
            labels: selectedTrainingData.results.map(r => r.interval.toString()),
            datasets: [
              {
                label: isRunScale ? "Pace" : "Power",
                data: selectedTrainingData.results.map(r => r.power),
                borderColor: "#3B82F6",
                backgroundColor: "#3B82F6",
                pointStyle: "circle",
                pointRadius: 5,
                pointHoverRadius: 8,
                borderWidth: 2,
                tension: 0.4,
              },
              {
                label: "Heart Rate",
                data: selectedTrainingData.results.map(r => r.heartRate),
                borderColor: "#EF4444",
                backgroundColor: "#EF4444",
                pointStyle: "circle",
                pointRadius: 5,
                pointHoverRadius: 8,
                borderWidth: 2,
                yAxisID: "y1",
                tension: 0.4,
              }
            ]
          }}
          options={chartOptions}
        />
        {tooltip && (
          <CustomTooltip
            tooltip={tooltip}
            datasets={selectedTrainingData.results.map(r => ({
              ...r,
              duration: r.moving_time ?? r.totalTimerTime ?? r.duration ?? r.durationSeconds
            }))}
            sport={currentSelectedSport === 'all' ? selectedTrainingData.sport : currentSelectedSport}
            unitSystem={unitSystem}
          />
        )}
      </div>

      {/* ── Footer — specifics / comment ── */}
      {(hasSpecifics || hasComment) && (
        <div className="px-4 py-2.5 border-t border-slate-100 shrink-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {selectedTrainingData.specifics?.specific && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                <span className="font-medium text-slate-400">Condition</span>
                <span className="bg-slate-100 rounded px-1.5 py-0.5">{selectedTrainingData.specifics.specific}</span>
              </span>
            )}
            {selectedTrainingData.specifics?.weather && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                <span className="font-medium text-slate-400">Weather</span>
                <span className="bg-slate-100 rounded px-1.5 py-0.5">{selectedTrainingData.specifics.weather}</span>
              </span>
            )}
            {(selectedTrainingData.comments || selectedTrainingData.description) && (
              <span className="text-[11px] text-slate-500 italic truncate max-w-xs">
                {selectedTrainingData.comments || selectedTrainingData.description}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingGraph;
