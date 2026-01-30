import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ClockIcon, MapPinIcon, HeartIcon, BoltIcon, PencilIcon, CheckIcon, XMarkIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import ReactECharts from 'echarts-for-react';
import { formatDuration, formatDistance, prepareTrainingChartData } from '../../utils/fitAnalysisUtils';
import { updateFitTraining, getAllTitles } from '../../services/api';
import api from '../../services/api';
import { formatSpeedForUser } from '../../utils/unitsConverter';

const TrainingStats = ({ training, onDelete, onUpdate, user }) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [title, setTitle] = useState(training?.titleManual || training?.titleAuto || training?.originalFileName || '');
  const [description, setDescription] = useState(training?.description || '');
  // eslint-disable-next-line no-unused-vars
  const [category, setCategory] = useState(training?.category || '');
  const [saving, setSaving] = useState(false);
  const [allTitles, setAllTitles] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [showSuggestions, setShowSuggestions] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [filteredTitles, setFilteredTitles] = useState([]);
  const titleInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const [intervalModalOpen, setIntervalModalOpen] = useState(false);
  const [selectedLapIndices, setSelectedLapIndices] = useState([]);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [modalError, setModalError] = useState('');
  const [userFTP, setUserFTP] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Load user profile for FTP and threshold pace
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        const profileData = response.data;
        setUserProfile(profileData);
        // Get FTP from power zones (LTP2) or zone5 min (which is typically FTP)
        const ftp = profileData.powerZones?.cycling?.lt2 || 
                   profileData.powerZones?.cycling?.zone5?.min || 
                   null;
        setUserFTP(ftp);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    if (training) {
      loadUserProfile();
    }
  }, [training]);

  // Update state when training changes
  useEffect(() => {
    if (training) {
      setTitle(training.titleManual || training.titleAuto || training.originalFileName || '');
      setDescription(training.description || '');
      setCategory(training.category || '');
    }
  }, [training]);

  // Load all titles when editing starts
  useEffect(() => {
    if (isEditingTitle) {
      getAllTitles().then(titles => {
        setAllTitles(titles);
        setFilteredTitles(titles); // Zobrazit všechny titles na začátku
        setShowSuggestions(titles.length > 0); // Zobrazit dropdown hned
      }).catch(err => console.error('Error loading titles:', err));
    }
  }, [isEditingTitle]);

  // Filter titles based on input
  useEffect(() => {
    if (title.trim() === '') {
      setFilteredTitles(allTitles);
      setShowSuggestions(allTitles.length > 0);
    } else {
      const filtered = allTitles.filter(t => 
        t.toLowerCase().includes(title.toLowerCase())
      );
      setFilteredTitles(filtered);
      setShowSuggestions(filtered.length > 0);
    }
  }, [title, allTitles]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        titleInputRef.current &&
        !titleInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    if (isEditingTitle) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditingTitle]);

  const getLapDurationSeconds = (lap = {}) => {
    // Prefer moving time (exclude stopped time) so stats reflect only time when moving
    const candidates = [
      lap.moving_time,
      lap.totalTimerTime,
      lap.total_timer_time,
      lap.totalElapsedTime,
      lap.total_elapsed_time,
      lap.elapsed_time,
      lap.duration
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const numeric = typeof candidate === 'number' ? candidate : parseFloat(candidate);
      if (!Number.isNaN(numeric) && numeric > 0) {
        return numeric;
      }
    }

    return 0;
  };

  const getLapPowerValue = (lap = {}) => {
    const candidates = [
      lap.avgPower,
      lap.avg_power,
      lap.average_watts,
      lap.average_watt,
      lap.power,
      lap.maxPower,
      lap.max_power,
      lap.max_watts,
      lap.normalizedPower
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const numeric = typeof candidate === 'number' ? candidate : parseFloat(candidate);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }

    return null;
  };

  const lapDetails = useMemo(() => {
    if (!training || !training.laps || training.laps.length === 0) return [];

    const laps = training.laps;
    const recordsStartMs = training?.records?.[0]?.timestamp
      ? new Date(training.records[0].timestamp).getTime()
      : training?.timestamp
        ? new Date(training.timestamp).getTime()
        : null;

    const details = [];
    let fallbackCumulative = 0;
    let lastEnd = 0;

    laps.forEach((lap, index) => {
      const duration = getLapDurationSeconds(lap);
      let start = fallbackCumulative;

      if (lap.startTime) {
        const lapStart = new Date(lap.startTime).getTime();
        if (recordsStartMs) {
          start = Math.max(0, (lapStart - recordsStartMs) / 1000);
        }
      }

      const end = start + duration;
      let rest = 0;
      if (index > 0) {
        rest = Math.max(0, start - lastEnd);
      }

      fallbackCumulative = end;
      lastEnd = end;

      details.push({
        index,
        duration,
        start,
        end,
        rest,
        power: getLapPowerValue(lap),
        heartRate: lap.avgHeartRate || lap.maxHeartRate || lap.average_heartrate || lap.max_heartrate || null,
        lactate: lap.lactate ?? null
      });
    });

    return details;
  }, [training]);

  const computeRecommendedLapSelection = useMemo(() => {
    return (laps = []) => {
      if (!Array.isArray(laps) || laps.length === 0 || lapDetails.length === 0) return [];

      const longCandidates = lapDetails.filter(lap => lap.duration >= 20 * 60);
      if (longCandidates.length > 0) {
        return longCandidates.map(lap => lap.index);
      }

      const durations = lapDetails.map(lap => lap.duration);
      const maxDuration = Math.max(...durations);
      const dynamicThreshold = Math.max(15 * 60, maxDuration * 0.6);
      const dynamicCandidates = lapDetails.filter(lap => lap.duration >= dynamicThreshold);
      if (dynamicCandidates.length > 0) {
        return dynamicCandidates.map(lap => lap.index);
      }

      const powered = lapDetails
        .filter(lap => lap.power !== null && lap.power > 0)
        .sort((a, b) => b.duration - a.duration);
      if (powered.length > 0) {
        return powered.slice(0, Math.min(10, powered.length)).map(lap => lap.index);
      }

      return lapDetails
        .slice(0, Math.min(5, lapDetails.length))
        .map(lap => lap.index);
    };
  }, [lapDetails]);

  const trainingChartOption = useMemo(() => {
    if (!training || !training.records || training.records.length === 0) return null;
    const chartData = prepareTrainingChartData(training);
    if (!chartData) return null;

    const times = chartData.records.map(r => r.timeFromStart / 60);
    const speedSeries = chartData.records.map((r, idx) => [times[idx], r.speed !== null ? r.speed : null]);
    const heartRateSeries = chartData.records.map((r, idx) => [times[idx], r.heartRate !== null ? r.heartRate : null]);
    const powerSeries = chartData.records.map((r, idx) => [times[idx], r.power !== null ? r.power : null]);

    const markAreas = selectedLapIndices
      .map(index => {
        const detail = lapDetails.find(l => l.index === index);
        if (!detail) return null;
        return [
          {
            name: `Interval ${index + 1}`,
            xAxis: (detail.start / 60).toFixed(3)
          },
          {
            xAxis: (detail.end / 60).toFixed(3)
          }
        ];
      })
      .filter(Boolean);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const lines = params
            .filter(p => p.value !== null && p.value !== undefined)
            .map(p => {
              if (p.seriesName === 'Speed') {
                const speedMps = p.value[1] / 3.6; // Convert km/h to m/s
                const formatted = formatSpeedForUser(speedMps, user);
                return `${p.seriesName}: ${formatted}`;
              }
              if (p.seriesName === 'Heart Rate') {
                return `${p.seriesName}: ${Math.round(p.value[1])} bpm`;
              }
              if (p.seriesName === 'Power') {
                return `${p.seriesName}: ${Math.round(p.value[1])} W`;
              }
              return '';
            })
            .filter(Boolean);
          const timeMinutes = params[0]?.value ? params[0].value[0] : 0;
          const minutes = Math.floor(timeMinutes);
          const seconds = Math.round((timeMinutes - minutes) * 60);
          const header = `Time: ${minutes}:${seconds.toString().padStart(2, '0')} min`;
          return [header, ...lines].join('<br />');
        }
      },
      legend: {
        data: ['Speed', 'Heart Rate', 'Power']
      },
      grid: {
        left: 50,
        right: 70,
        top: 40,
        bottom: 50
      },
      xAxis: {
        type: 'value',
        name: 'Time (min)',
        min: 0,
        max: Math.ceil((chartData.maxTime || 0) / 60),
        boundaryGap: false
      },
      yAxis: [
        {
          type: 'value',
          name: user?.units?.distance === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)',
          position: 'left',
          min: 0,
          max: chartData.maxSpeed ? Math.ceil(chartData.maxSpeed * (user?.units?.distance === 'imperial' ? 0.621371 : 1) * 1.1) : (user?.units?.distance === 'imperial' ? 6 : 10)
        },
        {
          type: 'value',
          name: 'Heart Rate (bpm)',
          position: 'right',
          offset: 50,
          min: 0,
          max: chartData.maxHeartRate ? Math.ceil(chartData.maxHeartRate * 1.1) : 200
        },
        {
          type: 'value',
          name: 'Power (W)',
          position: 'right',
          min: 0,
          max: chartData.maxPower ? Math.ceil(chartData.maxPower * 1.1) : 400
        }
      ],
      series: [
        {
          name: 'Speed',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: speedSeries,
          yAxisIndex: 0
        },
        {
          name: 'Heart Rate',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: heartRateSeries,
          yAxisIndex: 1
        },
        {
          name: 'Power',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: powerSeries,
          yAxisIndex: 2,
          areaStyle: {
            opacity: 0.1
          },
          markArea: markAreas.length > 0 ? { itemStyle: { opacity: 0.1, color: '#60a5fa' }, data: markAreas } : undefined
        }
      ]
    };
  }, [training, lapDetails, selectedLapIndices, user]);

  // Calculate metrics (must be before early return)
  const calculateTSS = useMemo(() => {
    const seconds = training?.totalTimerTime || training?.moving_time || training?.totalElapsedTime || 0;
    if (seconds === 0) return null;
    
    const sport = training?.sport || '';
    const isRun = sport && (sport.toLowerCase().includes('run') || sport.toLowerCase() === 'running');
    const isSwim = sport && (sport.toLowerCase().includes('swim') || sport.toLowerCase() === 'swimming');
    
    // For running: calculate TSS from pace
    if (isRun && training?.avgSpeed && training.avgSpeed > 0) {
      const avgPaceSeconds = Math.round(1000 / training.avgSpeed); // seconds per km
      const thresholdPace = userProfile?.powerZones?.running?.lt2 || userProfile?.runningZones?.lt2 || null;
      let referencePace = thresholdPace;
      // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
      if (!referencePace || referencePace <= 0) {
        referencePace = avgPaceSeconds;
      }
      // Running TSS formula: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
      const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
      const tss = Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      return { value: tss, estimated: !thresholdPace };
    }
    
    // For swimming: calculate TSS from pace
    if (isSwim && training?.avgSpeed && training.avgSpeed > 0) {
      const avgPaceSeconds = Math.round(100 / training.avgSpeed); // seconds per 100m
      const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null;
      let referencePace = thresholdSwimPace;
      // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
      if (!referencePace || referencePace <= 0) {
        referencePace = avgPaceSeconds;
      }
      // Swimming TSS formula: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
      const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
      const tss = Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      return { value: tss, estimated: !thresholdSwimPace };
    }
    
    // For cycling: calculate TSS from power (use NP when available)
    const npOrAvg = training?.normalizedPower ?? training?.avgPower;
    if (!npOrAvg) return null;
    
    // If FTP is available, calculate proper TSS
    if (userFTP && userFTP > 0) {
      // TSS formula: TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
      const tss = (seconds * Math.pow(npOrAvg, 2)) / (Math.pow(userFTP, 2) * 3600) * 100;
      return Math.round(tss);
    }
    
    // Fallback: estimate TSS using a default FTP estimate (e.g., 250W)
    const estimatedFTP = 250;
    const tss = (seconds * Math.pow(npOrAvg, 2)) / (Math.pow(estimatedFTP, 2) * 3600) * 100;
    return { value: Math.round(tss), estimated: true };
  }, [userFTP, userProfile, training?.normalizedPower, training?.avgPower, training?.avgSpeed, training?.totalTimerTime, training?.moving_time, training?.totalElapsedTime, training?.sport]);

  const calculateIF = useMemo(() => {
    const npOrAvg = training?.normalizedPower ?? training?.avgPower;
    if (!npOrAvg) return null;
    const ftp = userFTP || 250;
    // Intensity Factor = NP / FTP
    const ifValue = npOrAvg / ftp;
    return ifValue.toFixed(2);
  }, [userFTP, training?.normalizedPower, training?.avgPower]);

  const totalTime = training?.totalTimerTime || training?.moving_time || training?.totalElapsedTime || 0;
  const avgCadence = training?.avgCadence || null;
  const maxCadence = training?.maxCadence || null;
  const maxPower = training?.maxPower || null;
  const maxHeartRate = training?.maxHeartRate || null;
  const maxSpeed = training?.maxSpeed || null;
  // Use NP when available (backend may send normalizedPower); otherwise avgPower. Label accordingly.
  const displayPower = training?.normalizedPower ?? training?.avgPower ?? null;
  const isNormalizedPower = training?.normalizedPower != null && training.normalizedPower > 0;
  
  // Determine sport type
  const sport = training?.sport || '';
  const isRun = sport && (sport.toLowerCase().includes('run') || sport.toLowerCase() === 'running');
  // eslint-disable-next-line no-unused-vars
  const isSwim = sport && (sport.toLowerCase().includes('swim') || sport.toLowerCase() === 'swimming');
  
  // Convert speed (m/s) to pace (MM:SS/km) for running
  const formatPaceFromSpeed = (speedMps) => {
    if (!speedMps || speedMps <= 0) return null;
    // Convert m/s to seconds per km
    const paceSeconds = Math.round(1000 / speedMps);
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = paceSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const avgPace = training?.avgSpeed ? formatPaceFromSpeed(training.avgSpeed) : null;
  const maxPace = maxSpeed ? formatPaceFromSpeed(maxSpeed) : null;

  const initiateSave = (payload) => {
    if (!training) return;

    const laps = training?.laps || [];
    if (!laps.length) {
      performSave(payload, null);
      return;
    }

    const recommended = computeRecommendedLapSelection(laps);
    const sanitizedSelection = recommended.length > 0 ? recommended : laps.map((_, index) => index);

    setSelectedLapIndices(sanitizedSelection);
    setPendingPayload(payload);
    setModalError('');
    setIntervalModalOpen(true);
  };

  const performSave = async (payload, lapIndices) => {
    if (!training || !payload) return;

    try {
      setSaving(true);
      const body = { ...payload };
      if (Array.isArray(lapIndices) && lapIndices.length > 0) {
        body.selectedLapIndices = [...new Set(lapIndices)]
          .map(value => parseInt(value, 10))
          .filter(value => Number.isInteger(value) && value >= 0)
          .sort((a, b) => a - b);
      }

      await updateFitTraining(training._id, body);
      if (payload.title !== undefined) {
      setIsEditingTitle(false);
      }
      if (payload.description !== undefined) {
        setIsEditingDescription(false);
      }
      if (payload.category !== undefined) {
        setIsEditingCategory(false);
      }
      setIntervalModalOpen(false);
      setPendingPayload(null);
      setSelectedLapIndices([]);
      setModalError('');
      if (onUpdate) {
        await onUpdate(training._id);
      }
    } catch (error) {
      console.error('Error saving training changes:', error);
      alert('Error saving training changes');
    } finally {
      setSaving(false);
    }
  };

  if (!training) return null;

  const handleSaveDescription = async () => {
    const trimmedDescription = description.trim();
    initiateSave({ description: trimmedDescription || null });
  };

  const handleModalConfirm = async () => {
    if (!pendingPayload) {
      setIntervalModalOpen(false);
      return;
    }
    if (!selectedLapIndices || selectedLapIndices.length === 0) {
      setModalError('Select at least one interval to sync.');
      return;
    }
    await performSave(pendingPayload, selectedLapIndices);
  };

  const handleModalCancel = () => {
    if (saving) return;
    setIntervalModalOpen(false);
    setPendingPayload(null);
    setSelectedLapIndices([]);
    setModalError('');
  };

  const toggleLapSelection = (index) => {
    setSelectedLapIndices((prev) => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }
      return [...prev, index].sort((a, b) => a - b);
    });
    setModalError('');
  };

  const handleSelectAllLaps = () => {
    if (!training?.laps) return;
    setSelectedLapIndices(training.laps.map((_, index) => index));
    setModalError('');
  };

  const handleSelectRecommended = () => {
    if (!training?.laps) return;
    const recommended = computeRecommendedLapSelection(training.laps);
    setSelectedLapIndices(recommended);
    setModalError('');
  };

  const handleClearSelection = () => {
    setSelectedLapIndices([]);
  };

  return (
    <>
      {intervalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-xl sm:rounded-3xl bg-white shadow-2xl border border-gray-200 flex flex-col">
            <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Select Intervals to Sync</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Review the workout data, then choose which intervals should be saved to the training overview.
                </p>
              </div>
              <button
                onClick={handleModalCancel}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors self-end sm:self-auto"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
            <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 overflow-y-auto">
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 sm:gap-3">
                  <button
                    onClick={handleSelectRecommended}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs sm:text-sm shadow hover:bg-primary-dark transition-colors w-full sm:w-auto"
                  >
                    Use Recommended Intervals
                  </button>
                  <button
                    onClick={handleSelectAllLaps}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs sm:text-sm hover:bg-blue-200 transition-colors w-full sm:w-auto"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs sm:text-sm hover:bg-gray-200 transition-colors w-full sm:w-auto"
                  >
                    Clear Selection
                  </button>
                  <div className="text-xs sm:text-sm text-gray-600 w-full sm:w-auto">
                    Selected: {selectedLapIndices.length} / {training?.laps?.length || 0}
                  </div>
                </div>

                <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm p-2 sm:p-4">
                  {trainingChartOption ? (
                    <ReactECharts
                      option={trainingChartOption}
                      style={{ height: '320px', width: '100%' }}
                      className="min-h-[240px] sm:min-h-[320px]"
                      notMerge
                    />
                  ) : (
                    <div className="text-xs sm:text-sm text-gray-600">
                      Detailed record data is not available for this training, so the chart preview is unavailable.
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm">
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900">Intervals</h3>
                    <div className="text-xs sm:text-sm text-gray-600">
                      Click any interval to include or exclude it from synchronization.
                    </div>
                  </div>
                  <div className="max-h-48 sm:max-h-64 overflow-y-auto overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Use</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Start</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Power</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg HR</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Rest</th>
                          <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Lactate</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {lapDetails.map((lap) => {
                          const isSelected = selectedLapIndices.includes(lap.index);
                          return (
                            <tr
                              key={lap.index}
                              className={`transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
                              onClick={() => toggleLapSelection(lap.index)}
                            >
                              <td className="px-2 sm:px-3 md:px-4 py-2">
                                <input
                                  type="checkbox"
                                  className="form-checkbox h-4 w-4 text-primary"
                                  checked={isSelected}
                                  onChange={() => toggleLapSelection(lap.index)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-800 font-medium">{lap.index + 1}</td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-700">{formatDuration(Math.round(lap.duration))}</td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-500 hidden sm:table-cell">{formatDuration(Math.max(0, Math.round(lap.start)))}</td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-700">{lap.power ? `${Math.round(lap.power)} W` : '-'}</td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-700">{lap.heartRate ? `${Math.round(lap.heartRate)} bpm` : '-'}</td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-500 hidden md:table-cell">{lap.rest ? formatDuration(Math.round(lap.rest)) : '-'}</td>
                              <td className="px-2 sm:px-3 md:px-4 py-2 text-xs sm:text-sm text-gray-700 hidden lg:table-cell">{lap.lactate !== null && lap.lactate !== undefined ? `${lap.lactate.toFixed(1)} mmol/L` : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {modalError && (
                  <div className="text-xs sm:text-sm text-red-600">{modalError}</div>
                )}
              </div>
            </div>
            <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
              <button
                onClick={handleModalCancel}
                className="px-3 sm:px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-sm w-full sm:w-auto"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleModalConfirm}
                className="px-3 sm:px-4 py-2 rounded-lg bg-greenos text-white hover:opacity-90 transition-opacity disabled:opacity-50 text-sm w-full sm:w-auto"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Selection'}
              </button>
            </div>
          </div>
        </div>
      )}     
      
      {/* Description - Only show if there's content or when editing */}
      {(description || isEditingDescription) && (
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-start gap-2">
          {isEditingDescription ? (
            <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg min-h-[80px] bg-white text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y"
                placeholder="Enter description..."
                autoFocus
              />
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={handleSaveDescription}
                  disabled={saving}
                  className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                  title="Save description"
                >
                  <CheckIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setIsEditingDescription(false);
                    setDescription(training?.description || '');
                  }}
                  className="p-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-all shadow-sm hover:shadow-md"
                  title="Cancel"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 w-full group">
              <div className="flex-1">
                  {description && (
                  <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">{description}</p>
                )}
              </div>
              <button
                onClick={() => setIsEditingDescription(true)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-all flex-shrink-0"
                title="Edit description"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClockIcon className="h-4 w-4" />
            </span>
            Duration
          </div>
          <div className="mt-2 text-base font-semibold text-gray-900">{formatDuration(totalTime)}</div>
          <div className="mt-0.5 text-xs text-gray-500">&nbsp;</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPinIcon className="h-4 w-4" />
            </span>
            Distance
          </div>
          <div className="mt-2 text-base font-semibold text-gray-900">{formatDistance(training.totalDistance, user)}</div>
          <div className="mt-0.5 text-xs text-gray-500">&nbsp;</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red/10 text-red">
              <HeartIcon className="h-4 w-4" />
            </span>
            Avg HR
          </div>
          <div className="mt-2 text-base font-semibold text-gray-900">
            {training.avgHeartRate ? `${Math.round(training.avgHeartRate)} bpm` : '-'}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {maxHeartRate ? `Max ${Math.round(maxHeartRate)} bpm` : '\u00A0'}
          </div>
        </div>

        {/* Power: show NP when available, otherwise Avg Power */}
        {displayPower != null && displayPower > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                <BoltIcon className="h-4 w-4" />
              </span>
              {isNormalizedPower ? 'NP' : 'Avg Power'}
            </div>
            <div className="mt-2 text-base font-semibold text-gray-900">{Math.round(displayPower)} W</div>
            <div className="mt-0.5 text-xs text-gray-500">{maxPower ? `Max ${Math.round(maxPower)} W` : '\u00A0'}</div>
          </div>
        )}

        {avgCadence && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <CpuChipIcon className="h-4 w-4" />
              </span>
              Cadence
            </div>
            <div className="mt-2 text-base font-semibold text-gray-900">{Math.round(avgCadence)} rpm</div>
            <div className="mt-0.5 text-xs text-gray-500">{maxCadence ? `Max ${Math.round(maxCadence)} rpm` : '\u00A0'}</div>
          </div>
        )}

        {/* Show TSS for all sports (including run and swim) */}
        {calculateTSS !== null && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                <BoltIcon className="h-4 w-4" />
              </span>
              TSS
              {typeof calculateTSS === 'object' && calculateTSS.estimated && (
                <span className="text-[11px] text-gray-400" title="Estimated TSS (FTP not set in profile)">*</span>
              )}
            </div>
            <div className="mt-2 text-base font-semibold text-gray-900">
              {typeof calculateTSS === 'object' ? calculateTSS.value : calculateTSS}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">{calculateIF !== null ? `IF ${calculateIF}` : '\u00A0'}</div>
          </div>
        )}

        {/* Show Pace for running, Speed for other sports */}
        {isRun && avgPace ? (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-greenos/10 text-greenos">
                <MapPinIcon className="h-4 w-4" />
              </span>
              Avg Pace
            </div>
            <div className="mt-2 text-base font-semibold text-gray-900">{avgPace} /km</div>
            <div className="mt-0.5 text-xs text-gray-500">{maxPace ? `Max ${maxPace} /km` : '\u00A0'}</div>
          </div>
        ) : training.avgSpeed && !isRun ? (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-greenos/10 text-greenos">
                <MapPinIcon className="h-4 w-4" />
              </span>
              Avg Speed
            </div>
            <div className="mt-2 text-base font-semibold text-gray-900">{formatSpeedForUser(training.avgSpeed, user)}</div>
            <div className="mt-0.5 text-xs text-gray-500">&nbsp;</div>
          </div>
        ) : null}

        {training.totalAscent && training.totalAscent > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
                <MapPinIcon className="h-4 w-4" />
              </span>
              Elevation
            </div>
            <div className="mt-2 text-base font-semibold text-gray-900">+{Math.round(training.totalAscent)} m</div>
            <div className="mt-0.5 text-xs text-gray-500">&nbsp;</div>
          </div>
        )}
      </div>
    </>
  );
};

export default TrainingStats;