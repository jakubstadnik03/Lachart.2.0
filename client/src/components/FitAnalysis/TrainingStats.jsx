import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ClockIcon, MapPinIcon, HeartIcon, BoltIcon, PencilIcon, CheckIcon, XMarkIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import ReactECharts from 'echarts-for-react';
import { formatDuration, formatDistance, prepareTrainingChartData } from '../../utils/fitAnalysisUtils';
import { updateFitTraining, getAllTitles } from '../../services/api';
import api from '../../services/api';

const TrainingStats = ({ training, onDelete, onUpdate }) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [title, setTitle] = useState(training?.titleManual || training?.titleAuto || training?.originalFileName || '');
  const [description, setDescription] = useState(training?.description || '');
  const [saving, setSaving] = useState(false);
  const [allTitles, setAllTitles] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredTitles, setFilteredTitles] = useState([]);
  const titleInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const [intervalModalOpen, setIntervalModalOpen] = useState(false);
  const [selectedLapIndices, setSelectedLapIndices] = useState([]);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [modalError, setModalError] = useState('');
  const [userFTP, setUserFTP] = useState(null);

  // Load user FTP from profile
  useEffect(() => {
    const loadUserFTP = async () => {
      try {
        const response = await api.get('/user/profile');
        const profileData = response.data;
        // Get FTP from power zones (LTP2) or zone5 min (which is typically FTP)
        const ftp = profileData.powerZones?.cycling?.lt2 || 
                   profileData.powerZones?.cycling?.zone5?.min || 
                   null;
        setUserFTP(ftp);
      } catch (error) {
        console.error('Error loading user FTP:', error);
      }
    };
    if (training) {
      loadUserFTP();
    }
  }, [training]);

  // Update state when training changes
  useEffect(() => {
    if (training) {
      setTitle(training.titleManual || training.titleAuto || training.originalFileName || '');
      setDescription(training.description || '');
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
    const candidates = [
      lap.totalElapsedTime,
      lap.total_elapsed_time,
      lap.totalTimerTime,
      lap.total_timer_time,
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
                return `${p.seriesName}: ${p.value[1].toFixed(1)} km/h`;
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
          name: 'Speed (km/h)',
          position: 'left',
          min: 0,
          max: chartData.maxSpeed ? Math.ceil(chartData.maxSpeed * 1.1) : 10
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
  }, [training, lapDetails, selectedLapIndices]);

  // Calculate metrics (must be before early return)
  const calculateTSS = useMemo(() => {
    if (!training?.avgPower) return null;
    const seconds = training.totalElapsedTime || training.totalTimerTime || 0;
    if (seconds === 0) return null;
    
    // If FTP is available, calculate proper TSS
    if (userFTP && userFTP > 0) {
      // Simplified TSS calculation: TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
      // Using avgPower as NP approximation
      const np = training.avgPower;
      const tss = (seconds * Math.pow(np, 2)) / (Math.pow(userFTP, 2) * 3600) * 100;
      return Math.round(tss);
    }
    
    // Fallback: estimate TSS using a default FTP estimate (e.g., 250W)
    // This allows TSS to be displayed even without user FTP
    const estimatedFTP = 250; // Default estimate
    const np = training.avgPower;
    const tss = (seconds * Math.pow(np, 2)) / (Math.pow(estimatedFTP, 2) * 3600) * 100;
    return { value: Math.round(tss), estimated: true };
  }, [userFTP, training?.avgPower, training?.totalElapsedTime, training?.totalTimerTime]);

  const calculateIF = useMemo(() => {
    if (!training?.avgPower) return null;
    const ftp = userFTP || 250; // Use estimated FTP if not available
    // Intensity Factor = NP / FTP
    const np = training.avgPower;
    const ifValue = np / ftp;
    return ifValue.toFixed(2);
  }, [userFTP, training?.avgPower]);

  const totalTime = training?.totalElapsedTime || training?.totalTimerTime || 0;
  const avgCadence = training?.avgCadence || null;
  const maxPower = training?.maxPower || null;
  const maxHeartRate = training?.maxHeartRate || null;

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

  const handleSaveTitle = async () => {
    const trimmedTitle = title.trim();
    if ((training.titleManual || training.titleAuto || training.originalFileName || '') === trimmedTitle) {
      setIsEditingTitle(false);
      return;
    }
    initiateSave({ title: trimmedTitle || null });
  };

  const handleSaveDescription = async () => {
    const trimmedDescription = description.trim();
    initiateSave({ description: trimmedDescription || null });
  };

  const displayTitle = training?.titleManual || training?.titleAuto || training?.originalFileName || 'Untitled Training';

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
      {/* Title - Large and prominent */}
      <div className="mb-4 md:mb-6 pb-4 border-b border-gray-200/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-3 sm:gap-4">
          <div className="flex-1 w-full">
            {isEditingTitle ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <div className="relative flex-1 w-full">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => {
                      if (allTitles.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-primary/50 rounded-xl text-xl md:text-3xl font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white/90 shadow-sm"
                    placeholder="Enter title..."
                    autoFocus
                  />
                  {showSuggestions && filteredTitles.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute top-full left-0 right-0 mt-1 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto"
                    >
                      {filteredTitles.map((suggestion, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            setTitle(suggestion);
                            setShowSuggestions(false);
                          }}
                          className="px-4 py-2 bg-primary/10 hover:bg-primary/20 cursor-pointer text-sm transition-colors"
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTitle}
                    disabled={saving}
                    className="p-2 bg-greenos text-white rounded-xl disabled:opacity-50 shadow-md transition-colors hover:opacity-90"
                    title="Save title"
                  >
                    <CheckIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingTitle(false);
                      setTitle(displayTitle);
                    }}
                    className="p-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 shadow-md transition-colors"
                    title="Cancel"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-xl md:text-3xl font-bold text-gray-900">{displayTitle}</h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                  title="Edit title"
                >
                  <PencilIcon className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          {onDelete && (
            <button
              onClick={() => onDelete(training._id)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm flex-shrink-0 shadow-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>
      
      {/* Description - Prominent box */}
      <div className="mb-4 md:mb-6 p-4 md:p-5 bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm rounded-2xl border-2 border-primary/30 shadow-lg">
        <div className="flex items-start gap-2">
          {isEditingDescription ? (
            <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 px-4 py-3 border-2 border-primary/50 rounded-xl min-h-[100px] bg-white/90 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y shadow-sm"
                placeholder="Enter description..."
                autoFocus
              />
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={handleSaveDescription}
                  disabled={saving}
                    className="p-2 bg-greenos text-white rounded-xl hover:opacity-90 disabled:opacity-50 shadow-md transition-colors"
                  title="Save description"
                >
                  <CheckIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setIsEditingDescription(false);
                    setDescription(training?.description || '');
                  }}
                  className="p-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 shadow-md transition-colors"
                  title="Cancel"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 w-full group">
              <div className="flex-1">
                {description ? (
                  <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm md:text-base">{description}</p>
                ) : (
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="text-gray-500 italic hover:text-gray-700 w-full text-left py-2 transition-colors"
                  >
                    📝 Click to add description...
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsEditingDescription(true)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-all flex-shrink-0"
                title="Edit description"
              >
                <PencilIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-primary/30 bg-primary/10 shadow-sm">
            <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
              <ClockIcon className="w-4 h-4" />
              Duration
            </div>
            <div className="text-lg md:text-xl font-bold text-primary">
              {formatDuration(totalTime)}
            </div>
          </div>
          <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-primary/30 bg-primary/10 shadow-sm">
            <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
              <MapPinIcon className="w-4 h-4" />
              Distance
            </div>
            <div className="text-lg md:text-xl font-bold text-primary">
              {formatDistance(training.totalDistance)}
            </div>
          </div>
          <div className="bg-red/10 backdrop-blur-sm p-3 md:p-4 rounded-xl border border-red/30 shadow-sm">
            <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
              <HeartIcon className="w-4 h-4" />
              Avg Heart Rate
            </div>
            <div className="text-lg md:text-xl font-bold text-red">
              {training.avgHeartRate ? `${Math.round(training.avgHeartRate)} bpm` : '-'}
            </div>
            {maxHeartRate && (
              <div className="text-xs text-gray-500 mt-0.5">
                Max: {Math.round(maxHeartRate)} bpm
              </div>
            )}
          </div>
          <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-primary/30 bg-primary/10 shadow-sm">
            <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
              <BoltIcon className="w-4 h-4" />
              Avg Power
            </div>
            <div className="text-lg md:text-xl font-bold text-primary-dark">
              {training.avgPower ? `${Math.round(training.avgPower)} W` : '-'}
            </div>
            {maxPower && (
              <div className="text-xs text-gray-500 mt-0.5">
                Max: {Math.round(maxPower)} W
              </div>
            )}
          </div>
          {avgCadence && (
            <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-blue-300 bg-blue-50 shadow-sm">
              <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
                <CpuChipIcon className="w-4 h-4" />
                Avg Cadence
              </div>
              <div className="text-lg md:text-xl font-bold text-blue-700">
                {Math.round(avgCadence)} rpm
              </div>
            </div>
          )}
          {calculateTSS !== null && (
            <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-purple-300 bg-purple-50 shadow-sm">
              <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
                <BoltIcon className="w-4 h-4" />
                TSS
                {typeof calculateTSS === 'object' && calculateTSS.estimated && (
                  <span className="text-xs text-gray-400 ml-1" title="Estimated TSS (FTP not set in profile)">
                    *
                  </span>
                )}
              </div>
              <div className="text-lg md:text-xl font-bold text-purple-700">
                {typeof calculateTSS === 'object' ? calculateTSS.value : calculateTSS}
              </div>
              {calculateIF !== null && (
                <div className="text-xs text-gray-500 mt-0.5">
                  IF: {calculateIF}
                </div>
              )}
            </div>
          )}
          {training.avgSpeed && (
            <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-green-300 bg-green-50 shadow-sm">
              <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
                Avg Speed
              </div>
              <div className="text-lg md:text-xl font-bold text-green-700">
                {(training.avgSpeed * 3.6).toFixed(1)} km/h
              </div>
            </div>
          )}
          {training.totalAscent && training.totalAscent > 0 && (
            <div className="backdrop-blur-sm p-3 md:p-4 rounded-xl border border-orange-300 bg-orange-50 shadow-sm">
              <div className="text-xs md:text-sm text-gray-600 flex items-center gap-1 mb-1">
                Elevation
              </div>
              <div className="text-lg md:text-xl font-bold text-orange-700">
                +{Math.round(training.totalAscent)} m
              </div>
            </div>
          )}
        </div>
    </>
  );
};

export default TrainingStats;