import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getFitTrainings, getFitTraining, deleteFitTraining, createLap } from '../services/api';
import { motion } from 'framer-motion';
import CalendarView from '../components/Calendar/CalendarView';
import IntervalChart from '../components/FitAnalysis/IntervalChart';
import { getIntegrationStatus } from '../services/api';
import { listExternalActivities } from '../services/api';
import { getStravaActivityDetail, updateStravaActivity, updateStravaLactateValues, getAllTitles, createStravaLap, deleteStravaLap, getTrainingById, addTraining, updateTraining } from '../services/api';
import api from '../services/api';
import TrainingStats from '../components/FitAnalysis/TrainingStats';
import LapsTable from '../components/FitAnalysis/LapsTable';
import AthleteSelector from '../components/AthleteSelector';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import TrainingForm from '../components/TrainingForm';
import TrainingChart from '../components/FitAnalysis/TrainingChart';
import { prepareTrainingChartData, formatDuration, formatDistance } from '../utils/fitAnalysisUtils';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const deduplicateStravaLaps = (laps = []) => {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const seen = new Map();
  const unique = [];

  const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return null;
      // Round to nearest second to handle small differences
      return Math.floor(date.getTime() / 1000);
    } catch {
      return null;
    }
  };

  const buildKey = (lap, index, cumulativeTime = 0) => {
    // Priority 1: startTime or start_date (most reliable for identifying duplicates)
    const startTime = lap.startTime || lap.start_date;
    const normalizedTime = normalizeTime(startTime);
    if (normalizedTime !== null) {
      return `time_${normalizedTime}`;
    }
    
    // Priority 2: lapNumber (fallback when timestamp is unavailable)
    if (lap.lapNumber !== undefined && lap.lapNumber !== null) {
      return `lap_${lap.lapNumber}`;
    }
    
    // Priority 3: Combination of elapsed_time, distance, and power
    // Match backend key format: fallback_t${elapsedTime}_d${distance}_p${power}
    // Don't use cumulative time or hr/cadence to match backend deduplication
    const elapsedTime = Math.round(lap.elapsed_time || 0);
    const distance = Math.round((lap.distance || 0) * 10) / 10; // Round to 1 decimal
    const power = Math.round((lap.average_watts || 0) * 10) / 10; // Round to 1 decimal
    return `fallback_t${elapsedTime}_d${distance}_p${power}`;
  };

  let cumulativeTime = 0;
  laps.forEach((lap, index) => {
    const enriched = { ...lap };
    if (enriched.__sourceIndex === undefined || enriched.__sourceIndex === null) {
      enriched.__sourceIndex = index;
    }

    // Calculate cumulative time for this lap (before adding current lap duration)
    const key = buildKey(enriched, index, cumulativeTime);
    const hasLactate = enriched.lactate !== null && enriched.lactate !== undefined;

    if (seen.has(key)) {
      const existingIdx = seen.get(key);
      const existingLap = unique[existingIdx];
      const existingHasLactate = existingLap?.lactate !== null && existingLap?.lactate !== undefined;

      // Prefer lap with lactate, or keep the first one if both have or both don't have lactate
      if (hasLactate && !existingHasLactate) {
        unique[existingIdx] = enriched;
        // Update cumulative time even when replacing
        cumulativeTime += enriched.elapsed_time || 0;
      }
      // Don't update cumulative time for skipped duplicates
    } else {
      seen.set(key, unique.length);
      unique.push(enriched);
      // Update cumulative time for next lap
      cumulativeTime += enriched.elapsed_time || 0;
    }
  });


  return unique;
};

// Deduplicate FIT training laps
const deduplicateFitTrainingLaps = (laps = []) => {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const seen = new Map();
  const unique = [];

  const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return null;
      // Round to nearest second to handle small differences
      return Math.floor(date.getTime() / 1000);
    } catch {
      return null;
    }
  };

  laps.forEach((lap, index) => {
    // Strategy 1: Use _id if available (MongoDB ObjectId)
    if (lap._id) {
      const idStr = lap._id.toString();
      if (seen.has(`id_${idStr}`)) {
        console.log(`Deduplicate FIT: Skipping duplicate lap by _id at index ${index}`);
        return;
      }
      seen.set(`id_${idStr}`, true);
      unique.push(lap);
      return;
    }
    
    // Strategy 2: Use startTime or start_date as primary identifier
    const startTime = lap.startTime || lap.start_time || lap.start_date;
    if (startTime) {
      const normalizedTime = normalizeTime(startTime);
      if (normalizedTime !== null) {
        const key = `time_${normalizedTime}`;
        if (seen.has(key)) {
          return;
        }
        seen.set(key, true);
        unique.push(lap);
        return;
      }
    }
    
    // Strategy 3: Use combination of properties
    const elapsedTime = Math.round(lap.totalElapsedTime || lap.total_elapsed_time || lap.elapsed_time || 0);
    const distance = Math.round((lap.totalDistance || lap.total_distance || lap.distance || 0) * 10) / 10;
    const power = Math.round((lap.avgPower || lap.avg_power || lap.average_watts || 0) * 10) / 10;
    const hr = Math.round((lap.avgHeartRate || lap.avg_heart_rate || lap.average_heartrate || 0) * 10) / 10;
    
    const key = `t${elapsedTime}_d${distance}_p${power}_hr${hr}`;
    
    if (seen.has(key)) {
      return;
    }
    seen.set(key, index);
    unique.push(lap);
  });


  return unique;
};

// Unused config - kept for potential future use
// const INTERVAL_SENSITIVITY_CONFIG = {
//   high: {
//     label: 'High',
//     changeThreshold: 0.035, // More sensitive: 3.5% (between 3% and 4.5%) - detects smaller changes
//     stabilityWindow: 1.2, // More sensitive: 1.2 seconds (between 1s and 1.5s) - faster detection
//     minIntervalDuration: 4, // More sensitive: 4 seconds (catches shorter intervals)
//     mergeThreshold: 5, // More sensitive: 5 seconds (smaller gaps)
//     smoothingMultiplier: 0.32, // More sensitive: 0.32 (less smoothing, more sensitivity)
//     smoothingMin: 1
//   },
//   medium: {
//     label: 'Medium',
//     changeThreshold: 0.06, // Reduced from 0.1 to 0.06
//     stabilityWindow: 2, // Reduced from 3 to 2 seconds
//     minIntervalDuration: 6, // Reduced from 8 to 6 seconds
//     mergeThreshold: 10, // Reduced from 15 to 10 seconds
//     smoothingMultiplier: 0.5, // Reduced from 0.6
//     smoothingMin: 2
//   },
//   low: {
//     label: 'Low',
//     changeThreshold: 0.12, // Reduced from 0.18 to 0.12
//     stabilityWindow: 3, // Reduced from 4 to 3 seconds
//     minIntervalDuration: 10, // Reduced from 12 to 10 seconds
//     mergeThreshold: 20, // Reduced from 25 to 20 seconds
//     smoothingMultiplier: 0.7, // Reduced from 0.8
//     smoothingMin: 3
//   }
// };

// Strava Laps Table Component
const StravaLapsTable = ({ selectedStrava, stravaChartRef, maxTime, loadStravaDetail, loadExternalActivities, onExportToTraining, user = null }) => {
  const [editingLactate, setEditingLactate] = useState(false);
  const [lactateInputs, setLactateInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingMode, setEditingMode] = useState(false); // Mode for selecting intervals to merge
  const [selectedLapIndices, setSelectedLapIndices] = useState(new Set()); // Selected lap indices for merging
  const [isMobileTable, setIsMobileTable] = useState(window.innerWidth < 768);
  
  // Detect mobile (must be before early return)
  useEffect(() => {
    const handleResize = () => {
      setIsMobileTable(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use laps passed from selectedStrava (already deduplicated during load)
  const uniqueLaps = selectedStrava?.laps || [];

  const handleSaveLactate = async () => {
    const lactateValues = Object.entries(lactateInputs).map(([key, value]) => {
      const uniqueIndex = parseInt(key.replace('lap-', ''), 10);
      const uniqueLap = uniqueLaps[uniqueIndex];
      if (!uniqueLap) {
        console.warn('Could not find unique lap at index', uniqueIndex);
        return null;
      }
      
      const originalIndex = uniqueLap.__sourceIndex ?? uniqueIndex;

      if (originalIndex === undefined || originalIndex === null) {
        return null;
      }
      
      return {
        lapIndex: originalIndex,
        lactate: parseFloat(value)
      };
    }).filter(lv => lv && lv.lactate && !isNaN(lv.lactate));

    if (lactateValues.length === 0) {
      alert('Please enter at least one lactate value');
      return;
    }

    try {
      setSaving(true);
      await updateStravaLactateValues(selectedStrava.id, lactateValues);
      // Reload data to get updated laps with lactate values
      await loadStravaDetail(selectedStrava.id);
      setEditingLactate(false);
      setLactateInputs({});
      alert('Lactate values saved successfully!');
      // Show export dialog after saving lactate (with small delay to ensure data is loaded)
      if (onExportToTraining) {
        setTimeout(() => {
          onExportToTraining();
        }, 500);
      }
    } catch (error) {
      console.error('Error saving lactate:', error);
      alert('Error saving lactate values');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLap = async (lapIndex) => {
    if (!window.confirm('Are you sure you want to delete this interval? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      const uniqueLap = uniqueLaps[lapIndex];
      
      // Find the correct index in the original laps array
      // Use the same matching logic as deduplication
      const originalLaps = selectedStrava?.laps || [];
      let indexToDelete = -1;
      
      // Try to find by __sourceIndex first (if available and valid)
      if (uniqueLap?.__sourceIndex !== undefined && uniqueLap?.__sourceIndex !== null) {
        const sourceIdx = uniqueLap.__sourceIndex;
        if (sourceIdx >= 0 && sourceIdx < originalLaps.length) {
          // Verify it's the same lap by comparing key properties
          const sourceLap = originalLaps[sourceIdx];
          const matches = (
            (uniqueLap.startTime && sourceLap.startTime && uniqueLap.startTime === sourceLap.startTime) ||
            (uniqueLap.start_date && sourceLap.start_date && uniqueLap.start_date === sourceLap.start_date) ||
            (Math.abs((uniqueLap.elapsed_time || 0) - (sourceLap.elapsed_time || 0)) < 0.1 &&
             Math.abs((uniqueLap.distance || 0) - (sourceLap.distance || 0)) < 0.1 &&
             Math.abs((uniqueLap.average_watts || 0) - (sourceLap.average_watts || 0)) < 0.1)
          );
          if (matches) {
            indexToDelete = sourceIdx;
          }
        }
      }
      
      // If __sourceIndex didn't work, find by matching properties
      if (indexToDelete === -1) {
        for (let i = 0; i < originalLaps.length; i++) {
          const originalLap = originalLaps[i];
          
          // Match by startTime or start_date (most reliable)
          if (uniqueLap.startTime && originalLap.startTime && uniqueLap.startTime === originalLap.startTime) {
            indexToDelete = i;
            break;
          }
          if (uniqueLap.start_date && originalLap.start_date && uniqueLap.start_date === originalLap.start_date) {
            indexToDelete = i;
            break;
          }
          
          // Match by elapsed_time, distance, and power (fallback)
          const timeMatch = Math.abs((uniqueLap.elapsed_time || 0) - (originalLap.elapsed_time || 0)) < 0.1;
          const distanceMatch = Math.abs((uniqueLap.distance || 0) - (originalLap.distance || 0)) < 0.1;
          const powerMatch = Math.abs((uniqueLap.average_watts || 0) - (originalLap.average_watts || 0)) < 0.1;
          
          if (timeMatch && distanceMatch && powerMatch) {
            indexToDelete = i;
            break;
          }
        }
      }
      
      // Final fallback: use lapIndex if we couldn't find a match
      if (indexToDelete === -1) {
        console.warn('Could not find matching lap in original array, using index:', lapIndex);
        indexToDelete = lapIndex;
      }
      
      console.log('Deleting lap:', {
        uniqueIndex: lapIndex,
        originalIndex: indexToDelete,
        uniqueLap: {
          startTime: uniqueLap.startTime,
          elapsed_time: uniqueLap.elapsed_time,
          distance: uniqueLap.distance,
          average_watts: uniqueLap.average_watts
        }
      });
      
      await deleteStravaLap(selectedStrava.id, indexToDelete);
      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      alert('Interval deleted successfully!');
    } catch (error) {
      console.error('Error deleting lap:', error);
      alert('Error deleting interval: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllLaps = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL ${uniqueLaps.length} intervals? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingAll(true);
      // Collect all indices to delete, using originalIndex if available
      const indicesToDelete = uniqueLaps.map((lap, idx) => {
        const originalIndex = lap?.__sourceIndex;
        return (originalIndex !== undefined && originalIndex !== null) ? originalIndex : idx;
      });
      
      // Sort in descending order to avoid index shifting issues
      indicesToDelete.sort((a, b) => b - a);
      
      let deletedCount = 0;
      let errorCount = 0;

      // Delete from highest index to lowest to avoid index shifting
      for (const indexToDelete of indicesToDelete) {
        try {
          await deleteStravaLap(selectedStrava.id, indexToDelete);
          deletedCount++;
        } catch (error) {
          console.error('Error deleting lap at index', indexToDelete, ':', error);
          errorCount++;
        }
      }

      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      
      if (errorCount > 0) {
        alert(`Deleted ${deletedCount} intervals. ${errorCount} intervals could not be deleted.`);
      } else {
        alert(`Successfully deleted all ${deletedCount} intervals!`);
      }
    } catch (error) {
      console.error('Error deleting all laps:', error);
      alert('Error deleting intervals: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeletingAll(false);
    }
  };

  const handleToggleLapSelection = (lapIndex) => {
    setSelectedLapIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lapIndex)) {
        newSet.delete(lapIndex);
      } else {
        newSet.add(lapIndex);
      }
      return newSet;
    });
  };

  const handleMergeSelectedLaps = async () => {
    if (selectedLapIndices.size < 2) {
      alert('Please select at least 2 intervals to merge.');
      return;
    }

    const mergeCount = selectedLapIndices.size; // Save count before resetting
    if (!window.confirm(`Are you sure you want to merge ${mergeCount} intervals into one? This action cannot be undone.`)) {
      return;
    }

    try {
      setSaving(true);

      // Get activity start time (same logic as in graph rendering)
      const activityStartDateStr = selectedStrava?.start_date_local || 
                                   selectedStrava?.start_date || 
                                   selectedStrava?.raw?.start_date || 
                                   selectedStrava?.startDate;
      const activityStartDate = activityStartDateStr ? new Date(activityStartDateStr) : new Date();
      const activityStartTimeMs = activityStartDate.getTime();

      // Calculate start and end times for selected laps
      const selectedLaps = [];

      uniqueLaps.forEach((lap, idx) => {
        if (selectedLapIndices.has(idx)) {
          let startTimeSeconds = 0;
          
          // Use same logic as graph rendering to calculate startTime
          if (lap.startTime && typeof lap.startTime === 'string') {
            const lapStartTimeMs = new Date(lap.startTime).getTime();
            startTimeSeconds = (lapStartTimeMs - activityStartTimeMs) / 1000;
          } else if (lap.start_date) {
            const lapStartTimeMs = new Date(lap.start_date).getTime();
            startTimeSeconds = (lapStartTimeMs - activityStartTimeMs) / 1000;
          } else {
            // Fallback: calculate cumulative time
            let cumulativeTime = 0;
            for (let i = 0; i < idx; i++) {
              cumulativeTime += (uniqueLaps[i]?.elapsed_time || 0);
            }
            startTimeSeconds = cumulativeTime;
          }
          
          // Ensure startTime is not negative
          if (startTimeSeconds < 0) {
            startTimeSeconds = 0;
          }
          
          const duration = lap.elapsed_time || 0;
          const endTimeSeconds = startTimeSeconds + duration;
          
          selectedLaps.push({
            index: idx,
            startTime: startTimeSeconds,
            endTime: endTimeSeconds,
            originalIndex: lap?.__sourceIndex ?? idx
          });
        }
      });

      // Find min start and max end time
      if (selectedLaps.length === 0) {
        alert('No valid intervals found to merge.');
        return;
      }

      const minStartTime = Math.min(...selectedLaps.map(l => l.startTime));
      const maxEndTime = Math.max(...selectedLaps.map(l => l.endTime));

      // Validate time range
      if (minStartTime < 0 || maxEndTime <= minStartTime) {
        alert('Invalid time range for merged interval. Please try again.');
        return;
      }

      console.log('Merging intervals:', {
        selectedLaps: selectedLaps.length,
        minStartTime,
        maxEndTime,
        duration: maxEndTime - minStartTime
      });

      // Delete selected laps in reverse order (from highest index to lowest)
      const indicesToDelete = selectedLaps.map(l => l.originalIndex).sort((a, b) => b - a);
      
      for (const indexToDelete of indicesToDelete) {
        try {
          await deleteStravaLap(selectedStrava.id, indexToDelete);
        } catch (error) {
          console.error('Error deleting lap at index', indexToDelete, ':', error);
          throw error;
        }
      }

      // Small delay to ensure backend has processed deletions
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create merged interval
      const createResult = await createStravaLap(selectedStrava.id, {
        startTime: minStartTime,
        endTime: maxEndTime
      });

      console.log('Created merged interval:', createResult);

      // Reload data to get updated intervals
      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      
      setEditingMode(false);
      setSelectedLapIndices(new Set());
      alert(`Successfully merged ${mergeCount} intervals into one!`);
    } catch (error) {
      console.error('Error merging laps:', error);
      alert('Error merging intervals: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (!selectedStrava?.laps || uniqueLaps.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4">Intervals</h3>
        <p className="text-sm text-gray-600">No intervals available</p>
      </div>
    );
  }

  return (
    <div>
      <div className={`flex flex-col ${isMobileTable ? 'gap-2' : 'sm:flex-row justify-between items-start sm:items-center gap-3'} ${isMobileTable ? 'mb-2' : 'mb-4'}`}>
        <h3 className={`${isMobileTable ? 'text-sm' : 'text-base sm:text-lg'} font-semibold`}>Intervals</h3>
        <div className={`flex gap-1.5 sm:gap-2 ${isMobileTable ? 'flex-col' : 'w-full sm:w-auto flex-wrap'}`}>
        <button
          onClick={() => {
            setEditingLactate(!editingLactate);
            if (editingLactate) {
              setEditingMode(false);
              setSelectedLapIndices(new Set());
            }
          }}
          className={`${isMobileTable ? 'px-2.5 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} bg-primary text-white ${isMobileTable ? 'rounded-lg' : 'rounded-xl'} hover:bg-primary-dark shadow-md transition-colors ${isMobileTable ? 'w-full' : 'w-full sm:w-auto'}`}
        >
          {editingLactate ? 'Cancel Edit' : 'Add Lactate'}
        </button>
     
        {editingMode && selectedLapIndices.size >= 2 && (
          <button
            onClick={handleMergeSelectedLaps}
            disabled={saving}
            className={`${isMobileTable ? 'px-2.5 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} bg-blue-600 text-white ${isMobileTable ? 'rounded-lg' : 'rounded-xl'} hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors ${isMobileTable ? 'w-full' : 'w-full sm:w-auto'}`}
          >
            {saving ? 'Merging...' : `Merge ${selectedLapIndices.size} Selected`}
          </button>
        )}
        <button
          onClick={handleDeleteAllLaps}
          disabled={deletingAll || saving || uniqueLaps.length === 0 || editingMode}
          className={`${isMobileTable ? 'px-2.5 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} bg-red-600 text-white ${isMobileTable ? 'rounded-lg' : 'rounded-xl'} hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors ${isMobileTable ? 'w-full' : 'w-full sm:w-auto'}`}
        >
          {deletingAll ? 'Deleting...' : 'Delete All Intervals'}
        </button>
        {onExportToTraining && (
          <button
            onClick={() => onExportToTraining()}
            disabled={editingMode}
            className={`${isMobileTable ? 'px-2.5 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} bg-greenos text-white ${isMobileTable ? 'rounded-lg' : 'rounded-xl'} hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors ${isMobileTable ? 'w-full' : 'w-full sm:w-auto'}`}
          >
            Export to Training
          </button>
        )}
        </div>
      </div>
      <div className={`overflow-x-auto ${isMobileTable ? '-mx-1' : '-mx-2 sm:mx-0'}`}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {editingMode && (
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                  <input
                    type="checkbox"
                    checked={selectedLapIndices.size === uniqueLaps.length && uniqueLaps.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLapIndices(new Set(uniqueLaps.map((_, idx) => idx)));
                      } else {
                        setSelectedLapIndices(new Set());
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                  />
                </th>
              )}
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Distance</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Avg Speed</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg HR</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Power</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Lactate</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {uniqueLaps.map((lap, index) => {
              // Calculate cumulative time for this lap
              let cumulativeTime = 0;
              for (let i = 0; i < index; i++) {
                cumulativeTime += (uniqueLaps[i]?.elapsed_time || 0);
              }
              const startTime = cumulativeTime;
              const endTime = cumulativeTime + (lap.elapsed_time || 0);
              
              return (
                <tr 
                  key={index}
                  onClick={(e) => {
                    // Don't zoom if clicking on checkbox, lactate input, or delete button
                    if (editingMode && e.target.type === 'checkbox') return;
                    if (editingLactate && e.target.tagName === 'INPUT') return;
                    if (e.target.closest('button')) return;
                    if (!stravaChartRef.current || editingMode) return;
                    
                    const chart = stravaChartRef.current.getEchartsInstance();
                    const startTimeMin = startTime / 60;
                    const endTimeMin = endTime / 60;
                    const maxTimeMin = maxTime / 60;
                    
                    // Calculate zoom percentages
                    const startPercent = (startTimeMin / maxTimeMin) * 100;
                    const endPercent = (endTimeMin / maxTimeMin) * 100;
                    
                    // Add some padding (10% on each side)
                    const padding = Math.max(5, (endPercent - startPercent) * 0.1);
                    const zoomStart = Math.max(0, startPercent - padding);
                    const zoomEnd = Math.min(100, endPercent + padding);
                    
                    chart.dispatchAction({
                      type: 'dataZoom',
                      start: zoomStart,
                      end: zoomEnd
                    });
                  }}
                  className={`${lap.lactate ? 'bg-purple-50' : ''} ${selectedLapIndices.has(index) ? 'bg-blue-100' : ''} ${!editingLactate && !editingMode ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                >
                  {editingMode && (
                    <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLapIndices.has(index)}
                        onChange={() => handleToggleLapSelection(index)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{index + 1}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{formatDuration(lap.elapsed_time)}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden sm:table-cell">{formatDistance(lap.distance, user)}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm hidden md:table-cell">{lap.average_speed ? `${(lap.average_speed*3.6).toFixed(1)} km/h` : '-'}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '-'}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{lap.average_watts ? `${Math.round(lap.average_watts)} W` : '-'}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm" onClick={(e) => e.stopPropagation()}>
                    {editingLactate ? (
                      <input
                        type="number"
                        step="0.1"
                        placeholder="mmol/L"
                        value={lactateInputs[`lap-${index}`] || lap.lactate || ''}
                        onChange={(e) => setLactateInputs({
                          ...lactateInputs,
                          [`lap-${index}`]: e.target.value
                        })}
                        className="w-16 sm:w-20 md:w-24 px-1.5 sm:px-2 py-1 sm:py-1.5 border rounded text-xs sm:text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '-'
                    )}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDeleteLap(index)}
                      disabled={saving}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
                      title="Delete interval"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingLactate && (
        <div className={`${isMobileTable ? 'mt-2' : 'mt-4'} flex flex-col sm:flex-row justify-end gap-2`}>
          <button
            onClick={() => {
              setEditingLactate(false);
              setLactateInputs({});
            }}
            className={`${isMobileTable ? 'px-2.5 py-1.5 text-xs' : 'px-3 sm:px-4 py-2 text-sm'} bg-gray-600 text-white ${isMobileTable ? 'rounded-md' : 'rounded-md'} hover:bg-gray-700 ${isMobileTable ? 'w-full' : 'w-full sm:w-auto'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveLactate}
            disabled={saving}
            className={`${isMobileTable ? 'px-2.5 py-1.5 text-xs' : 'px-3 sm:px-4 py-2 text-sm'} bg-greenos text-white ${isMobileTable ? 'rounded-lg' : 'rounded-xl'} hover:opacity-90 disabled:opacity-50 shadow-md transition-colors ${isMobileTable ? 'w-full' : 'w-full sm:w-auto'}`}
          >
            {saving ? 'Saving...' : 'Save Lactate Values'}
          </button>
        </div>
      )}
    </div>
  );
};

const FitAnalysisPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const { activityId } = useParams();
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [regularTrainings, setRegularTrainings] = useState([]); // Trainings from /training route
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [selectedLapNumber, setSelectedLapNumber] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset selected lap when training changes
  useEffect(() => {
    setSelectedLapNumber(null);
  }, [selectedTraining?._id]);
  
  // Training chart hover state
  const [hoveredTrainingRecord, setHoveredTrainingRecord] = useState(null);
  const [trainingTooltipPosition, setTrainingTooltipPosition] = useState({ x: 0, y: 0 });
  const trainingChartRef = useRef(null);
  
  // Zoom state for training chart
  const [trainingZoom, setTrainingZoom] = useState({ min: 0, max: 1, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, time: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, time: 0 });
  const [showCreateLapButton, setShowCreateLapButton] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState({ start: 0, end: 0 });
  const [selectionStats, setSelectionStats] = useState(null);
  const dragStateRef = useRef({ isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } });
  const [, setGarminConnected] = useState(false);
  const [externalActivities, setExternalActivities] = useState([]);
  const [selectedStrava, setSelectedStrava] = useState(null);
  const [selectedStravaStreams, setSelectedStravaStreams] = useState(null);
  const stravaChartRef = useRef(null);
  const formatDateTime = useCallback((dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch (e) {
      return dateStr;
    }
  }, []);
  const stravaActivityDate = selectedStrava?.start_date_local || selectedStrava?.start_date || selectedStrava?.startDate;
  const stravaActivityTitle = selectedStrava?.name || selectedStrava?.titleManual || 'Strava Activity';
  const stravaActivitySport = selectedStrava?.sport_type || selectedStrava?.type || selectedStrava?.sport;
  const stravaActivityDuration = selectedStrava?.moving_time || selectedStrava?.elapsed_time || null;
  const stravaElevationGain = selectedStrava?.total_elevation_gain;
  const hasStravaElevation = stravaElevationGain !== null && stravaElevationGain !== undefined && stravaElevationGain > 0;
  
  // Strava metrics
  const stravaAvgPower = selectedStrava?.average_watts || selectedStrava?.avg_power || null;
  const stravaAvgCadence = selectedStrava?.average_cadence || selectedStrava?.avg_cadence || null;
  const stravaNormalizedPower = selectedStrava?.weighted_average_watts || selectedStrava?.normalized_power || null;
  const stravaMaxPower = selectedStrava?.max_watts || selectedStrava?.max_power || null;
  
  // Calculate TSS for Strava activity
  const [userFTP, setUserFTP] = React.useState(null);
  const [userProfile, setUserProfile] = React.useState(null);
  React.useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        const profileData = response.data;
        setUserProfile(profileData);
        const ftp = profileData.powerZones?.cycling?.lt2 || 
                   profileData.powerZones?.cycling?.zone5?.min || 
                   null;
        setUserFTP(ftp);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadUserProfile();
  }, []);
  
  // Check if Strava activity is running
  const stravaSport = selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '';
  const isStravaRun = stravaSport.toLowerCase().includes('run') || stravaSport.toLowerCase() === 'walk' || stravaSport.toLowerCase() === 'hike';
  const stravaAvgSpeed = selectedStrava?.average_speed || selectedStrava?.avgSpeed || null;
  
  const calculateStravaTSS = React.useMemo(() => {
    if (!stravaActivityDuration) return null;
    const seconds = stravaActivityDuration;
    if (seconds === 0) return null;
    
    // For running: calculate TSS from pace
    if (isStravaRun && stravaAvgSpeed && stravaAvgSpeed > 0) {
      const avgPaceSeconds = Math.round(1000 / stravaAvgSpeed); // seconds per km
      const thresholdPace = userProfile?.powerZones?.running?.lt2 || null; // Threshold pace in seconds per km
      let referencePace = thresholdPace;
      // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
      if (!referencePace || referencePace <= 0) {
        referencePace = avgPaceSeconds;
      }
      // Running TSS formula: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
      // Faster pace (lower seconds) = higher intensity = higher TSS
      const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
      const tss = Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      return { value: tss, estimated: !thresholdPace };
    }
    
    // For cycling: calculate TSS from power
    if (!stravaAvgPower) return null;
    const ftp = userFTP || 250; // Use estimated FTP if not available
    const np = stravaNormalizedPower || stravaAvgPower; // Use NP if available, otherwise avg power
    const tss = (seconds * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100;
    return { value: Math.round(tss), estimated: !userFTP };
  }, [userFTP, userProfile, stravaAvgPower, stravaNormalizedPower, stravaActivityDuration, isStravaRun, stravaAvgSpeed]);
  
  const calculateStravaIF = React.useMemo(() => {
    // For running: calculate IF from pace
    if (isStravaRun && stravaAvgSpeed && stravaAvgSpeed > 0) {
      const avgPaceSeconds = Math.round(1000 / stravaAvgSpeed);
      const thresholdPace = userProfile?.powerZones?.running?.lt2 || avgPaceSeconds;
      const ifValue = thresholdPace / avgPaceSeconds; // > 1 if faster than threshold
      return ifValue.toFixed(2);
    }
    
    // For cycling: calculate IF from power
    if (!stravaAvgPower) return null;
    const ftp = userFTP || 250;
    const np = stravaNormalizedPower || stravaAvgPower;
    const ifValue = np / ftp;
    return ifValue.toFixed(2);
  }, [userFTP, userProfile, stravaAvgPower, stravaNormalizedPower, isStravaRun, stravaAvgSpeed]);
  
  // Strava interval creation state
  const [showStravaCreateLapButton, setShowStravaCreateLapButton] = useState(false);
  const [stravaSelectedTimeRange, setStravaSelectedTimeRange] = useState({ start: 0, end: 0 });
  const [stravaSelectionStats, setStravaSelectionStats] = useState(null);
  const stravaDragStateRef = useRef({ isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } });
  
  // Smoothness state
  const [smoothingWindow] = useState(5); // seconds
  
  // Export to Training state
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingFormData, setTrainingFormData] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Helper function to get GPS data from training or Strava
  const getGpsData = React.useMemo(() => {
    if (selectedStrava && selectedStravaStreams) {
      // Get GPS from Strava latlng stream
      const latlngArray = selectedStravaStreams?.latlng?.data || selectedStravaStreams?.latlng || [];
      if (latlngArray.length > 0) {
        return latlngArray.map(([lat, lng]) => [lat, lng]).filter(p => p[0] != null && p[1] != null);
      }
    } else if (selectedTraining && selectedTraining.records) {
      // Get GPS from FIT file records
      return selectedTraining.records
        .filter(r => r.positionLat != null && r.positionLong != null)
        .map(r => [
          r.positionLat / 11930464.711111111, // Convert from semicircles to degrees
          r.positionLong / 11930464.711111111
        ]);
    }
    return [];
  }, [selectedStrava, selectedStravaStreams, selectedTraining]);
  
  // Smoothing function
  const smoothData = React.useCallback((data, windowSizeSeconds, timeArray) => {
    if (!data || data.length === 0 || windowSizeSeconds <= 0) return data;
    if (!timeArray || timeArray.length !== data.length) return data;
    
    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
      const currentTime = timeArray[i];
      const windowStart = currentTime - windowSizeSeconds / 2;
      const windowEnd = currentTime + windowSizeSeconds / 2;
      
      const valuesInWindow = [];
      for (let j = 0; j < data.length; j++) {
        if (timeArray[j] >= windowStart && timeArray[j] <= windowEnd) {
          const val = data[j];
          if (val != null && !isNaN(val) && val > 0) {
            valuesInWindow.push(val);
          }
        }
      }
      
      smoothed.push(valuesInWindow.length > 0 
        ? valuesInWindow.reduce((a, b) => a + b, 0) / valuesInWindow.length 
        : data[i]);
    }
    return smoothed;
  }, []);

  useEffect(() => {
    // Always load trainings first, then check for trainingId in URL params
    const params = new URLSearchParams(window.location.search);
    const trainingId = params.get('trainingId');
    const fitTrainingId = params.get('fitTrainingId');
    const stravaId = params.get('stravaId');

    const openFromActivityId = (rawId) => {
      if (!rawId) return;
      const id = String(rawId);
      if (id.startsWith('strava-')) {
        loadStravaDetail(id.replace('strava-', ''));
        return;
      }
      if (id.startsWith('regular-')) {
        loadRegularTrainingDetail(id.replace('regular-', ''));
        return;
      }
      if (id.startsWith('fit-')) {
        loadTrainingDetail(id.replace('fit-', ''));
        return;
      }
      if (id.startsWith('training-')) {
        loadTrainingFromTrainingModel(id.replace('training-', ''));
        return;
      }
      // Backwards-compat (old links might be just raw FitTraining _id)
      loadTrainingDetail(id);
    };
    
    const initialize = async () => {
      await loadTrainings();
      await loadRegularTrainings();
      await loadExternalActivities();

      // Canonical path: /training-calendar/:activityId
      if (activityId) {
        setTimeout(() => {
          openFromActivityId(activityId);
        }, 200);
        return;
      }
      
    if (trainingId) {
        // Wait a bit for trainings to be loaded before loading specific training
        setTimeout(() => {
          // Move to canonical URL with id at the end
          navigate(`/training-calendar/${encodeURIComponent(`training-${trainingId}`)}`, { replace: true });
          openFromActivityId(`training-${trainingId}`);
        }, 200);
      } else if (fitTrainingId) {
        // Open a FitTraining directly
        setTimeout(() => {
          navigate(`/training-calendar/${encodeURIComponent(`fit-${fitTrainingId}`)}`, { replace: true });
          openFromActivityId(`fit-${fitTrainingId}`);
        }, 200);
      } else if (stravaId) {
        // Wait a bit for activities to be loaded before loading specific Strava activity
        setTimeout(() => {
          navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaId}`)}`, { replace: true });
          openFromActivityId(`strava-${stravaId}`);
        }, 200);
    }
    };
    
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await getIntegrationStatus();
        setGarminConnected(Boolean(status.garminConnected));
      } catch (e) {
        // ignore if not logged
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      checkStatus();
      loadExternalActivities();
      const url = window.location.pathname;
      window.history.replaceState({}, '', url);
    } else {
      checkStatus();
      loadExternalActivities();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStravaDetail = useCallback(async (id, { overrideTitle = null } = {}) => {
    try {
      // For coach, pass selectedAthleteId to get athlete's Strava token
      const athleteId = user?.role === 'coach' ? selectedAthleteId : null;
      const data = await getStravaActivityDetail(id, athleteId);
      
      const rawLaps = Array.isArray(data.laps) ? data.laps : [];

    
      
      // Deduplicate laps before setting state using the same function as elsewhere
      let uniqueLaps = deduplicateStravaLaps(rawLaps);
      
      console.log('After deduplication:', uniqueLaps.length);
      
      // Merge titleManual, description, and category into detail object
      const detailWithMeta = {
        ...data.detail,
        titleManual: data.titleManual,
        description: data.description,
        category: data.category || null,
        laps: uniqueLaps,
        rawLaps
      };

      // Allow overriding title from Training model (without mutating Strava activity in DB)
      if (overrideTitle && typeof overrideTitle === 'string' && overrideTitle.trim()) {
        detailWithMeta.titleManual = overrideTitle.trim();
      }
      
      // Ensure streams data is properly set
      if (!data.streams) {
        console.warn('No streams data received from API');
        return;
      }
      
      setSelectedStrava(detailWithMeta);
      setSelectedStravaStreams(data.streams);
      setSelectedTraining(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedStravaId', String(id));
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
    } catch (e) {
      // Handle 429 (Too Many Requests) specifically - don't log as error
      if (e.response?.status === 429 || (e.code === 'ERR_BAD_REQUEST' && e.response?.status === 429)) {
        console.warn('Strava API rate limit exceeded. Please try again in a few minutes.');
        // Don't clear state on rate limit - keep what we have
        return;
      }
      
      // Handle 401 (Unauthorized) - token expired or invalid
      if (e.response?.status === 401) {
        console.error('Strava token expired or invalid. Please reconnect your Strava account.');
        addNotification('Strava token expired. Please reconnect your Strava account in Settings.', 'error');
        // Don't clear state - user might want to see cached data
        return;
      }
      
      // Only log non-429/401 errors
      console.error('Error loading Strava detail:', e);
      
      // Remove invalid ID from localStorage
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      // Clear state on error
      setSelectedStrava(null);
      setSelectedStravaStreams(null);
    }
  }, [selectedAthleteId, user?.role, addNotification]);

  const loadExternalActivities = useCallback(async () => {
    try {
      // For athlete, don't send athleteId (backend will use their own userId)
      // For coach, send athleteId if selected, otherwise don't load activities (coach should select an athlete)
      const athleteId = user?.role === 'athlete' ? null : selectedAthleteId;
      
      // If coach but no athlete selected, don't load activities
      if (user?.role === 'coach' && !athleteId) {
        setExternalActivities([]);
        return;
      }
      
      const params = athleteId ? { athleteId } : {};
      const acts = await listExternalActivities(params);
      setExternalActivities(acts || []);
      
      // Check if we should restore Strava selection (only on initial load or when athlete changes)
      const savedStravaId = localStorage.getItem('fitAnalysis_selectedStravaId');
      if (savedStravaId) {
        // Verify the activity still exists
        const activityExists = acts?.some(a => String(a.stravaId) === savedStravaId);
        if (activityExists) {
          // Only load if not already selected (to avoid unnecessary API calls)
          if (!selectedStrava || String(selectedStrava.id) !== savedStravaId) {
            loadStravaDetail(savedStravaId);
          }
        } else {
          // Activity no longer exists, remove from localStorage
          localStorage.removeItem('fitAnalysis_selectedStravaId');
        }
      }
    } catch (e) {
      // Handle rate limit errors gracefully
      if (e.response?.status === 429) {
        console.warn('Rate limit exceeded when loading external activities. Please wait a moment.');
        // Don't show error to user, just log it
        return;
      }
      console.error('Error loading external activities:', e);
    }
  }, [selectedAthleteId, user?.role, selectedStrava, loadStravaDetail]);

  // Training chart zoom and drag handlers - must be at top level (not conditionally rendered)
  useEffect(() => {
    const container = trainingChartRef.current;
    if (!container || !selectedTraining || !selectedTraining.records || selectedTraining.records.length === 0) return;

    const chartData = prepareTrainingChartData(selectedTraining);
    if (!chartData) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const graphWidth = 800 - padding.left - padding.right;

    // Convert screen X to time value - exposed to component scope
    window.screenXToTime = (screenX) => {
      const containerRect = container.getBoundingClientRect();
      const relativeX = screenX - containerRect.left - padding.left;
      const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
      const zoomedMinTime = chartData.maxTime * trainingZoom.min;
      const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
      const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
      const time = zoomedMinTime + (normalizedX * zoomedTimeRange);
      return Math.max(0, Math.min(chartData.maxTime, time));
    };

    const screenXToTime = window.screenXToTime;

    // Use ref for dragState so it can be accessed from overlay div handlers
    if (!dragStateRef.current || !dragStateRef.current.isActive) {
      dragStateRef.current = { isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } };
    }

    const wheelHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - padding.left;
      const mouseRatio = Math.max(0, Math.min(1, mouseX / graphWidth));
      
      setTrainingZoom(prev => {
        const currentRange = prev.max - prev.min;
        const newRange = Math.max(0.05, Math.min(1, currentRange * delta));
        
        if (newRange !== currentRange) {
          const centerTimeRatio = prev.min + currentRange * mouseRatio;
          const newMin = Math.max(0, centerTimeRatio - newRange * mouseRatio);
          const newMax = Math.min(1, newMin + newRange);
          
          return {
            min: newMin,
            max: newMax,
            scale: 1 / newRange
          };
        }
        return prev;
      });
    };
    
    const mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      
      // Don't interfere if clicking on buttons or other interactive elements
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      // Check if click is inside the container
      const containerRect = container.getBoundingClientRect();
      const clickX = e.clientX - containerRect.left;
      const clickY = e.clientY - containerRect.top;
      
      // Allow drag if clicking in the graph area (not on buttons or other UI elements)
      if (clickX < padding.left || clickX > containerRect.width - padding.right || 
          clickY < padding.top || clickY > containerRect.height - padding.bottom) {
        return;
      }
      
      const startTime = screenXToTime(e.clientX);
      dragStateRef.current.isActive = true;
      dragStateRef.current.start = { x: clickX, time: startTime };
      dragStateRef.current.end = { x: clickX, time: startTime };
      setIsDragging(true);
      setDragStart({ x: dragStateRef.current.start.x, time: startTime });
      setDragEnd({ x: dragStateRef.current.end.x, time: startTime });
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseLeaveHandler = () => {
      if (dragStateRef.current.isActive) {
        dragStateRef.current.isActive = false;
        dragStateRef.current.start = { x: 0, time: 0 };
        dragStateRef.current.end = { x: 0, time: 0 };
        setIsDragging(false);
        setDragStart({ x: 0, time: 0 });
        setDragEnd({ x: 0, time: 0 });
      }
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!dragStateRef.current.isActive) return;
      
      const endTime = screenXToTime(e.clientX);
      const containerRect = container.getBoundingClientRect();
      const endX = e.clientX - containerRect.left;
      dragStateRef.current.end = { x: endX, time: endTime };
      setDragEnd({ x: endX, time: endTime });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!dragStateRef.current.isActive) return;
      
      const startTime = Math.min(dragStateRef.current.start.time, dragStateRef.current.end.time);
      const endTime = Math.max(dragStateRef.current.start.time, dragStateRef.current.end.time);
      const timeRange = Math.abs(endTime - startTime);
      
      // If user wants to create a lap (hold Shift), show create lap button instead of zooming
      if (e.shiftKey && timeRange > chartData.maxTime * 0.01) {
        setSelectedTimeRange({ start: startTime, end: endTime });
        setShowCreateLapButton(true);
      } else if (timeRange > chartData.maxTime * 0.01) {
        // Normal zoom behavior
        const newMin = startTime / chartData.maxTime;
        const newMax = endTime / chartData.maxTime;
        const newScale = 1 / (newMax - newMin);
        
        setTrainingZoom({
          min: newMin,
          max: newMax,
          scale: newScale
        });
      }
      
      dragStateRef.current.isActive = false;
      dragStateRef.current.start = { x: 0, time: 0 };
      dragStateRef.current.end = { x: 0, time: 0 };
      setIsDragging(false);
      setDragStart({ x: 0, time: 0 });
      setDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
    // Keep container mousedown for fallback, but overlay div will handle most drags
    container.addEventListener('mousedown', mouseDownHandler);
    container.addEventListener('mouseleave', mouseLeaveHandler);
    document.addEventListener('mousemove', mouseMoveGlobalHandler);
    document.addEventListener('mouseup', mouseUpGlobalHandler);
    
    return () => {
      container.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('mousedown', mouseDownHandler);
      container.removeEventListener('mouseleave', mouseLeaveHandler);
      document.removeEventListener('mousemove', mouseMoveGlobalHandler);
      document.removeEventListener('mouseup', mouseUpGlobalHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTraining?._id, trainingZoom, isDragging]);

  // Strava chart drag selection handlers
  useEffect(() => {
    if (!selectedStrava || !selectedStravaStreams) return;
    
    const container = document.getElementById('strava-chart-container');
    if (!container) return;
    
    // Get time array - could be time.data or time array directly
    const timeArray = selectedStravaStreams.time?.data || selectedStravaStreams.time || [];
    const maxTime = timeArray.length > 0 ? timeArray[timeArray.length - 1] : 0;
    
    if (maxTime === 0) {
      return;
    }
    
    const chartLeft = 60;
    const chartRight = 50;
    const chartTop = 60;
    const chartBottom = 80;
    
    // Helper function to get current maxTime from streams
    const getMaxTime = () => {
      const currentTimeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
      return currentTimeArray.length > 0 ? currentTimeArray[currentTimeArray.length - 1] : 0;
    };
    
    const mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      
      // Don't interfere if clicking on buttons
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) return;
      
      const chartRect = container.getBoundingClientRect();
      const clickX = e.clientX - chartRect.left;
      const clickY = e.clientY - chartRect.top;
      
      if (clickX < chartLeft || clickX > chartRect.width - chartRight ||
          clickY < chartTop || clickY > chartRect.height - chartBottom) {
        return;
      }
      
      const currentMaxTime = getMaxTime();
      if (currentMaxTime === 0) {
        return;
      }
      
      const chartWidth = chartRect.width - chartLeft - chartRight;
      const relativeX = clickX - chartLeft;
      const normalizedX = Math.max(0, Math.min(1, relativeX / chartWidth));
      
      // Get zoom state from chart if available
      let timeInSeconds = normalizedX * currentMaxTime;
      if (stravaChartRef.current) {
        try {
          const chart = stravaChartRef.current.getEchartsInstance();
          const option = chart.getOption();
          const dataZoom = option.dataZoom?.[0];
          if (dataZoom && dataZoom.start !== undefined && dataZoom.end !== undefined) {
            // Chart is zoomed - adjust time calculation
            const zoomStart = dataZoom.start / 100; // Convert percentage to ratio
            const zoomEnd = dataZoom.end / 100;
            const zoomRange = zoomEnd - zoomStart;
            const zoomedMinTime = currentMaxTime * zoomStart;
            timeInSeconds = zoomedMinTime + (normalizedX * zoomRange * currentMaxTime);
          }
        } catch (e) {
          // Fallback to original calculation if chart access fails
          timeInSeconds = normalizedX * currentMaxTime;
        }
      }
      
      stravaDragStateRef.current.isActive = true;
      stravaDragStateRef.current.start = { x: clickX, time: timeInSeconds };
      stravaDragStateRef.current.end = { x: clickX, time: timeInSeconds };
      
      setStravaIsDragging(true);
      setStravaDragStart({ x: clickX, time: timeInSeconds });
      setStravaDragEnd({ x: clickX, time: timeInSeconds });
      
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!stravaDragStateRef.current.isActive) return;
      
      const chartRect = container.getBoundingClientRect();
      const clickX = e.clientX - chartRect.left;
      const currentMaxTime = getMaxTime();
      const chartWidth = chartRect.width - chartLeft - chartRight;
      const relativeX = clickX - chartLeft;
      const normalizedX = Math.max(0, Math.min(1, relativeX / chartWidth));
      
      // Get zoom state from chart if available
      let timeInSeconds = normalizedX * currentMaxTime;
      if (stravaChartRef.current) {
        try {
          const chart = stravaChartRef.current.getEchartsInstance();
          const option = chart.getOption();
          const dataZoom = option.dataZoom?.[0];
          if (dataZoom && dataZoom.start !== undefined && dataZoom.end !== undefined) {
            // Chart is zoomed - adjust time calculation
            const zoomStart = dataZoom.start / 100; // Convert percentage to ratio
            const zoomEnd = dataZoom.end / 100;
            const zoomRange = zoomEnd - zoomStart;
            const zoomedMinTime = currentMaxTime * zoomStart;
            timeInSeconds = zoomedMinTime + (normalizedX * zoomRange * currentMaxTime);
          }
        } catch (e) {
          // Fallback to original calculation if chart access fails
          timeInSeconds = normalizedX * currentMaxTime;
        }
      }
      
      stravaDragStateRef.current.end = { x: clickX, time: timeInSeconds };
      setStravaDragEnd({ x: clickX, time: timeInSeconds });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!stravaDragStateRef.current.isActive) return;
      
      const currentMaxTime = getMaxTime();
      const startTime = Math.min(stravaDragStateRef.current.start.time, stravaDragStateRef.current.end.time);
      const endTime = Math.max(stravaDragStateRef.current.start.time, stravaDragStateRef.current.end.time);
      const timeRange = Math.abs(endTime - startTime);
      
      if (e.shiftKey && timeRange > currentMaxTime * 0.01) {
        if (stravaChartRef.current) {
          const chart = stravaChartRef.current.getEchartsInstance();
          const startPercent = (startTime / currentMaxTime) * 100;
          const endPercent = (endTime / currentMaxTime) * 100;
          chart.dispatchAction({
            type: 'dataZoom',
            start: startPercent,
            end: endPercent
          });
        }
      } else if (timeRange > currentMaxTime * 0.01) {
        setStravaSelectedTimeRange({ start: startTime, end: endTime });
        const calculateStats = (sTime, eTime) => {
          const time = timeArray;
          const speed = selectedStravaStreams.velocity_smooth?.data || selectedStravaStreams.velocity_smooth || [];
          const hr = selectedStravaStreams.heartrate?.data || selectedStravaStreams.heartrate || [];
          const power = selectedStravaStreams.watts?.data || selectedStravaStreams.watts || [];
          
          const selectedIndices = [];
          for (let i = 0; i < time.length; i++) {
            if (time[i] >= sTime && time[i] <= eTime) {
              selectedIndices.push(i);
            }
          }
          
          if (selectedIndices.length === 0) return null;
          
          const speeds = selectedIndices.map(i => speed[i]).filter(v => v && v > 0);
          const heartRates = selectedIndices.map(i => hr[i]).filter(v => v && v > 0);
          const powers = selectedIndices.map(i => power[i]).filter(v => v && v > 0);
          
          const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
          const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
          const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
          const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
          const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
          const maxPower = powers.length > 0 ? Math.max(...powers) : null;
          const totalDistance = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) * (eTime - sTime) / selectedIndices.length : null;

    return {
            duration: eTime - sTime,
            totalDistance,
            avgSpeed: avgSpeed ? (avgSpeed * 3.6).toFixed(1) : null,
            maxSpeed: maxSpeed ? (maxSpeed * 3.6).toFixed(1) : null,
            avgHeartRate,
            maxHeartRate,
            avgPower,
            maxPower
          };
        };
        const stats = calculateStats(startTime, endTime);
        setStravaSelectionStats(stats);
        setShowStravaCreateLapButton(true);
      }
      
      stravaDragStateRef.current.isActive = false;
      stravaDragStateRef.current.start = { x: 0, time: 0 };
      stravaDragStateRef.current.end = { x: 0, time: 0 };
      setStravaIsDragging(false);
      setStravaDragStart({ x: 0, time: 0 });
      setStravaDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mousemove', mouseMoveGlobalHandler);
    document.addEventListener('mouseup', mouseUpGlobalHandler);
    
    return () => {
      container.removeEventListener('mousedown', mouseDownHandler);
      document.removeEventListener('mousemove', mouseMoveGlobalHandler);
      document.removeEventListener('mouseup', mouseUpGlobalHandler);
    };
  }, [selectedStrava, selectedStravaStreams]);

  const loadTrainings = useCallback(async () => {
    try {
      // For athlete, don't send athleteId (backend will use their own userId)
      // For coach, send athleteId if selected, otherwise don't load trainings (coach should select an athlete)
      const athleteId = user?.role === 'athlete' ? null : selectedAthleteId;
      
      // If coach but no athlete selected, don't load trainings
      if (user?.role === 'coach' && !athleteId) {
        setTrainings([]);
        return;
      }
      
      const data = await getFitTrainings(athleteId);
      
      // Remove duplicates based on _id before setting
      const uniqueTrainings = [];
      const seenIds = new Set();
      
      data.forEach(training => {
        if (training._id && !seenIds.has(training._id.toString())) {
          seenIds.add(training._id.toString());
          uniqueTrainings.push(training);
        }
      });
      
      
      setTrainings(uniqueTrainings);
      
      // Check if we should restore training selection
      const savedTrainingId = localStorage.getItem('fitAnalysis_selectedTrainingId');
      const savedTrainingModelId = localStorage.getItem('fitAnalysis_selectedTrainingModelId');
      
      if (savedTrainingId && !selectedTraining) {
        // Verify the training still exists
        const trainingExists = uniqueTrainings?.some(t => t._id === savedTrainingId);
        if (trainingExists) {
          loadTrainingDetail(savedTrainingId);
        } else {
          // Training no longer exists, remove from localStorage
          localStorage.removeItem('fitAnalysis_selectedTrainingId');
        }
      } else if (savedTrainingModelId && !selectedTraining) {
        // Try to restore Training model selection
        loadTrainingFromTrainingModel(savedTrainingModelId);
      }
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded when loading trainings. Please wait a moment.');
        // Don't show error to user, just log it
        return;
      }
      console.error('Error loading trainings:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAthleteId, user?.role, user?._id, selectedTraining]);

  // Load regular trainings from /training route
  const loadRegularTrainings = useCallback(async () => {
    try {
      // For athlete, use their own ID
      // For coach, use selectedAthleteId (must be selected, don't use coach's own ID)
      const athleteId = user?.role === 'athlete' ? user._id : selectedAthleteId;
      
      // If coach but no athlete selected, don't load trainings
      if (user?.role === 'coach' && !athleteId) {
        setRegularTrainings([]);
        return;
      }
      
      if (!athleteId) {
        return; // Skip if no athleteId
      }
      
      const response = await api.get(`/user/athlete/${athleteId}/trainings`);
      if (response && response.data) {
        setRegularTrainings(response.data);
      }
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded when loading regular trainings. Please wait a moment.');
        // Don't show error to user, just log it
        return;
      }
      console.error('Error loading regular trainings:', error);
    }
  }, [selectedAthleteId, user?.role, user?._id]);

  // Load regular training detail from /training route
  const loadRegularTrainingDetail = useCallback(async (id) => {
    try {
      const response = await api.get(`/api/training/${id}`);
      if (response && response.data) {
        // Convert regular training format to match selectedTraining structure
        const trainingData = {
          ...response.data,
          isRegularTraining: true // Flag to identify regular training
        };
        setSelectedTraining(trainingData);
        setSelectedStrava(null);
        // Persist selection to localStorage
        localStorage.setItem('fitAnalysis_selectedRegularTrainingId', id);
        localStorage.removeItem('fitAnalysis_selectedTrainingId');
        localStorage.removeItem('fitAnalysis_selectedStravaId');
        localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      }
    } catch (error) {
      console.error('Error loading regular training detail:', error);
    }
  }, []);

  const loadTrainingDetail = async (id) => {
    try {
      const data = await getFitTraining(id);
      
      // Debug: Check what data we have
      if (data.records && data.records.length > 0) {
        const firstRecord = data.records[0];
        console.log('First record from backend:', {
          hasCadence: firstRecord.cadence !== null && firstRecord.cadence !== undefined,
          hasAltitude: firstRecord.altitude !== null && firstRecord.altitude !== undefined,
          cadence: firstRecord.cadence,
          altitude: firstRecord.altitude,
          allKeys: Object.keys(firstRecord)
        });
        
        // Check if cadence/altitude are in different fields
        const recordsWithCadence = data.records.filter(r => r.cadence !== null && r.cadence !== undefined && r.cadence > 0);
        const recordsWithAltitude = data.records.filter(r => r.altitude !== null && r.altitude !== undefined && r.altitude > 0);
        console.log('Records with cadence:', recordsWithCadence.length, 'Records with altitude:', recordsWithAltitude.length);
      }
      
      // Check for duplicate laps and deduplicate if needed
      if (data.laps && Array.isArray(data.laps)) {
        data.laps = deduplicateFitTrainingLaps(data.laps);
      }
      
      // Check for duplicate records and deduplicate if needed
      if (data.records && Array.isArray(data.records)) {
        const seenRecords = new Map();
        const uniqueRecords = [];
        
        data.records.forEach((record) => {
          // Use timestamp as primary identifier
          const timestamp = record.timestamp ? new Date(record.timestamp).getTime() : null;
          if (timestamp) {
            const key = `time_${timestamp}`;
            if (seenRecords.has(key)) {
              return;
            }
            seenRecords.set(key, true);
            uniqueRecords.push(record);
            return;
          }
          
          // Fallback: Use combination of properties if no timestamp
          const distance = Math.round((record.distance || 0) * 100) / 100;
          const power = Math.round((record.power || 0) * 10) / 10;
          const hr = Math.round((record.heartRate || 0) * 10) / 10;
          const speed = Math.round((record.speed || 0) * 1000) / 1000;
          const key = `d${distance}_p${power}_hr${hr}_s${speed}`;
          
          if (seenRecords.has(key)) {
            return;
          }
          seenRecords.set(key, true);
          uniqueRecords.push(record);
        });
        
        data.records = uniqueRecords;
      }
      
      setSelectedTraining(data);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedTrainingId', id);
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      
      // Don't reload trainings here - it's expensive and usually not needed
      // Only reload if training was deleted or modified externally
    } catch (error) {
      console.error('Error loading training detail:', error);
      // Remove invalid ID from localStorage
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
    }
  };

  // Load training from Training model (from TrainingTable)
  const loadTrainingFromTrainingModel = async (trainingId) => {
    try {
      // Ensure regularTrainings are loaded first so calendar can find the activity
      await loadRegularTrainings();
      
      const response = await getTrainingById(trainingId);
      const data = response.data || response; // Handle both response formats
      
      if (!data) {
        console.error('No training data received');
        return;
      }
      
      // Try to load original FitTraining or StravaActivity if reference exists
      if (data.sourceFitTrainingId) {
        try {
          const fitTraining = await getFitTraining(data.sourceFitTrainingId);
          
          // Check for duplicate laps and deduplicate if needed
          if (fitTraining.laps && Array.isArray(fitTraining.laps)) {
            fitTraining.laps = deduplicateFitTrainingLaps(fitTraining.laps);
          }
          
          setSelectedTraining(fitTraining);
          setSelectedStrava(null);
          localStorage.setItem('fitAnalysis_selectedTrainingId', data.sourceFitTrainingId);
          localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
          localStorage.removeItem('fitAnalysis_selectedStravaId');
          
          // Clean URL params
          const url = new URL(window.location.href);
          url.searchParams.delete('trainingId');
          url.searchParams.delete('title');
          window.history.replaceState({}, '', url);
          return;
        } catch (fitError) {
          console.error('Error loading FitTraining, falling back to Training model:', fitError);
        }
      } else if (data.sourceStravaActivityId) {
        try {
          // Use the same loader as when selecting from calendar, so selectedStrava has the expected shape
          // and CalendarView can highlight/anchor correctly.
          await loadStravaDetail(data.sourceStravaActivityId, { overrideTitle: data.title || null });
          
          // Clean URL params
          const url = new URL(window.location.href);
          url.searchParams.delete('trainingId');
          url.searchParams.delete('title');
          window.history.replaceState({}, '', url);
          return;
        } catch (stravaError) {
          console.error('Error loading StravaActivity, falling back to Training model:', stravaError);
        }
      }
      
      // Fallback: Convert Training model to format compatible with FitAnalysisPage
      // Training model has results array, not records/laps like FitTraining
      const convertedTraining = {
        _id: data._id,
        titleManual: data.title,
        titleAuto: data.title,
        originalFileName: data.title,
        description: data.description || '',
        sport: data.sport === 'bike' ? 'cycling' : (data.sport === 'run' ? 'running' : (data.sport === 'swim' ? 'swimming' : 'generic')),
        timestamp: new Date(data.date),
        totalElapsedTime: data.results?.reduce((sum, r) => sum + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
        totalTimerTime: data.results?.reduce((sum, r) => sum + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
        // Convert results to laps format for display
        laps: data.results?.map((result, index) => {
          // Get duration in seconds - use durationSeconds if available, otherwise parse from duration string
          const durationSec = result.durationSeconds || parseDurationToSeconds(result.duration) || 0;

    return {
            lapNumber: index + 1,
            totalElapsedTime: durationSec,
            totalTimerTime: durationSec,
            avgPower: result.power || null,
            maxPower: result.power || null,
            avgHeartRate: result.heartRate || null,
            maxHeartRate: result.heartRate || null,
            lactate: result.lactate || null,
            // Note: Training model doesn't have records, so we can't show detailed chart
          };
        }) || [],
        records: [], // Training model doesn't have records, so no detailed chart
        isFromTrainingModel: true // Flag to indicate this is from Training model
      };
      
      // Add converted training to trainings array if not already present
      // Use a Set to track IDs to prevent duplicates
      setTrainings(prev => {
        const seenIds = new Set(prev.map(t => t._id?.toString()));
        const exists = seenIds.has(convertedTraining._id?.toString());
        if (!exists) {
          // Also check for duplicates in the new array
          const newTrainings = [...prev, convertedTraining];
          const uniqueTrainings = [];
          const newSeenIds = new Set();
          newTrainings.forEach(t => {
            const id = t._id?.toString();
            if (id && !newSeenIds.has(id)) {
              newSeenIds.add(id);
              uniqueTrainings.push(t);
            }
          });
          return uniqueTrainings;
        }
        return prev;
      });
      
      setSelectedTraining(convertedTraining);
      setSelectedStrava(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedTrainingModelId', trainingId);
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('trainingId');
      url.searchParams.delete('title');
      window.history.replaceState({}, '', url);
    } catch (error) {
      console.error('Error loading training from Training model:', error);
      console.error('Error details:', error.response?.data || error.message);
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      alert('Error loading training: ' + (error.response?.data?.error || error.message));
    }
  };
  
  // Helper function to parse duration string (MM:SS or HH:MM:SS) to seconds
  const parseDurationToSeconds = (durationStr) => {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.split(':');
    if (parts.length === 2) {
      // MM:SS format
      const minutes = parseInt(parts[0], 10) || 0;
      const seconds = parseInt(parts[1], 10) || 0;
      return minutes * 60 + seconds;
    } else if (parts.length === 3) {
      // HH:MM:SS format
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const seconds = parseInt(parts[2], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  };


  const handleDeleteTraining = async (trainingId) => {
    if (!window.confirm('Are you sure you want to delete this training? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteFitTraining(trainingId);
      await loadTrainings();
      if (selectedTraining?._id === trainingId) {
        setSelectedTraining(null);
        localStorage.removeItem('fitAnalysis_selectedTrainingId');
      }
      alert('Training deleted successfully');
    } catch (error) {
      console.error('Error deleting training:', error);
      alert('Error deleting training');
    }
  };




  // Initialize selectedAthleteId on mount for coach or when returning to page
  useEffect(() => {
    if (user?.role === 'coach') {
      // Always check localStorage first when component mounts or when location changes (returning to page)
      const savedAthleteId = localStorage.getItem('trainingCalendar_selectedAthleteId');
      if (savedAthleteId) {
        // Always use saved value if it exists
        setSelectedAthleteId(savedAthleteId);
      } else {
        // If no saved athleteId, default to coach's own ID
        setSelectedAthleteId(user._id);
        localStorage.setItem('trainingCalendar_selectedAthleteId', user._id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname]); // Run when user changes or when pathname changes (returning to page)

  // Listen for athlete selection from Menu (when on training-calendar page)
  useEffect(() => {
    const handleAthleteSelected = (event) => {
      const { athleteId } = event.detail;
      if (athleteId && athleteId !== selectedAthleteId) {
        setSelectedAthleteId(athleteId);
        localStorage.setItem('trainingCalendar_selectedAthleteId', athleteId);
      }
    };

    window.addEventListener('athleteSelected', handleAthleteSelected);
    return () => window.removeEventListener('athleteSelected', handleAthleteSelected);
  }, [selectedAthleteId]);

  // Reload data when selectedAthleteId changes (debounced to prevent multiple calls)
  useEffect(() => {
    if (user && selectedAthleteId) {
      // Use a small timeout to debounce rapid changes
      const timeoutId = setTimeout(() => {
        loadTrainings();
        loadExternalActivities();
        loadRegularTrainings();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [selectedAthleteId, user, loadTrainings, loadExternalActivities, loadRegularTrainings]);


  const handleAthleteChange = (athleteId) => {
    setSelectedAthleteId(athleteId);
    localStorage.setItem('trainingCalendar_selectedAthleteId', athleteId);
    // Clear selected training when switching athletes
    setSelectedTraining(null);
    setSelectedStrava(null);
    localStorage.removeItem('fitAnalysis_selectedTrainingId');
    localStorage.removeItem('fitAnalysis_selectedStravaId');
    localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
  };

  // Convert Strava laps to Training format
  const convertLapsToTrainingFormat = (laps, isRecoveryMap = new Map()) => {
    // Determine sport type
    const sportType = selectedStrava?.sport_type || selectedStrava?.sport || 'bike';
    const isRun = sportType.toLowerCase().includes('run');
    const isSwim = sportType.toLowerCase().includes('swim');
    
    return laps.map((lap, idx) => {
      const isRecovery = isRecoveryMap.get(idx) || false;
      const duration = lap.elapsed_time || 0;
      const power = lap.average_watts || lap.average_power || null;
      const heartRate = lap.average_heartrate || lap.average_hr || null;
      const lactate = lap.lactate || null;
      const distance = lap.distance || null; // distance in meters
      
      // For run/swim, convert pace from speed to MM:SS format
      let powerValue = '';
      if (isRun || isSwim) {
        // Convert speed (m/s) to pace (seconds per km for run, seconds per 100m for swim)
        if (lap.average_speed && lap.average_speed > 0) {
          let paceSeconds;
          if (isRun) {
            paceSeconds = Math.round(1000 / lap.average_speed); // seconds per km
          } else {
            paceSeconds = Math.round(100 / lap.average_speed); // seconds per 100m
          }
          // Convert to MM:SS format
          const minutes = Math.floor(paceSeconds / 60);
          const seconds = paceSeconds % 60;
          powerValue = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
      } else {
        // For bike, use power directly
        powerValue = power ? power.toString() : '';
      }
      
      // Format distance if available (convert meters to km for display, or keep as meters for swim)
      let distanceValue = '';
      let useDistance = false;
      if (distance && distance > 0) {
        useDistance = true;
        if (isSwim) {
          // For swim, show in meters (e.g., "400m", "50m")
          if (distance >= 1000) {
            distanceValue = `${(distance / 1000).toFixed(2)} km`;
          } else {
            distanceValue = `${Math.round(distance)}m`;
          }
        } else {
          // For bike/run, show in km (e.g., "1 km", "5.2 km")
          if (distance >= 1000) {
            distanceValue = `${(distance / 1000).toFixed(2)} km`;
          } else {
            // If less than 1km, show in meters
            distanceValue = `${Math.round(distance)}m`;
          }
        }
      }
      
      return {
        interval: idx + 1,
        power: powerValue,
        heartRate: heartRate ? heartRate.toString() : '',
        lactate: lactate ? lactate.toString() : '',
        RPE: '',
        duration: useDistance ? distanceValue : formatDuration(duration), // Use distance if available, otherwise time in MM:SS
        durationType: useDistance ? 'distance' : 'time', // Use distance if available
        repeatCount: 1,
        isRecovery: isRecovery, // Flag to mark recovery intervals
        isSelected: !isRecovery // Recovery intervals are not selected by default
      };
    });
  };

  // Detect if lap is a recovery/rest interval (should be excluded by default)
  const isRecoveryInterval = (lap, lapIndex, sportType, allLaps = []) => {
    const isRun = sportType.toLowerCase().includes('run');
    const isSwim = sportType.toLowerCase().includes('swim');
    const isBike = !isRun && !isSwim;
    
    // Check duration - very short intervals (< 10s) are likely artifacts
    const duration = lap.elapsed_time || 0;
    if (duration < 10) {
      return true;
    }
    
    // Get current lap power/speed
    let currentPower = 0;
    let currentSpeed = 0;
    if (isBike) {
      currentPower = lap.average_watts || lap.average_power || 0;
    } else {
      currentSpeed = lap.average_speed || 0;
    }
    
    // Compare with neighboring intervals (more accurate than global average)
    const prevLap = lapIndex > 0 ? allLaps[lapIndex - 1] : null;
    const nextLap = lapIndex < allLaps.length - 1 ? allLaps[lapIndex + 1] : null;
    
    let prevPower = 0, nextPower = 0;
    let prevSpeed = 0, nextSpeed = 0;
    
    if (prevLap) {
      if (isBike) {
        prevPower = prevLap.average_watts || prevLap.average_power || 0;
      } else {
        prevSpeed = prevLap.average_speed || 0;
      }
    }
    
    if (nextLap) {
      if (isBike) {
        nextPower = nextLap.average_watts || nextLap.average_power || 0;
      } else {
        nextSpeed = nextLap.average_speed || 0;
      }
    }
    
    // Check if current interval is significantly lower than neighbors (recovery between work intervals)
    if (isBike) {
      // If both neighbors exist and are significantly higher, this is likely recovery
      if (prevPower > 0 && nextPower > 0) {
        const avgNeighborPower = (prevPower + nextPower) / 2;
        const powerDiff = avgNeighborPower - currentPower;
        // If current power is less than 80% of average neighbor power AND difference is at least 50W, it's likely recovery
        // Example: 300W neighbors, 240W current = 60W diff, 240W < 240W (80% of 300W) = true
        // This catches cases like 3x30min 300W with 2min 240W recovery between them
        if (currentPower > 0 && currentPower < avgNeighborPower * 0.80 && powerDiff >= 50 && avgNeighborPower > 150) {
          return true;
        }
      }
      // Also check if one neighbor is significantly higher
      if (prevPower > 0 && currentPower > 0 && prevPower > currentPower * 1.2 && (prevPower - currentPower) >= 50 && prevPower > 150) {
        // Previous was work, current is lower
        if (nextPower === 0 || nextPower > currentPower * 1.2) {
          // Next is also work or doesn't exist, so current is recovery
          return true;
        }
      }
      if (nextPower > 0 && currentPower > 0 && nextPower > currentPower * 1.2 && (nextPower - currentPower) >= 50 && nextPower > 150) {
        // Next is work, current is lower
        if (prevPower === 0 || prevPower > currentPower * 1.2) {
          // Previous was also work or doesn't exist, so current is recovery
          return true;
        }
      }
      
      // Global average check (fallback)
      let avgPower = 0;
      let powerCount = 0;
      allLaps.forEach(l => {
        const p = l.average_watts || l.average_power || 0;
        if (p > 0) {
          avgPower += p;
          powerCount++;
        }
      });
      if (powerCount > 0) avgPower = avgPower / powerCount;
      
      // If power is very low (< 50W) or significantly below average (< 30% of avg), it's likely recovery
      if (currentPower < 50 || (avgPower > 0 && currentPower < avgPower * 0.3)) {
        return true;
      }
    }
    
    // Check speed for run/swim
    if (isRun || isSwim) {
      // Similar logic for speed
      if (prevSpeed > 0 && nextSpeed > 0) {
        const avgNeighborSpeed = (prevSpeed + nextSpeed) / 2;
        if (currentSpeed > 0 && currentSpeed < avgNeighborSpeed * 0.85 && avgNeighborSpeed > 1) {
          return true;
        }
      }
      
      // Global average check
      let avgSpeed = 0;
      let speedCount = 0;
      allLaps.forEach(l => {
        const s = l.average_speed || 0;
        if (s > 0) {
          avgSpeed += s;
          speedCount++;
        }
      });
      if (speedCount > 0) avgSpeed = avgSpeed / speedCount;
      
      const absoluteThreshold = isRun ? 2 : 0.5;
      const relativeThreshold = avgSpeed > 0 ? avgSpeed * 0.4 : absoluteThreshold;
      const threshold = Math.max(absoluteThreshold, relativeThreshold);
      
      if (currentSpeed < threshold) {
        return true;
      }
    }
    
    // Check heart rate - if HR is very low compared to average, might be recovery
    const avgHR = lap.average_heartrate || lap.average_hr || null;
    if (avgHR && avgHR < 100) {
      // Very low HR might indicate recovery, but not always
      // Only mark as recovery if combined with low power/speed
      if (isBike && currentPower < 30) {
        return true;
      }
      if ((isRun || isSwim) && currentSpeed < 1) {
        return true;
      }
    }
    
    return false;
  };

  // Handle export to training - directly show TrainingForm with smart selection
  const handleExportToTraining = () => {
    if (!selectedStrava || !selectedStrava.laps || selectedStrava.laps.length === 0) {
      alert('No intervals available to export');
      return;
    }

    const uniqueLaps = deduplicateStravaLaps(selectedStrava.laps || []);
    
    // Determine sport type
    const sportType = selectedStrava?.sport_type || selectedStrava?.sport || 'bike';
    let sport = 'bike';
    if (sportType.toLowerCase().includes('run')) {
      sport = 'run';
    } else if (sportType.toLowerCase().includes('swim')) {
      sport = 'swim';
    }
    
    // Mark recovery intervals (but keep all intervals)
    const isRecoveryMap = new Map();
    uniqueLaps.forEach((lap, index) => {
      isRecoveryMap.set(index, isRecoveryInterval(lap, index, sportType, uniqueLaps));
    });
    
    // Convert all laps to training format (including recovery)
    const results = convertLapsToTrainingFormat(uniqueLaps, isRecoveryMap);
    
    // Check if we have at least some work intervals
    const workIntervals = results.filter(r => !r.isRecovery);
    if (workIntervals.length === 0) {
      alert('No work intervals found. All intervals appear to be recovery periods.');
      return;
    }
    
    // Format date
    const activityDate = selectedStrava?.start_date_local || 
                       selectedStrava?.start_date || 
                       selectedStrava?.startDate || 
                       new Date();
    const dateStr = new Date(activityDate).toISOString().slice(0, 16);
    
    // Prepare form data with all intervals (user can edit/remove in form)
    const formData = {
      sport: sport,
      type: 'interval',
      title: selectedStrava?.titleManual || selectedStrava?.name || 'Untitled Training',
      customTitle: '',
      description: selectedStrava?.description || '',
      date: dateStr,
      // Link back to Strava so we can merge calendar entries and keep Strava data as the source of truth
      sourceStravaActivityId: String(selectedStrava.id || selectedStrava.stravaId || ''),
      specifics: {
        specific: '',
        weather: '',
        customSpecific: '',
        customWeather: ''
      },
      results: results
    };
    
    setTrainingFormData(formData);
    setShowTrainingForm(true);
  };

  // Handle training form submission
  const handleTrainingFormSubmit = async (formData) => {
    try {
      setIsExporting(true);
      
      // Filter out unselected intervals (recovery intervals that user didn't select)
      const selectedResults = formData.results.filter(result => result.isSelected !== false);
      
      // Remove internal flags before submitting
      const cleanedResults = selectedResults.map(result => {
        const { isRecovery, isSelected, ...cleanedResult } = result;
        return cleanedResult;
      });
      
      const targetId = user?.role === 'athlete' ? user._id : (selectedAthleteId || user._id);
      
      const trainingData = {
        ...formData,
        results: cleanedResults,
        athleteId: targetId,
        coachId: user?.role === 'coach' ? user._id : undefined,
        // Persist source links if present (used to merge calendar entries)
        sourceStravaActivityId: formData?.sourceStravaActivityId || undefined,
        sourceFitTrainingId: formData?.sourceFitTrainingId || undefined
      };
      
      // Check if training already exists (by title and date)
      const existingTrainingsResponse = await api.get(`/user/athlete/${targetId}/trainings`);
      const allTrainings = existingTrainingsResponse.data || [];
      
      const existing = allTrainings.find(t => 
        t.title === formData.title && 
        new Date(t.date).toDateString() === new Date(formData.date).toDateString()
      );
      
      // Calculate average power/pace for similarity detection
      const calculateAvgValue = (results, sport) => {
        if (!results || results.length === 0) return 0;
        if (sport === 'bike') {
          const powers = results.map(r => Number(r.power)).filter(p => !isNaN(p) && p > 0);
          return powers.length > 0 ? powers.reduce((sum, p) => sum + p, 0) / powers.length : 0;
        } else {
          // For run/swim, parse pace
          const parsePace = (paceValue) => {
            if (typeof paceValue === 'number') return paceValue;
            if (typeof paceValue === 'string' && paceValue.includes(':')) {
              const [min, sec] = paceValue.split(':').map(Number);
              return !isNaN(min) && !isNaN(sec) ? min * 60 + sec : 0;
            }
            return Number(paceValue) || 0;
          };
          const paces = results.map(r => parsePace(r.power)).filter(p => p > 0);
          return paces.length > 0 ? paces.reduce((sum, p) => sum + p, 0) / paces.length : 0;
        }
      };
      
      const calculateTotalTime = (results) => {
        if (!results || results.length === 0) return 0;
        return results.reduce((sum, r) => {
          const duration = r.durationSeconds || (r.duration ? parseDurationToSeconds(r.duration) : 0);
          return sum + (duration || 0);
        }, 0);
      };
      
      const newAvgValue = calculateAvgValue(cleanedResults, formData.sport);
      const newTotalTime = calculateTotalTime(cleanedResults);
      
      // Find similar trainings (within 10% power/pace difference and 20% time difference)
      const similarTrainings = allTrainings.filter(t => {
        if (t._id === existing?._id) return false; // Exclude the existing one if updating
        if (t.sport !== formData.sport) return false; // Same sport only
        
        const tAvgValue = calculateAvgValue(t.results || [], t.sport);
        const tTotalTime = calculateTotalTime(t.results || []);
        
        if (newAvgValue === 0 || tAvgValue === 0) return false;
        if (newTotalTime === 0 || tTotalTime === 0) return false;
        
        const valueDiff = Math.abs(newAvgValue - tAvgValue) / Math.max(newAvgValue, tAvgValue);
        const timeDiff = Math.abs(newTotalTime - tTotalTime) / Math.max(newTotalTime, tTotalTime);
        
        // Similar if value difference < 10% and time difference < 20%
        return valueDiff < 0.10 && timeDiff < 0.20;
      });
      
      if (existing) {
        // Update existing training
        await updateTraining(existing._id, trainingData);
        if (similarTrainings.length > 0) {
          alert(`Training updated successfully! Found ${similarTrainings.length} similar training(s) with similar power/pace and duration.`);
        } else {
        alert('Training updated successfully!');
        }
      } else {
        // Create new training
        await addTraining(trainingData);
        if (similarTrainings.length > 0) {
          const similarList = similarTrainings.map(t => 
            `${t.title} (${new Date(t.date).toLocaleDateString('cs-CZ')})`
          ).join(', ');
          alert(`Training created successfully! Found ${similarTrainings.length} similar training(s): ${similarList}`);
        } else {
        alert('Training created successfully!');
        }
      }
      
      // Reload regular trainings to update calendar
      await loadRegularTrainings();
      
      setShowTrainingForm(false);
      setTrainingFormData(null);
    } catch (error) {
      console.error('Error saving training:', error);
      alert('Error saving training: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`bg-gradient-to-br from-indigo-50 via-white to-pink-50 ${isMobile ? 'p-1' : 'p-2 sm:p-3 md:p-4 lg:p-6'}`}>
      <div className={`${isMobile ? 'w-full' : 'max-w-8xl'} mx-auto`}>
        <h1 className={`${isMobile ? 'text-base mb-2' : 'text-xl sm:text-2xl md:text-3xl mb-3 sm:mb-4 md:mb-6 lg:mb-8'} font-bold text-gray-900`}>Training Calendar</h1>

        {/* Athlete Selector for Coach */}
        {user?.role === 'coach' && (
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
            user={user}
          />
        )}

        {/* Calendar Section */}
        <CalendarView
          activities={(() => {
            // Merge Training-model entries that are linked to a Strava activity into a single calendar item:
            // show the Training title, but keep all Strava-derived metrics and open Strava detail on click.
            const trainingByStravaId = new Map();
            (regularTrainings || []).forEach(t => {
              const sid = t?.sourceStravaActivityId;
              if (sid) trainingByStravaId.set(String(sid), t);
            });

            const allActivities = [
            ...trainings.map(t => ({ 
              id: `fit-${t._id}`, 
              date: t.timestamp, 
              title: t.titleManual || t.titleAuto || t.originalFileName || 'Untitled Training', 
              sport: t.sport,
              category: t.category || null,
              type: 'fit',
              distance: t.totalDistance || t.distance,
              totalElapsedTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
              tss: t.tss || t.totalTSS,
              avgPower: t.avgPower || t.averagePower || null,
              avgSpeed: t.avgSpeed || t.averageSpeed || null
            })),
            // Only show regular trainings that are NOT linked to a Strava activity (linked ones will be merged into the Strava item below)
            ...regularTrainings
              .filter(t => !t?.sourceStravaActivityId)
              .map(t => ({ 
                id: `regular-${t._id}`, 
                date: t.date || t.timestamp, 
                title: t.title || 'Untitled Training', 
                sport: t.sport,
                category: t.category || null,
                type: 'regular',
                distance: t.totalDistance || t.distance,
                totalElapsedTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
                tss: t.tss || t.totalTSS,
                avgPower: t.avgPower || t.averagePower || null,
                avgSpeed: t.avgSpeed || t.averageSpeed || null
              })),
            ...externalActivities.map(a => ({ 
              id: `strava-${a.stravaId}`, 
              date: a.startDate, 
              // If there's a linked Training-model entry, use its title (but keep Strava data)
              title: (trainingByStravaId.get(String(a.stravaId))?.title) || (a.titleManual || a.name || 'Untitled Activity'),
              linkedTrainingTitle: trainingByStravaId.get(String(a.stravaId))?.title || null,
              sport: a.sport,
              category: a.category || null,
              type: 'strava',
              distance: a.distance,
              totalElapsedTime: a.movingTime || a.elapsedTime,
              tss: a.tss || a.totalTSS,
              avgPower: a.averagePower || a.average_watts || null,
              avgSpeed: a.averageSpeed || a.average_speed || null
            }))
            ];
            console.log('CalendarView activities:', {
              total: allActivities.length,
              fit: trainings.length,
              regular: regularTrainings.length,
              external: externalActivities.length,
              sampleDates: allActivities.slice(0, 5).map(a => ({ 
                id: a.id, 
                date: a.date, 
                dateType: typeof a.date,
                parsed: a.date ? new Date(a.date).toISOString() : 'no date'
              }))
            });
            return allActivities;
          })()}
          selectedActivityId={
            (selectedTraining
              ? (selectedTraining?.isFromTrainingModel
                  ? `training-${selectedTraining?._id}`
                  : (selectedTraining?.isRegularTraining
                      ? `regular-${selectedTraining?._id}`
                      : `fit-${selectedTraining?._id}`))
              : null) ||
            (selectedTraining?.isFromTrainingModel ? `training-${localStorage.getItem('fitAnalysis_selectedTrainingModelId')}` : null) ||
            (selectedTraining?.isRegularTraining ? `regular-${localStorage.getItem('fitAnalysis_selectedRegularTrainingId')}` : null) ||
            (localStorage.getItem('fitAnalysis_selectedTrainingId') ? `fit-${localStorage.getItem('fitAnalysis_selectedTrainingId')}` : null) ||
            (selectedStrava ? `strava-${selectedStrava.id || selectedStrava.stravaId}` : null) ||
            (localStorage.getItem('fitAnalysis_selectedStravaId') ? `strava-${localStorage.getItem('fitAnalysis_selectedStravaId')}` : null)
          }
          initialAnchorDate={selectedTraining?.timestamp ? new Date(selectedTraining.timestamp) : null}
          onSelectActivity={(a) => { 
            if (!a?.id) return;
            const rid = String(a.id);
            // Keep URL in sync (id at the end)
            navigate(`/training-calendar/${encodeURIComponent(rid)}`);

            if (rid.startsWith('strava-')) {
              const sid = rid.replace('strava-','');
              loadStravaDetail(sid, { overrideTitle: a?.linkedTrainingTitle || null });
            } else if (rid.startsWith('regular-')) {
              const regularId = rid.replace('regular-','');
              loadRegularTrainingDetail(regularId);
            } else if (rid.startsWith('fit-')) {
              loadTrainingDetail(rid.replace('fit-',''));
            } else if (rid.startsWith('training-')) {
              loadTrainingFromTrainingModel(rid.replace('training-',''));
            } else {
              // Backwards-compat for old id formats
              loadTrainingDetail(rid);
            }
          }}
          onMonthChange={useCallback(({ year, month }) => {
            // Note: API loads all trainings at once, so no need to reload when month changes
            // Data is already loaded and calendar will filter by date client-side
            console.log('Month changed to:', { year, month }, '- data already loaded, no API call needed');
          }, [])}
          user={user}
        />

        {/* Training Detail and Charts - Full Width */}
        {selectedTraining && (
          <div className={`w-full ${isMobile ? 'mt-2' : 'mt-2 sm:mt-3 md:mt-4 lg:mt-6'}`}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${isMobile ? 'bg-white' : 'bg-white/10 backdrop-blur-xl'} ${isMobile ? 'rounded-lg' : 'rounded-2xl sm:rounded-3xl'} ${isMobile ? 'border border-gray-200' : 'border border-white/20'} shadow-md ${isMobile ? 'p-2' : 'p-3 sm:p-4 md:p-6'} ${isMobile ? 'space-y-2' : 'space-y-3 sm:space-y-4 md:space-y-6'}`}
                >
                  {/* Header Stats */}
              <TrainingStats 
                training={selectedTraining} 
                onDelete={handleDeleteTraining}
                onUpdate={async (id) => {
                  await loadTrainingDetail(id);
                  await loadTrainings(); // Reload to update calendar
                }}
                user={user}
              />


                  {/* Training Chart - Modern SVG Version */}
                  {selectedTraining && selectedTraining.records && selectedTraining.records.length > 0 && (() => {
                    // Calculate statistics from training data
                    const records = selectedTraining.records;
                    const powers = records.map(r => r.power).filter(p => p && p > 0);
                    const cadences = records.map(r => r.cadence).filter(c => c && c > 0);
                    
                    const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
                    const maxPower = powers.length > 0 ? Math.max(...powers) : null;
                    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
                    
                    // Calculate Normalized Power (30-second rolling average, then 4th power, then 4th root)
                    let normalizedPower = null;
                    if (powers.length > 0 && records.length > 30) {
                      // Assuming 1 second intervals, calculate 30-second rolling averages
                      const rollingAverages = [];
                      for (let i = 0; i < powers.length; i++) {
                        const start = Math.max(0, i - 15);
                        const end = Math.min(powers.length, i + 15);
                        const window = powers.slice(start, end);
                        const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
                        rollingAverages.push(avg);
                      }
                      // Raise to 4th power, average, then 4th root
                      const fourthPowers = rollingAverages.map(avg => Math.pow(avg, 4));
                      const avgFourthPower = fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length;
                      normalizedPower = Math.round(Math.pow(avgFourthPower, 1/4));
                    }
                    
                    // Calculate TSS and IF
                    const trainingDate = selectedTraining.timestamp ? new Date(selectedTraining.timestamp) : new Date();
                    const sport = selectedTraining.sport || 'cycling';
                    const isRun = sport.toLowerCase().includes('run');
                    const avgSpeed = selectedTraining.avgSpeed || null;
                    const duration = selectedTraining.totalElapsedTime || selectedTraining.totalTimerTime || 0;
                    
                    let tss = null;
                    let intensityFactor = null;
                    let thresholdPace = null;
                    let ftp = null;
                    
                    // For running: calculate TSS from pace
                    if (isRun && avgSpeed && avgSpeed > 0) {
                      const avgPaceSeconds = Math.round(1000 / avgSpeed); // seconds per km
                      thresholdPace = userProfile?.powerZones?.running?.lt2 || null; // Threshold pace in seconds per km
                      let referencePace = thresholdPace;
                      // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
                      if (!referencePace || referencePace <= 0) {
                        referencePace = avgPaceSeconds;
                      }
                      // Running TSS formula: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
                      const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
                      tss = Math.round((duration * Math.pow(intensityRatio, 2)) / 3600 * 100);
                      intensityFactor = intensityRatio.toFixed(2);
                    } else {
                      // For cycling: calculate TSS from power
                      ftp = userProfile?.powerZones?.cycling?.lt2 || null;
                      const np = normalizedPower || avgPower;
                      tss = ftp && np ? Math.round((duration * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100) : null;
                      intensityFactor = ftp && np ? (np / ftp).toFixed(2) : null;
                    }
                    
                    return (
                      <div className={`${isMobile ? 'mb-2' : 'mb-4 md:mb-6'}`}>
                        {/* Statistics */}
                        <div className={`w-full overflow-x-auto ${isMobile ? 'mb-1.5' : 'mb-2 sm:mb-3 md:mb-4'}`}>
                          <div className={`flex flex-wrap ${isMobile ? 'gap-1' : 'gap-1.5 sm:gap-2 md:gap-3'}`}>
                            <div className={`flex-1 ${isMobile ? 'min-w-[100px] px-1.5 py-1.5' : 'min-w-[120px] sm:min-w-[160px] px-2 sm:px-4 py-2 sm:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                              <div className={`${isMobile ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} uppercase tracking-wide text-gray-500`}>Date</div>
                              <div className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-gray-900`}>{formatDateTime(trainingDate.toISOString())}</div>
                            </div>
                            <div className={`flex-1 ${isMobile ? 'min-w-[80px] px-1.5 py-1.5' : 'min-w-[100px] sm:min-w-[140px] px-2 sm:px-4 py-2 sm:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                              <div className={`${isMobile ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} uppercase tracking-wide text-gray-500`}>Sport</div>
                              <div className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-gray-900`}>{sport}</div>
                            </div>
                            {avgPower && (
                              <div className={`flex-1 ${isMobile ? 'min-w-[80px] px-1.5 py-1.5' : 'min-w-[100px] sm:min-w-[140px] px-2 sm:px-4 py-2 sm:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Power</div>
                                <div className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-gray-900`}>{avgPower} W</div>
                                {maxPower && (
                                  <div className={`${isMobile ? 'text-[8px]' : 'text-[10px] sm:text-xs'} text-gray-500 mt-0.5`}>Max: {Math.round(maxPower)} W</div>
                                )}
                              </div>
                            )}
                            {avgCadence && (
                              <div className={`flex-1 ${isMobile ? 'min-w-[80px] px-1.5 py-1.5' : 'min-w-[100px] sm:min-w-[140px] px-2 sm:px-4 py-2 sm:py-3'} bg-white/90 border border-blue-200 bg-blue-50 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Cadence</div>
                                <div className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-blue-700`}>{avgCadence} rpm</div>
                              </div>
                            )}
                            {normalizedPower && (
                              <div className={`flex-1 ${isMobile ? 'min-w-[80px] px-1.5 py-1.5' : 'min-w-[100px] sm:min-w-[140px] px-2 sm:px-4 py-2 sm:py-3'} bg-white/90 border border-green-200 bg-green-50 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} uppercase tracking-wide text-gray-500`}>Normalized Power</div>
                                <div className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-green-700`}>{normalizedPower} W</div>
                              </div>
                            )}
                            {tss !== null && (
                              <div className={`flex-1 ${isMobile ? 'min-w-[80px] px-1.5 py-1.5' : 'min-w-[100px] sm:min-w-[140px] px-2 sm:px-4 py-2 sm:py-3'} bg-white/90 border border-purple-200 bg-purple-50 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} uppercase tracking-wide text-gray-500 flex items-center gap-1`}>
                                  TSS
                                  {((isRun && !thresholdPace) || (!isRun && !ftp)) && (
                                    <span className={`${isMobile ? 'text-[8px]' : 'text-[10px] sm:text-xs'} text-gray-400`} title={isRun ? "Estimated TSS (Threshold pace not set in profile)" : "Estimated TSS (FTP not set in profile)"}>*</span>
                                  )}
                                </div>
                                <div className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-purple-700`}>{tss}</div>
                                {intensityFactor && (
                                  <div className={`${isMobile ? 'text-[8px]' : 'text-[10px] sm:text-xs'} text-gray-500 mt-0.5`}>IF: {intensityFactor}</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <h3 className={`${isMobile ? 'text-sm' : 'text-base sm:text-lg md:text-xl'} font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4`}>Training Chart</h3>
                        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                        <TrainingChart
                          training={selectedTraining}
                          userProfile={userProfile}
                          onHover={(point) => {
                            // Optional: handle hover events
                          }}
                          onLeave={() => {
                            // Optional: handle leave events
                          }}
                        />
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Legacy Training Chart - Full Time SVG Version (commented out, can be removed) */}
                  {false && selectedTraining && selectedTraining.records && selectedTraining.records.length > 0 && (() => {
                    const chartData = prepareTrainingChartData(selectedTraining);
                    if (!chartData) return null;

                    const chartHeight = 300;
                    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
                    const svgWidth = 800;
                    const svgHeight = chartHeight;
                    const graphWidth = svgWidth - padding.left - padding.right;
                    const graphHeight = svgHeight - padding.top - padding.bottom;

                    // Scale functions
                    const speedYScale = (speed) => padding.top + graphHeight - ((speed / chartData.maxSpeed) * graphHeight);
                    const hrYScale = (hr) => padding.top + graphHeight - ((hr / chartData.maxHeartRate) * graphHeight);
                    const powerYScale = (power) => padding.top + graphHeight - ((power / chartData.maxPower) * graphHeight);

                    // Sample data for performance (show every Nth point for long trainings)
                    const sampleRate = chartData.records.length > 5000 ? 10 : chartData.records.length > 2000 ? 5 : 1;
                    const sampledRecords = chartData.records.filter((_, i) => i % sampleRate === 0 || i === chartData.records.length - 1);

                    // Zoom calculations
                    const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                    const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                    const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                    const zoomedXScale = (time) => {
                      if (time < zoomedMinTime || time > zoomedMaxTime) return null;
                      const normalizedTime = (time - zoomedMinTime) / zoomedTimeRange;
                      return padding.left + normalizedTime * graphWidth;
                    };

                    const handleTrainingChartHover = (record, event) => {
                      if (isDragging) return; // Don't show tooltip while dragging
                      
                      setHoveredTrainingRecord(record);
                      
                      const container = trainingChartRef.current;
                      if (!container) return;
                      
                      // Calculate X position based on record time
                      const x = zoomedXScale(record.timeFromStart);
                      if (x === null) return;
                      
                      // Calculate Y position - average of all visible metrics at this point
                      let avgY = 0;
                      let count = 0;
                      
                      if (record.speed) {
                        avgY += speedYScale(record.speed);
                        count++;
                      }
                      if (record.heartRate) {
                        avgY += hrYScale(record.heartRate);
                        count++;
                      }
                      if (record.power) {
                        avgY += powerYScale(record.power);
                        count++;
                      }
                      
                      const tooltipY = count > 0 ? avgY / count : padding.top + graphHeight / 2;
                      
                      // Get SVG element to calculate scale
                      const svgElement = container.querySelector('svg');
                      if (!svgElement) return;
                      const svgRect = svgElement.getBoundingClientRect();
                      const scaleX = svgRect.width / svgWidth;
                      const scaleY = svgRect.height / svgHeight;
                      
                      // Calculate position relative to container
                      const svgX = x * scaleX;
                      const svgY = tooltipY * scaleY;
                      
                      setTrainingTooltipPosition({
                        x: svgX,
                        y: svgY - 10 // Offset above the point
                      });
                    };

                    const handleTrainingChartLeave = () => {
                      if (!isDragging) {
                        setHoveredTrainingRecord(null);
                      }
                    };

                    const handleResetZoom = () => {
                      setTrainingZoom({ min: 0, max: 1, scale: 1 });
                      setIsDragging(false);
                      setDragStart({ x: 0, time: 0 });
                      setDragEnd({ x: 0, time: 0 });
                      setShowCreateLapButton(false);
                      setSelectedTimeRange({ start: 0, end: 0 });
                      setSelectionStats(null);
                    };

                    const calculateSelectionStats = (startTime, endTime) => {
                      if (!selectedTraining?.records || selectedTraining.records.length === 0) return null;
                      
                      const trainingStartTime = selectedTraining.records[0]?.timestamp 
                        ? new Date(selectedTraining.records[0].timestamp).getTime() 
                        : selectedTraining.timestamp 
                          ? new Date(selectedTraining.timestamp).getTime() 
                          : Date.now();
                      
                      // Find records in the selected time range
                      const selectedRecords = selectedTraining.records.filter(record => {
                        if (!record.timestamp) return false;
                        const recordTime = new Date(record.timestamp).getTime();
                        const timeFromStart = (recordTime - trainingStartTime) / 1000;
                        return timeFromStart >= startTime && timeFromStart <= endTime;
                      });
                      
                      if (selectedRecords.length === 0) return null;
                      
                      // Calculate statistics
                      const speeds = selectedRecords.map(r => r.speed).filter(v => v && v > 0);
                      const heartRates = selectedRecords.map(r => r.heartRate).filter(v => v && v > 0);
                      const powers = selectedRecords.map(r => r.power).filter(v => v && v > 0);
                      const cadences = selectedRecords.map(r => r.cadence).filter(v => v && v > 0);
                      
                      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
                      const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
                      const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
                      const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
                      const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
                      const maxPower = powers.length > 0 ? Math.max(...powers) : null;
                      const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
                      
                      // Calculate distance
                      const firstRecord = selectedRecords[0];
                      const lastRecord = selectedRecords[selectedRecords.length - 1];
                      const totalDistance = lastRecord.distance && firstRecord.distance 
                        ? lastRecord.distance - firstRecord.distance 
                        : null;
                      
                      const duration = endTime - startTime;
                      
                      return {
                        duration,
                        totalDistance,
                        avgSpeed: avgSpeed ? (avgSpeed * 3.6).toFixed(1) : null, // km/h
                        maxSpeed: maxSpeed ? (maxSpeed * 3.6).toFixed(1) : null,
                        avgHeartRate,
                        maxHeartRate,
                        avgPower,
                        maxPower,
                        avgCadence
                      };
                    };

                    const handleCreateLap = async () => {
                      try {
                        const { start, end } = selectedTimeRange;
                        await createLap(selectedTraining._id, {
                          startTime: Math.min(start, end),
                          endTime: Math.max(start, end)
                        });
                        await loadTrainingDetail(selectedTraining._id);
                        setShowCreateLapButton(false);
                        setSelectedTimeRange({ start: 0, end: 0 });
                        setSelectionStats(null);
                      } catch (error) {
                        console.error('Error creating lap:', error);
                        alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                      }
                    };

                    return (
                      <div className="mb-4 md:mb-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                          <h3 className="text-lg md:text-xl font-semibold text-gray-900">Training Overview</h3>
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={handleResetZoom}
                              className="px-4 py-2 text-sm bg-primary text-white rounded-xl shadow-md transition-colors hover:bg-primary-dark"
                            >
                              Reset Zoom
                            </button>
                          </div>
                        </div>
                        {showCreateLapButton && selectionStats && (
                          <div className="mb-4 bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm border-2 border-primary/30 rounded-2xl p-4 md:p-6 shadow-lg">
                            <div className="flex items-center justify-between mb-3 md:mb-4">
                              <h4 className="text-base md:text-lg font-semibold text-gray-900">Selected Interval Statistics</h4>
                              <button
                                onClick={() => {
                                  setShowCreateLapButton(false);
                                  setSelectedTimeRange({ start: 0, end: 0 });
                                  setSelectionStats(null);
                                }}
                                className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-primary/30 shadow-sm">
                                <div className="text-xs md:text-sm text-gray-600 mb-1">Duration</div>
                                <div className="text-base md:text-lg font-bold text-primary">{formatDuration(selectionStats.duration)}</div>
                              </div>
                              {selectionStats.totalDistance && (
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-primary/30 shadow-sm">
                                  <div className="text-xs md:text-sm text-gray-600 mb-1">Distance</div>
                                  <div className="text-base md:text-lg font-bold text-primary">{formatDistance(selectionStats.totalDistance, user)}</div>
                                </div>
                              )}
                              {selectionStats.avgSpeed && (
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-primary/30 shadow-sm">
                                  <div className="text-xs md:text-sm text-gray-600 mb-1">Avg Speed</div>
                                  <div className="text-base md:text-lg font-bold text-primary">{selectionStats.avgSpeed} km/h</div>
                                  {selectionStats.maxSpeed && (
                                    <div className="text-xs text-gray-500 mt-1">Max: {selectionStats.maxSpeed} km/h</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgHeartRate && (
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-primary/30 shadow-sm">
                                  <div className="text-xs md:text-sm text-gray-600 mb-1">Avg HR</div>
                                  <div className="text-base md:text-lg font-bold text-red-600">{selectionStats.avgHeartRate} bpm</div>
                                  {selectionStats.maxHeartRate && (
                                    <div className="text-xs text-gray-500 mt-1">Max: {selectionStats.maxHeartRate} bpm</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgPower && (
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-primary/30 shadow-sm">
                                  <div className="text-xs md:text-sm text-gray-600 mb-1">Avg Power</div>
                                  <div className="text-base md:text-lg font-bold text-primary-dark">{selectionStats.avgPower} W</div>
                                  {selectionStats.maxPower && (
                                    <div className="text-xs text-gray-500 mt-1">Max: {selectionStats.maxPower} W</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgCadence && (
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-primary/30 shadow-sm">
                                  <div className="text-xs md:text-sm text-gray-600 mb-1">Avg Cadence</div>
                                  <div className="text-base md:text-lg font-bold text-greenos">{selectionStats.avgCadence} rpm</div>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 flex justify-end">
                              <button
                                onClick={handleCreateLap}
                                className="px-5 md:px-6 py-2 bg-primary text-white rounded-xl font-semibold shadow-md transition-colors flex items-center gap-2 hover:bg-primary-dark"
                              >
                                <span>✓</span> Create Interval
                              </button>
                            </div>
                          </div>
                        )}
                        {!showCreateLapButton && (
                          <div className="mb-2 text-xs md:text-sm text-gray-500 italic rounded-lg p-2 border border-primary/30 bg-primary/10">
                            💡 Tip: Click and drag to select an interval, or hold <kbd className="px-1.5 py-0.5 bg-white/80 rounded text-xs font-mono border border-gray-300">Shift</kbd> while dragging to zoom
                          </div>
                        )}
                        <div 
                          ref={trainingChartRef}
                          className="relative border border-white/40 rounded-2xl bg-white/70 backdrop-blur-sm p-3 md:p-4 select-none shadow-lg" 
                          style={{ height: `${chartHeight}px`, cursor: isDragging ? 'crosshair' : 'default' }}
                        >
                          {/* Drag selection rectangle */}
                          {isDragging && dragStart.x !== dragEnd.x && (
                            <>
                            <div
                              className="absolute border-2 border-primary bg-primary/20 pointer-events-none z-40"
                              style={{
                                left: `${Math.min(dragStart.x, dragEnd.x) + padding.left}px`,
                                top: `${padding.top}px`,
                                width: `${Math.abs(dragEnd.x - dragStart.x)}px`,
                                height: `${graphHeight}px`
                              }}
                            />
                              {/* Show hint text when dragging */}
                              <div
                                className="absolute pointer-events-none z-50 text-xs text-primary-dark bg-primary/30 px-2 py-1 rounded"
                                style={{
                                  left: `${(Math.min(dragStart.x, dragEnd.x) + Math.max(dragStart.x, dragEnd.x)) / 2 + padding.left}px`,
                                  top: `${padding.top + 5}px`,
                                  transform: 'translateX(-50%)'
                                }}
                              >
                                {(() => {
                                  const startTime = Math.min(dragStart.time, dragEnd.time);
                                  const endTime = Math.max(dragStart.time, dragEnd.time);
                                  const duration = endTime - startTime;
                                  return `${formatDuration(duration)} - Release to create interval`;
                                })()}
                              </div>
                            </>
                          )}
                          
                          {/* Invisible overlay div for drag selection - positioned above SVG */}
                          <div
                            className="absolute drag-overlay"
                            style={{
                              left: `${padding.left}px`,
                              top: `${padding.top}px`,
                              width: `${graphWidth}px`,
                              height: `${graphHeight}px`,
                              cursor: isDragging ? 'crosshair' : 'default',
                              zIndex: 10,
                              pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              
                              const container = trainingChartRef.current;
                              if (!container) return;
                              
                              const containerRect = container.getBoundingClientRect();
                              const clickX = e.clientX - containerRect.left;
                              
                              // Calculate start time using the same logic as in useEffect
                              const relativeX = clickX - padding.left;
                              const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
                              const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                              const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                              const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                              const startTime = zoomedMinTime + (normalizedX * zoomedTimeRange);
                              
                              // Use the dragStateRef from component scope
                              dragStateRef.current.isActive = true;
                              dragStateRef.current.start = { x: clickX, time: startTime };
                              dragStateRef.current.end = { x: clickX, time: startTime };
                              
                              setIsDragging(true);
                              setDragStart({ x: clickX, time: startTime });
                              setDragEnd({ x: clickX, time: startTime });
                            }}
                            onMouseMove={(e) => {
                              if (!dragStateRef.current.isActive) return;
                              
                              const container = trainingChartRef.current;
                              if (!container) return;
                              
                              const containerRect = container.getBoundingClientRect();
                              const clickX = e.clientX - containerRect.left;
                              
                              // Calculate end time
                              const relativeX = clickX - padding.left;
                              const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
                              const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                              const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                              const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                              const endTime = zoomedMinTime + (normalizedX * zoomedTimeRange);
                              
                              dragStateRef.current.end = { x: clickX, time: endTime };
                              setDragEnd({ x: clickX, time: endTime });
                            }}
                            onMouseUp={(e) => {
                              if (!dragStateRef.current.isActive) return;
                              
                              const startTime = Math.min(dragStateRef.current.start.time, dragStateRef.current.end.time);
                              const endTime = Math.max(dragStateRef.current.start.time, dragStateRef.current.end.time);
                              const timeRange = Math.abs(endTime - startTime);
                              
                              // If user wants to zoom (hold Shift), do zoom instead of showing create button
                              if (e.shiftKey && timeRange > chartData.maxTime * 0.01) {
                                // Zoom behavior when Shift is held
                                const newMin = startTime / chartData.maxTime;
                                const newMax = endTime / chartData.maxTime;
                                const newScale = 1 / (newMax - newMin);
                                
                                setTrainingZoom({
                                  min: newMin,
                                  max: newMax,
                                  scale: newScale
                                });
                              } else if (timeRange > chartData.maxTime * 0.01) {
                                // Show create interval button and stats (normal behavior)
                                setSelectedTimeRange({ start: startTime, end: endTime });
                                const stats = calculateSelectionStats(startTime, endTime);
                                setSelectionStats(stats);
                                setShowCreateLapButton(true);
                              }
                              
                              dragStateRef.current.isActive = false;
                              dragStateRef.current.start = { x: 0, time: 0 };
                              dragStateRef.current.end = { x: 0, time: 0 };
                              setIsDragging(false);
                              setDragStart({ x: 0, time: 0 });
                              setDragEnd({ x: 0, time: 0 });
                            }}
                            onMouseLeave={(e) => {
                              // Continue tracking mouse even when leaving overlay
                              if (dragStateRef.current.isActive) {
                                // Keep dragging active, mouseMoveGlobalHandler will handle it
                              }
                            }}
                          />
                          
                          <svg 
                            width="100%" 
                            height={svgHeight} 
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                            className="overflow-visible" 
                            style={{ cursor: isDragging ? 'crosshair' : 'default', pointerEvents: 'none', position: 'relative', zIndex: 1 }}
                          >
                            {/* Grid lines - based on zoom */}
                            {(() => {
                              const numGridLines = 5;
                              const gridValues = [];
                              for (let i = 0; i <= numGridLines; i++) {
                                const ratio = i / numGridLines;
                                const time = zoomedMinTime + (zoomedTimeRange * ratio);
                                gridValues.push({ time, x: zoomedXScale(time) });
                              }
                              return gridValues.map(({ time, x }, i) => {
                                if (x === null) return null;
                                return (
                                  <line
                                    key={`grid-x-${i}`}
                                    x1={x}
                                    y1={padding.top}
                                    x2={x}
                                    y2={padding.top + graphHeight}
                                    stroke="rgba(240, 240, 250, 0.8)"
                                    strokeWidth="1"
                                    strokeDasharray="2,2"
                                  />
                                );
                              });
                            })()}

                            {/* Interval Bars - Background bars showing intervals */}
                            {(() => {
                              if (!selectedTraining?.laps || selectedTraining.laps.length === 0) return null;
                              
                              // Deduplicate laps before processing
                              const uniqueLaps = deduplicateFitTrainingLaps(selectedTraining.laps);
                              if (uniqueLaps.length === 0) return null;
                              
                              // Get training start time from first record
                              const trainingStartTime = chartData.records[0]?.timestamp 
                                ? new Date(chartData.records[0].timestamp).getTime() 
                                : Date.now();
                              
                              // Calculate time positions for each lap
                              let cumulativeTime = 0;
                              const allIntervalBars = uniqueLaps.map((lap, index) => {
                                let startTime = cumulativeTime;
                                if (lap.startTime) {
                                  const lapStartTime = new Date(lap.startTime).getTime();
                                  startTime = (lapStartTime - trainingStartTime) / 1000;
                                }
                                
                                const duration = lap.totalElapsedTime || lap.totalTimerTime || 0;
                                const endTime = startTime + duration;
                                cumulativeTime = endTime;
                                
                                const power = lap.avgPower || lap.maxPower || 0;
                                
                                return {
                                  index,
                                  startTime,
                                  endTime,
                                  duration,
                                  power
                                };
                              });
                              
                              const intervalBars = allIntervalBars.filter(bar => bar.power > 0 && bar.duration > 0);
                              
                              if (intervalBars.length === 0) return null;
                              
                              const maxIntervalPower = intervalBars.length > 0 
                                ? Math.max(...intervalBars.map(b => b.power))
                                : chartData.maxPower || 100;
                              const effectiveMaxPower = chartData.maxPower > 0 ? chartData.maxPower : maxIntervalPower;
                              
                              return intervalBars.map((bar) => {
                                if (bar.endTime < zoomedMinTime || bar.startTime > zoomedMaxTime) return null;
                                
                                const xStart = zoomedXScale(Math.max(bar.startTime, zoomedMinTime));
                                const xEnd = zoomedXScale(Math.min(bar.endTime, zoomedMaxTime));
                                
                                if (xStart === null || xEnd === null) return null;
                                
                                const barX = xStart;
                                const barWidth = Math.max(2, xEnd - xStart);
                                
                                const barTop = effectiveMaxPower > 0 
                                  ? padding.top + graphHeight - ((bar.power / effectiveMaxPower) * graphHeight)
                                  : padding.top + graphHeight;
                                const barBottom = padding.top + graphHeight;
                                const barHeight = Math.max(2, barBottom - barTop);
                                
                                const powerRatio = effectiveMaxPower > 0 ? bar.power / effectiveMaxPower : 0;
                                const baseR = 200;
                                const baseG = 180;
                                const baseB = 255;
                                const r = Math.round(baseR - (powerRatio * 60));
                                const g = Math.round(baseG - (powerRatio * 100));
                                const b = Math.round(baseB - (powerRatio * 50));
                                
                                return (
                                  <rect
                                    key={`interval-bar-${bar.index}`}
                                    x={barX}
                                    y={barTop}
                                    width={barWidth}
                                    height={barHeight}
                                    fill={`rgba(${r}, ${g}, ${b}, 0.35)`}
                                    stroke={`rgba(${r}, ${g}, ${b}, 0.6)`}
                                    strokeWidth="1"
                                    rx="2"
                                    ry="2"
                                    style={{ pointerEvents: 'none' }}
                                  />
                                );
                              }).filter(bar => bar !== null);
                            })()}

                            {/* Speed line - lighter blue */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.speed) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.speed) return null;
                              
                              // Check if within zoom range
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`speed-${index}`}
                                  x1={x1}
                                  y1={speedYScale(prevRecord.speed)}
                                  x2={x2}
                                  y2={speedYScale(record.speed)}
                                  stroke="rgba(120, 180, 255, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
                                />
                              );
                            })}

                            {/* Heart Rate line - lighter red */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.heartRate) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.heartRate) return null;
                              
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`hr-${index}`}
                                  x1={x1}
                                  y1={hrYScale(prevRecord.heartRate)}
                                  x2={x2}
                                  y2={hrYScale(record.heartRate)}
                                  stroke="rgba(255, 120, 140, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
                                />
                              );
                            })}

                            {/* Power line - lighter orange/purple */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.power) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.power) return null;
                              
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`power-${index}`}
                                  x1={x1}
                                  y1={powerYScale(prevRecord.power)}
                                  x2={x2}
                                  y2={powerYScale(record.power)}
                                  stroke="rgba(200, 140, 220, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
                                />
                              );
                            })}

                            {/* Axis lines */}
                            <line
                              x1={padding.left}
                              y1={padding.top}
                              x2={padding.left}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />
                            <line
                              x1={padding.left}
                              y1={padding.top + graphHeight}
                              x2={padding.left + graphWidth}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />

                            {/* X-axis labels (Time) - based on zoom */}
                            {(() => {
                              const numLabels = 5;
                              const labels = [];
                              for (let i = 0; i <= numLabels; i++) {
                                const ratio = i / numLabels;
                                const time = zoomedMinTime + (zoomedTimeRange * ratio);
                                labels.push({ time, x: zoomedXScale(time) });
                              }
                              return labels.map(({ time, x }, i) => {
                                if (x === null) return null;
                                const totalSeconds = Math.floor(time);
                                const hours = Math.floor(totalSeconds / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                // Formát h:m (hodiny:minuty)
                                const timeStr = hours > 0 
                                  ? `${hours}:${minutes}`
                                  : `${minutes}`;
                                
                                return (
                                  <g key={`x-label-${i}`}>
                                    <line
                                      x1={x}
                                      y1={padding.top + graphHeight}
                                      x2={x}
                                      y2={padding.top + graphHeight + 5}
                                      stroke="rgba(200, 180, 220, 0.6)"
                                      strokeWidth="1"
                                    />
                                    <text
                                      x={x}
                                      y={padding.top + graphHeight + 20}
                                      textAnchor="middle"
                                      fontSize="11"
                                      fill="rgba(120, 90, 160, 0.8)"
                                      fontWeight="500"
                                    >
                                      {timeStr}
                                    </text>
                                  </g>
                                );
                              });
                            })()}


                            {/* Axis labels */}
                            <text
                              x={padding.left + graphWidth / 2}
                              y={svgHeight - 5}
                              textAnchor="middle"
                              fontSize="13"
                              fill="rgba(120, 90, 160, 0.9)"
                              fontWeight="600"
                            >
                              Time
                            </text>
                          </svg>
                          
                          {/* Training Chart Tooltip */}
                          {hoveredTrainingRecord && trainingTooltipPosition.x > 0 && trainingTooltipPosition.y > 0 && (
                            <div
                              className="absolute pointer-events-none z-50"
                              style={{
                                left: `${trainingTooltipPosition.x}px`,
                                top: `${trainingTooltipPosition.y}px`,
                                transform: 'translate(-50%, -100%)',
                                marginTop: '-10px',
                                minWidth: '200px',
                                maxWidth: '250px'
                              }}
                            >
                              <div
                                style={{
                                  background: 'rgba(255, 255, 255, 0.85)',
                                  backdropFilter: 'blur(10px) saturate(180%)',
                                  WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                                  borderRadius: '12px',
                                  padding: '12px 16px',
                                  boxShadow: '0 8px 32px rgba(139, 69, 190, 0.2), 0 0 1px rgba(139, 69, 190, 0.3) inset',
                                  border: '1px solid rgba(255, 255, 255, 0.3)'
                                }}
                              >
                                <div className="font-bold mb-2 text-primary-dark">Training Data</div>
                                <div className="text-sm space-y-1 text-gray-700">
                                  {hoveredTrainingRecord.speed && (
                                    <div className="font-medium">Speed: <span className="text-primary">{hoveredTrainingRecord.speed.toFixed(1)} km/h</span></div>
                                  )}
                                  {hoveredTrainingRecord.heartRate && (
                                    <div className="font-medium">Heart Rate: <span className="text-red">{Math.round(hoveredTrainingRecord.heartRate)} bpm</span></div>
                                  )}
                                  {hoveredTrainingRecord.power && (
                                    <div className="font-medium">Power: <span className="text-primary-dark">{Math.round(hoveredTrainingRecord.power)} W</span></div>
                                  )}
                                  <div className="font-medium">Time: <span className="text-primary-dark">{formatDuration(hoveredTrainingRecord.timeFromStart)}</span></div>
                                </div>
                              </div>
                              {/* Arrow */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '100%',
                                  transform: 'translateX(-50%)',
                                  width: 0,
                                  height: 0,
                                  borderLeft: '8px solid transparent',
                                  borderRight: '8px solid transparent',
                                  borderTop: '8px solid rgba(255, 255, 255, 0.85)',
                                  filter: 'drop-shadow(0 2px 4px rgba(139, 69, 190, 0.2))'
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Zoom indicator */}
                          {trainingZoom.scale > 1 && (
                            <div className="absolute top-2 right-2 text-xs text-gray-600 bg-white bg-opacity-80 px-2 py-1 rounded">
                              Zoom: {trainingZoom.scale.toFixed(1)}x
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Interval Chart (FIT) - linked with LapsTable row clicks */}
                  {selectedTraining && selectedTraining.laps && selectedTraining.laps.length > 0 && (
                    <div className={`${isMobile ? 'mb-2' : 'mb-4 md:mb-6'}`}>
                      <IntervalChart
                        laps={selectedTraining.laps}
                        sport={selectedTraining.sport || 'cycling'}
                        records={selectedTraining.records || []}
                        user={user}
                        selectedLapNumber={selectedLapNumber}
                        onSelectLapNumber={setSelectedLapNumber}
                      />
                    </div>
                  )}

                  {/* Laps/Intervals */}
                  <LapsTable 
                    training={selectedTraining}
                    onUpdate={loadTrainingDetail}
                    user={user}
                    selectedLapNumber={selectedLapNumber}
                    onSelectLapNumber={setSelectedLapNumber}
                  />
            </motion.div>
                        </div>
        )}

        {/* Strava Activity Detail */}
        {selectedStrava && (
          <div className={`w-full ${isMobile ? 'mt-2' : 'mt-4 md:mt-6'}`}>
            {!selectedStravaStreams ? (
              <div className={`${isMobile ? 'p-2' : 'p-4 md:p-6'} bg-yellow-50/80 backdrop-blur-sm border border-yellow-200/60 ${isMobile ? 'rounded-lg' : 'rounded-2xl'} shadow-md`}>
                <p className={`text-yellow-800 ${isMobile ? 'text-xs' : 'text-sm md:text-base'}`}>Loading graph data...</p>
                        </div>
            ) : (() => {
          const time = selectedStravaStreams?.time?.data || [];
          const maxTime = time.length > 0 ? time[time.length-1] : 0;
          
          // Get unique laps (deduplicated) - used for display
          deduplicateStravaLaps(selectedStrava?.laps || []);

          // Strava Title and Description Editor Component
          const StravaTitleEditor = ({ onExportToTraining }) => {
            const [isEditingTitle, setIsEditingTitle] = useState(false);
            const [isEditingDescription, setIsEditingDescription] = useState(false);
            const [isEditingCategory, setIsEditingCategory] = useState(false);
            const [title, setTitle] = useState(selectedStrava?.titleManual || selectedStrava?.name || '');
            const [description, setDescription] = useState(selectedStrava?.description || '');
            const [category, setCategory] = useState(selectedStrava?.category || '');
            const [saving, setSaving] = useState(false);
            const [allTitles, setAllTitles] = useState([]);
            const [showSuggestions, setShowSuggestions] = useState(false);
            const [filteredTitles, setFilteredTitles] = useState([]);
            const titleInputRef = useRef(null);
            const suggestionsRef = useRef(null);

            useEffect(() => {
              if (selectedStrava) {
                setTitle(selectedStrava?.titleManual || selectedStrava?.name || '');
                setDescription(selectedStrava?.description || '');
                setCategory(selectedStrava?.category || '');
              }
            // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [selectedStrava?.id, selectedStrava?.category]);

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

            const handleSaveTitle = async () => {
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { title: title.trim() || null });
                setIsEditingTitle(false);
                await loadStravaDetail(selectedStrava.id);
                await loadExternalActivities(); // Reload to update calendar
                // Show export dialog after saving title (with small delay to ensure data is loaded)
                if (onExportToTraining) {
                  setTimeout(() => {
                    onExportToTraining();
                  }, 500);
                }
                      } catch (error) {
                console.error('Error saving title:', error);
                alert('Error saving title');
              } finally {
                setSaving(false);
              }
            };

            const handleSaveDescription = async () => {
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { description: description.trim() || null });
                setIsEditingDescription(false);
                await loadStravaDetail(selectedStrava.id);
              } catch (error) {
                console.error('Error saving description:', error);
                alert('Error saving description');
              } finally {
                setSaving(false);
              }
            };

            const handleSaveCategory = async () => {
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { category: category || null });
                setIsEditingCategory(false);
                await loadStravaDetail(selectedStrava.id);
                await loadExternalActivities(); // Reload to update calendar
              } catch (error) {
                console.error('Error saving category:', error);
                alert('Error saving category');
              } finally {
                setSaving(false);
              }
            };

            const displayTitle = selectedStrava?.titleManual || selectedStrava?.name || 'Untitled Activity';
                    
                    return (
              <>
                {/* Title and Category - Clean and compact */}
                <div className={`${isMobile ? 'mb-2 pb-2' : 'mb-4 pb-3'} border-b border-gray-200/50`}>
                  <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-2' : 'gap-3'}`}>
                      {isEditingTitle ? (
                      <div className="flex items-center gap-2 flex-1">
                          <div className="relative flex-1">
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
                            className={`w-full ${isMobile ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-lg'} border-2 border-primary/50 ${isMobile ? 'rounded-md' : 'rounded-lg'} font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white/90 shadow-sm`}
                              placeholder="Enter title..."
                              autoFocus
                            />
                            {showSuggestions && filteredTitles.length > 0 && (
                              <div
                                ref={suggestionsRef}
                              className="absolute top-full left-0 right-0 mt-1 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
                              >
                                {filteredTitles.map((suggestion, index) => (
                                  <div
                                    key={index}
                                    onClick={() => {
                                      setTitle(suggestion);
                                      setShowSuggestions(false);
                                    }}
                                  className="px-3 py-2 bg-primary/10 hover:bg-primary/20 cursor-pointer text-sm transition-colors"
                                  >
                                    {suggestion}
                                    </div>
                                ))}
                              </div>
                            )}
                                    </div>
                        <div className={`flex ${isMobile ? 'gap-1.5 w-full' : 'gap-2'}`}>
                        <button
                            onClick={handleSaveTitle}
                            disabled={saving}
                          className={`${isMobile ? 'p-1.5 flex-1' : 'p-2'} bg-emerald-500 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md`}
                            title="Save title"
                          >
                          <CheckIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingTitle(false);
                              setTitle(displayTitle);
                            }}
                          className={`${isMobile ? 'p-1.5 flex-1' : 'p-2'} bg-gray-400 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-500 transition-all shadow-sm hover:shadow-md`}
                            title="Cancel"
                          >
                          <XMarkIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                        </div>
                      </div>
                      ) : (
                      <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'} flex-1 group`}>
                        <h1 className={`${isMobile ? 'text-sm' : 'text-lg md:text-xl'} font-semibold text-gray-900 flex-1`}>{displayTitle}</h1>
                          <button
                            onClick={() => setIsEditingTitle(true)}
                          className={`${isMobile ? 'opacity-100 p-1' : 'opacity-0 group-hover:opacity-100 p-1.5'} text-gray-500 hover:text-gray-700 hover:bg-gray-100 ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all`}
                            title="Edit title"
                          >
                          <PencilIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                            </div>
                          )}
                    
                    {/* Category - Right side */}
                    <div className={`flex items-center ${isMobile ? 'gap-1.5' : 'gap-2'} flex-shrink-0 ${isMobile ? 'w-full mt-2' : ''}`}>
                      {isEditingCategory ? (
                        <>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className={`${isMobile ? 'px-1.5 py-1 text-xs flex-1' : 'px-2 py-1.5 text-sm'} border border-gray-300 ${isMobile ? 'rounded-md' : 'rounded-lg'} bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                            autoFocus
                          >
                            <option value="">None</option>
                            <option value="endurance">Endurance</option>
                            <option value="tempo">Tempo</option>
                            <option value="threshold">Threshold</option>
                            <option value="vo2max">VO2max</option>
                            <option value="anaerobic">Anaerobic</option>
                            <option value="recovery">Recovery</option>
                          </select>
                          <button
                            onClick={handleSaveCategory}
                            disabled={saving}
                            className={`${isMobile ? 'p-1.5' : 'p-2'} bg-emerald-500 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md`}
                            title="Save category"
                          >
                            <CheckIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingCategory(false);
                              setCategory(selectedStrava?.category || '');
                            }}
                            className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gray-400 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-500 transition-all shadow-sm hover:shadow-md`}
                            title="Cancel"
                          >
                            <XMarkIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                        </>
                      ) : (
                        <div className={`flex items-center ${isMobile ? 'gap-1.5' : 'gap-2'} group`}>
                          <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} ${isMobile ? 'rounded-md' : 'rounded-lg'} font-medium ${
                            category === 'endurance' ? 'bg-blue-100 text-blue-800' :
                            category === 'tempo' ? 'bg-green-100 text-green-800' :
                            category === 'threshold' ? 'bg-yellow-100 text-yellow-800' :
                            category === 'vo2max' ? 'bg-orange-100 text-orange-800' :
                            category === 'anaerobic' ? 'bg-red-100 text-red-800' :
                            category === 'recovery' ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Category'}
                          </span>
                          <button
                            onClick={() => setIsEditingCategory(true)}
                            className={`${isMobile ? 'opacity-100 p-1' : 'opacity-0 group-hover:opacity-100 p-1.5'} text-gray-500 hover:text-gray-700 hover:bg-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all`}
                            title="Edit category"
                          >
                            <PencilIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                        </div>
                      )}
                        </div>
                      </div>
                </div>
                
                {/* Description - Modern and compact */}
                <div className={`${isMobile ? 'mb-1.5 p-1.5' : 'mb-4 p-3'} bg-gray-50 ${isMobile ? 'rounded-md' : 'rounded-lg'} border border-gray-200`}>
                  <div className={`flex items-start ${isMobile ? 'flex-col' : ''} gap-2`}>
                    {isEditingDescription ? (
                      <>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className={`flex-1 ${isMobile ? 'px-2 py-1.5 text-xs min-h-[60px]' : 'px-3 py-2 text-sm min-h-[80px]'} border border-gray-300 ${isMobile ? 'rounded-md' : 'rounded-lg'} bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y`}
                          placeholder="Enter description..."
                          autoFocus
                        />
                        <div className={`flex ${isMobile ? 'flex-row gap-1.5 w-full' : 'flex-col gap-1.5'} flex-shrink-0`}>
                        <button
                            onClick={handleSaveDescription}
                            disabled={saving}
                            className={`${isMobile ? 'p-1.5' : 'p-2'} bg-emerald-500 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md`}
                            title="Save description"
                          >
                            <CheckIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                          <button
                            onClick={() => {
                              setIsEditingDescription(false);
                              setDescription(selectedStrava?.description || '');
                            }}
                            className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gray-400 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-500 transition-all shadow-sm hover:shadow-md`}
                            title="Cancel"
                          >
                            <XMarkIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-2 w-full group">
                        <div className="flex-1">
                          {description ? (
                            <p className={`text-gray-800 whitespace-pre-wrap leading-relaxed ${isMobile ? 'text-xs' : 'text-sm'}`}>{description}</p>
                          ) : (
                          <button
                              onClick={() => setIsEditingDescription(true)}
                              className={`text-gray-400 hover:text-gray-600 w-full text-left py-1 transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
                          >
                              Click to add description...
                          </button>
                          )}
                        </div>
                        <button
                          onClick={() => setIsEditingDescription(true)}
                          className={`${isMobile ? 'opacity-100 p-1' : 'opacity-0 group-hover:opacity-100 p-1.5'} text-gray-500 hover:text-gray-700 hover:bg-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all flex-shrink-0`}
                          title="Edit description"
                        >
                          <PencilIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                    </div>
                  )}
          </div>
                </div>
              </>
            );
          };

          return (
            <div className={`bg-white/10 backdrop-blur-xl ${isMobile ? 'rounded-xl' : 'rounded-2xl sm:rounded-3xl'} border border-white/20 shadow-md ${isMobile ? 'p-2' : 'p-3 sm:p-4 md:p-6'} ${isMobile ? 'space-y-2' : 'space-y-3 sm:space-y-4 md:space-y-6'}`}>
              {/* Title and Description */}
              <StravaTitleEditor onExportToTraining={handleExportToTraining} />
              
              {/* Map Section */}
              {getGpsData.length > 0 && (
                <div className={`${isMobile ? 'mb-2' : 'mb-3 sm:mb-4 md:mb-6'}`}>
                  <div className={`bg-white/10 backdrop-blur-xl ${isMobile ? 'rounded-lg' : 'rounded-xl sm:rounded-2xl md:rounded-3xl'} border border-white/20 shadow-md ${isMobile ? 'p-1.5' : 'p-2 sm:p-3 md:p-4 lg:p-6'}`}>
                    <h3 className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-semibold text-gray-900 ${isMobile ? 'mb-1.5' : 'mb-2 sm:mb-3'}`}>Route Map</h3>
                    <div className={`relative ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl md:rounded-2xl'} overflow-hidden border border-white/20 ${isMobile ? 'h-[180px]' : 'h-[200px] sm:h-[300px] md:h-[400px]'}`}>
                      <MapContainer
                        center={getGpsData.length > 0 ? getGpsData[Math.floor(getGpsData.length / 2)] : [50.0755, 14.4378]}
                        zoom={13}
                        style={{ height: '100%', width: '100%', zIndex: 0 }}
                        scrollWheelZoom={true}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Polyline
                          positions={getGpsData}
                          pathOptions={{
                            color: '#767EB5',
                            weight: 4,
                            opacity: 0.8
                          }}
                        />
                        {getGpsData.length > 0 && (
                          <>
                            <Marker position={getGpsData[0]}>
                              <Popup>Start</Popup>
                            </Marker>
                            <Marker position={getGpsData[getGpsData.length - 1]}>
                              <Popup>Finish</Popup>
                            </Marker>
                          </>
                        )}
                      </MapContainer>
                </div>
                </div>
                </div>
              )}
              
              {/* Header Stats + Toggles */}
              <div className={`grid grid-cols-2 ${isMobile ? 'gap-1' : 'sm:grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2 md:gap-3 lg:gap-4'}`}>
                <div className={`backdrop-blur-md ${isMobile ? 'p-1' : 'p-1.5 sm:p-2 md:p-3 lg:p-4'} ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} border border-primary/20 bg-primary/10 shadow-sm`}>
                  <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-xs lg:text-sm'} text-gray-600`}>Duration</div>
                  <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl'} font-bold ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'} text-primary`}>{formatDuration(selectedStrava.elapsed_time)}</div>
                </div>
                <div className={`backdrop-blur-md ${isMobile ? 'p-1' : 'p-1.5 sm:p-2 md:p-3 lg:p-4'} ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} border border-primary/20 bg-primary/10 shadow-sm`}>
                  <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-xs lg:text-sm'} text-gray-600`}>Distance</div>
                  <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl'} font-bold ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'} text-primary`}>{formatDistance(selectedStrava.distance, user)}</div>
              </div>
                <div className={`bg-red/10 backdrop-blur-md ${isMobile ? 'p-1' : 'p-1.5 sm:p-2 md:p-3 lg:p-4'} ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} border border-red/20 shadow-sm`}>
                  <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-xs lg:text-sm'} text-gray-600`}>Avg Heart Rate</div>
                  <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl'} font-bold ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'} text-red`}>{selectedStrava.average_heartrate ? `${Math.round(selectedStrava.average_heartrate)} bpm` : '-'}</div>
                </div>
                <div className={`backdrop-blur-md ${isMobile ? 'p-1' : 'p-1.5 sm:p-2 md:p-3 lg:p-4'} ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} border border-primary/20 bg-primary/10 shadow-sm`}>
                  <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-xs lg:text-sm'} text-gray-600`}>Avg Power</div>
                  <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl'} font-bold ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'} text-primary-dark`}>{selectedStrava.average_watts ? `${Math.round(selectedStrava.average_watts)} W` : '-'}</div>
                </div>
              </div>

              {/* Detailed Statistics */}
              {selectedStrava && (
                <div className={`w-full overflow-x-auto ${isMobile ? 'mt-1.5' : 'mt-2 sm:mt-3 md:mt-4'}`}>
                  <div className={`flex flex-wrap ${isMobile ? 'gap-1' : 'gap-1.5 sm:gap-2 md:gap-3'}`}>
                    <div className={`flex-1 ${isMobile ? 'min-w-[90px] px-1 py-1' : 'min-w-[100px] sm:min-w-[120px] md:min-w-[160px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                      <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Date</div>
                      <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-gray-900`}>{formatDateTime(stravaActivityDate)}</div>
                    </div>
                    <div className={`flex-1 ${isMobile ? 'min-w-[70px] px-1 py-1' : 'min-w-[80px] sm:min-w-[100px] md:min-w-[140px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                      <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Sport</div>
                      <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-gray-900`}>{stravaActivitySport || '-'}</div>
                    </div>
                    {stravaAvgPower && (
                      <div className={`flex-1 ${isMobile ? 'min-w-[70px] px-1 py-1' : 'min-w-[80px] sm:min-w-[100px] md:min-w-[140px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                        <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Power</div>
                        <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-gray-900`}>{Math.round(stravaAvgPower)} W</div>
                        {stravaMaxPower && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 mt-0.5`}>Max: {Math.round(stravaMaxPower)} W</div>
                        )}
                      </div>
                    )}
                    {stravaAvgCadence && (
                      <div className={`flex-1 ${isMobile ? 'min-w-[70px] px-1 py-1' : 'min-w-[80px] sm:min-w-[100px] md:min-w-[140px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-blue-200 bg-blue-50 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                        <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Cadence</div>
                        <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-blue-700`}>{Math.round(stravaAvgCadence)} rpm</div>
                      </div>
                    )}
                    {stravaNormalizedPower && (
                      <div className={`flex-1 ${isMobile ? 'min-w-[70px] px-1 py-1' : 'min-w-[80px] sm:min-w-[100px] md:min-w-[140px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-green-200 bg-green-50 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                        <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Normalized Power</div>
                        <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-green-700`}>{Math.round(stravaNormalizedPower)} W</div>
                      </div>
                    )}
                    {calculateStravaTSS && (
                      <div className={`flex-1 ${isMobile ? 'min-w-[70px] px-1 py-1' : 'min-w-[80px] sm:min-w-[100px] md:min-w-[140px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-purple-200 bg-purple-50 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                        <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500 flex items-center gap-1`}>
                          TSS
                          {calculateStravaTSS.estimated && (
                            <span className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-400`} title="Estimated TSS (FTP not set in profile)">*</span>
                          )}
                        </div>
                        <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-purple-700`}>{calculateStravaTSS.value}</div>
                        {calculateStravaIF && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 mt-0.5`}>IF: {calculateStravaIF}</div>
                        )}
                      </div>
                    )}
                    {hasStravaElevation && (
                      <div className={`flex-1 ${isMobile ? 'min-w-[70px] px-1 py-1' : 'min-w-[80px] sm:min-w-[100px] md:min-w-[140px] px-1.5 sm:px-2 md:px-4 py-1.5 sm:py-2 md:py-3'} bg-white/90 border border-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} shadow-sm`}>
                        <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Elevation</div>
                        <div className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base'} font-semibold text-gray-900`}>{Math.round(stravaElevationGain)} m</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Training Chart - Modern SVG Version for Strava */}
              {(() => {
                // Convert Strava streams to records format
                if (!selectedStrava || !selectedStravaStreams) return null;
                
                const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                if (timeArray.length === 0) return null;
                
                const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                const distanceArray = selectedStravaStreams?.distance?.data || selectedStravaStreams?.distance || [];
                const cadenceArray = selectedStravaStreams?.cadence?.data || selectedStravaStreams?.cadence || [];
                const altitudeArray = selectedStravaStreams?.altitude?.data || selectedStravaStreams?.altitude || [];
                
                // Get activity start time
                const activityStartDate = selectedStrava?.start_date_local || 
                  selectedStrava?.start_date || 
                  selectedStrava?.raw?.start_date || 
                  selectedStrava?.startDate;
                const activityStartTime = activityStartDate ? new Date(activityStartDate).getTime() : Date.now();
                
                // Convert streams to records
                const records = timeArray.map((time, index) => {
                  const timestamp = new Date(activityStartTime + (time * 1000));
                  const distance = distanceArray[index] || (index > 0 ? distanceArray[index - 1] : 0);
                  
                  return {
                    timestamp: timestamp.toISOString(),
                    timeFromStart: time,
                    distance: distance,
                    speed: speedArray[index] || null,
                    heartRate: hrArray[index] || null,
                    power: powerArray[index] || null,
                    cadence: cadenceArray[index] || null,
                    altitude: altitudeArray[index] || null
                  };
                });
                
                const trainingData = {
                  _id: selectedStrava.id || selectedStrava.stravaId,
                  titleManual: selectedStrava.titleManual || selectedStrava.name,
                  sport: selectedStrava.sport || selectedStrava.sport_type || 'cycling',
                  timestamp: new Date(activityStartTime),
                  totalElapsedTime: timeArray[timeArray.length - 1] || 0,
                  totalDistance: distanceArray[distanceArray.length - 1] || selectedStrava.distance || 0,
                  records: records,
                  laps: selectedStrava.laps || []
                };
                
                if (trainingData.records && trainingData.records.length > 0) {
                  return (
                    <div className={`${isMobile ? 'mb-2' : 'mb-3 sm:mb-4 md:mb-6'}`}>
                      <h3 className={`${isMobile ? 'text-sm' : 'text-base sm:text-lg md:text-xl'} font-semibold text-gray-900 ${isMobile ? 'mb-2' : 'mb-3 sm:mb-4'}`}>Training Chart</h3>
                      <div className="overflow-x-auto -mx-2 sm:-mx-3 md:mx-0 px-2 sm:px-3 md:px-0">
                      <TrainingChart
                        training={trainingData}
                        userProfile={userProfile}
                        onHover={(point) => {
                          // Optional: handle hover events
                        }}
                        onLeave={() => {
                          // Optional: handle leave events
                        }}
                      />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Streams Chart (ECharts) */}
              {(() => {
                // Extract time, speed, hr, power arrays from streams
                // Handle both formats: {time: {data: [...]}} and {time: [...]}
                const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                const altitudeArray = selectedStravaStreams?.altitude?.data || selectedStravaStreams?.altitude || [];
                
                const time = timeArray;
                // Apply smoothing if enabled
                const speed = smoothData(speedArray, smoothingWindow, time);
                smoothData(hrArray, smoothingWindow, time); // HR smoothing applied
                smoothData(powerArray, smoothingWindow, time); // Power smoothing applied
                // altitudeArray used directly (don't smooth altitude)
                
                // Determine sport type
                const sportType = selectedStrava?.sport_type || selectedStrava?.sport || selectedStrava?.type || '';
                const isRun = sportType.toLowerCase().includes('run');
                const isSwim = sportType.toLowerCase().includes('swim');
                const usePace = isRun || isSwim;
                
                // Debug logging for running activities
                if (isRun) {
                  console.log('=== [FitAnalysisPage] Strava Running Data ===', {
                    activityName: selectedStrava?.name || selectedStrava?.titleManual || 'Unknown',
                    sportType: sportType,
                    speedArrayLength: speedArray.length,
                    timeArrayLength: timeArray.length,
                    speedSample: speedArray.slice(0, 5), // First 5 speed values
                    timeSample: timeArray.slice(0, 5), // First 5 time values
                    hasSpeedData: speedArray.length > 0 && speedArray.some(s => s > 0)
                  });
                }
                
                // Calculate pace from speed (in seconds per unit)
                // For run: pace in seconds per km (1000 / speed)
                // For swim: pace in seconds per 100m (100 / speed)
                const calculatePace = (speedMps) => {
                  if (!speedMps || speedMps <= 0) return null;
                  if (isRun) {
                    return 1000 / speedMps; // seconds per km
                  } else if (isSwim) {
                    return 100 / speedMps; // seconds per 100m
                  }
                  return null;
                };
                
                // Calculate pace array from speed
                const pace = usePace ? speed.map(s => calculatePace(s)).filter(p => p !== null && p > 0 && !isNaN(p)) : null;
                
                // Debug logging for pace calculation
                if (isRun && pace && pace.length > 0) {
                  const validPaces = pace.filter(p => p && p > 0 && !isNaN(p));
                  if (validPaces.length > 0) {
                    const minPace = Math.min(...validPaces);
                    const maxPace = Math.max(...validPaces);
                    const avgPace = validPaces.reduce((a, b) => a + b, 0) / validPaces.length;
                    console.log('=== [FitAnalysisPage] Calculated Running Pace ===', {
                      validPacesCount: validPaces.length,
                      minPace: `${Math.floor(minPace/60)}:${Math.round(minPace%60).toString().padStart(2,'0')}/km`,
                      maxPace: `${Math.floor(maxPace/60)}:${Math.round(maxPace%60).toString().padStart(2,'0')}/km`,
                      avgPace: `${Math.floor(avgPace/60)}:${Math.round(avgPace%60).toString().padStart(2,'0')}/km`,
                      minPaceSeconds: minPace,
                      maxPaceSeconds: maxPace,
                      avgPaceSeconds: avgPace
                    });
                  }
                }
                
                // Calculate pace range for Y-axis
                // For run: dynamically calculate from data with padding
                // For swim: 2:00/100m (120s) at bottom, 1:20/100m (80s) at top (with padding)
                let paceYAxisMin, paceYAxisMax;
                if (usePace) {
                  if (isRun) {
                    // Find min and max pace from data
                    const validPaces = pace.filter(p => p && p > 0 && !isNaN(p));
                    if (validPaces.length > 0) {
                      const minPace = Math.min(...validPaces); // Nejrychlejší pace (nejmenší hodnota v sekundách)
                      const maxPace = Math.max(...validPaces); // Nejpomalejší pace (největší hodnota v sekundách)
                      
                      // Přidat mezeru: min o něco pomalejší (větší hodnota), max o něco rychlejší (menší hodnota)
                      // Ale protože osa je invertovaná, min je nahoře (rychlejší) a max je dole (pomalejší)
                      // Takže paceYAxisMin (nahoře) = minPace - padding (ještě rychlejší)
                      // A paceYAxisMax (dole) = maxPace + padding (ještě pomalejší)
                      const padding = Math.max(10, (maxPace - minPace) * 0.1); // 10% nebo minimálně 10 sekund
                      paceYAxisMin = Math.max(120, Math.floor(minPace - padding)); // Minimálně 2:00/km
                      paceYAxisMax = Math.min(600, Math.ceil(maxPace + padding)); // Maximálně 10:00/km
                    } else {
                      // Fallback pokud nejsou data
                      paceYAxisMin = 200; // 3:20/km
                      paceYAxisMax = 300; // 5:00/km
                    }
                  } else { // swim
                    // Find min and max pace from data (similar to run)
                    const validPaces = pace.filter(p => p && p > 0 && !isNaN(p));
                    if (validPaces.length > 0) {
                      const minPace = Math.min(...validPaces); // Nejrychlejší pace (nejmenší hodnota v sekundách)
                      const maxPace = Math.max(...validPaces); // Nejpomalejší pace (největší hodnota v sekundách)
                      
                      // Přidat mezeru: min o něco pomalejší (větší hodnota), max o něco rychlejší (menší hodnota)
                      // Ale protože osa je invertovaná, min je nahoře (rychlejší) a max je dole (pomalejší)
                      // Takže paceYAxisMin (nahoře) = minPace - padding (ještě rychlejší)
                      // A paceYAxisMax (dole) = maxPace + padding (ještě pomalejší)
                      const padding = Math.max(5, (maxPace - minPace) * 0.1); // 10% nebo minimálně 5 sekund
                      paceYAxisMin = Math.max(30, Math.floor(minPace - padding)); // Minimálně 0:30/100m
                      paceYAxisMax = Math.min(300, Math.ceil(maxPace + padding)); // Maximálně 5:00/100m
                    } else {
                      // Fallback pokud nejsou data
                      // paceYAxisMin = 80;  // 1:20/100m
                      // paceYAxisMax = 120; // 2:00/100m
                    }
                  }
                }
                
                // Get unique laps (deduplicated) for interval chart
                const originalLaps = selectedStrava?.laps || [];
                const uniqueLaps = deduplicateStravaLaps(originalLaps);
                
                // Get records from trainingData if available (for km intervals in running)
                let trainingRecords = [];
                if (selectedStravaStreams) {
                  const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                  const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                  const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                  const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                  const distanceArray = selectedStravaStreams?.distance?.data || selectedStravaStreams?.distance || [];
                  const cadenceArray = selectedStravaStreams?.cadence?.data || selectedStravaStreams?.cadence || [];
                  
                  const activityStartDate = selectedStrava?.start_date_local || 
                    selectedStrava?.start_date || 
                    selectedStrava?.raw?.start_date || 
                    selectedStrava?.startDate;
                  const activityStartTime = activityStartDate ? new Date(activityStartDate).getTime() : Date.now();
                  
                  trainingRecords = timeArray.map((time, index) => {
                    const timestamp = new Date(activityStartTime + (time * 1000));
                    const distance = distanceArray[index] || (index > 0 ? distanceArray[index - 1] : 0);
                    
                    return {
                      timestamp: timestamp.toISOString(),
                      timeFromStart: time,
                      distance: distance,
                      speed: speedArray[index] ? speedArray[index] * 3.6 : null, // Convert m/s to km/h
                      heartRate: hrArray[index] || null,
                      power: powerArray[index] || null,
                      cadence: cadenceArray[index] || null
                    };
                  });
                }

                // For running, always show interval chart if we have records (to create km intervals)
                const isRunning = (selectedStrava?.sport || '').toLowerCase().includes('run');
                const shouldShowIntervalChart = (uniqueLaps && uniqueLaps.length > 0) || 
                  (isRunning && trainingRecords && trainingRecords.length > 0) ||
                  (trainingRecords && trainingRecords.length > 0);

                return (
                  <div className={`${isMobile ? 'space-y-2' : 'space-y-3'}`}>
                    {/* Interval Chart */}
                    {shouldShowIntervalChart ? (
                      <div className="overflow-x-auto -mx-2 sm:-mx-3 md:mx-0 px-2 sm:px-3 md:px-0">
                      <IntervalChart 
                          laps={uniqueLaps || []}
                          sport={selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || 'cycling'}
                          records={trainingRecords || []}
                          user={user}
                      />
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Strava Interval Creation Stats */}
              {showStravaCreateLapButton && stravaSelectionStats && (
                <div className={`${isMobile ? 'mt-2' : 'mt-3 sm:mt-4'} bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm border-2 border-primary/30 ${isMobile ? 'rounded-lg' : 'rounded-xl sm:rounded-2xl'} ${isMobile ? 'p-1.5' : 'p-2 sm:p-3 md:p-4 lg:p-6'} shadow-lg`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-1.5' : 'mb-2 sm:mb-3 md:mb-4'}`}>
                    <h4 className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base lg:text-lg'} font-semibold text-gray-900`}>Selected Interval Statistics</h4>
                    <button
                      onClick={() => {
                        setShowStravaCreateLapButton(false);
                        setStravaSelectedTimeRange({ start: 0, end: 0 });
                        setStravaSelectionStats(null);
                      }}
                      className={`text-gray-500 hover:text-gray-700 ${isMobile ? 'p-0.5' : 'p-1'} ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-100 transition-colors`}
                    >
                      ✕
                    </button>
                </div>
                  <div className={`grid ${isMobile ? 'grid-cols-2 gap-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3'}`}>
                    <div className={`bg-white/90 border border-primary/20 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Duration</div>
                          <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-primary`}>{formatDuration(stravaSelectionStats.duration)}</div>
                        </div>
                        <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'}`}>⏱️</div>
                      </div>
                    </div>
                    {stravaSelectionStats.totalDistance && (
                      <div className={`bg-white/90 border border-primary/20 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Distance</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-primary`}>{formatDistance(stravaSelectionStats.totalDistance, user)}</div>
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'}`}>📏</div>
                        </div>
                      </div>
                    )}
                    {stravaSelectionStats.avgSpeed && (
                      <div className={`bg-white/90 border border-primary/20 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Speed</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-primary`}>{stravaSelectionStats.avgSpeed} km/h</div>
                        {stravaSelectionStats.maxSpeed && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'}`}>Max: {stravaSelectionStats.maxSpeed} km/h</div>
                        )}
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'}`}>⚡</div>
                        </div>
                </div>
                    )}
                    {stravaSelectionStats.avgHeartRate && (
                      <div className={`bg-white/90 border border-rose-200 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg HR</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-rose-500`}>{stravaSelectionStats.avgHeartRate} bpm</div>
                        {stravaSelectionStats.maxHeartRate && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'}`}>Max: {stravaSelectionStats.maxHeartRate} bpm</div>
                        )}
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'} text-rose-400`}>❤️</div>
                        </div>
              </div>
                    )}
                    {stravaSelectionStats.avgPower && (
                      <div className={`bg-white/90 border border-indigo-200 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Power</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-indigo-600`}>{stravaSelectionStats.avgPower} W</div>
                        {stravaSelectionStats.maxPower && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'}`}>Max: {stravaSelectionStats.maxPower} W</div>
                        )}
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'} text-indigo-500`}>⚙️</div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`${isMobile ? 'mt-2' : 'mt-3 sm:mt-4'} flex justify-end`}>
                    <button
                      onClick={async () => {
                        try {
                          const { start, end } = stravaSelectedTimeRange;
                          await createStravaLap(selectedStrava.id, {
                            startTime: Math.min(start, end),
                            endTime: Math.max(start, end)
                          });
                          await loadStravaDetail(selectedStrava.id);
                          await loadExternalActivities(); // Reload Strava activities to update calendar
                          setShowStravaCreateLapButton(false);
                          setStravaSelectedTimeRange({ start: 0, end: 0 });
                          setStravaSelectionStats(null);
                          alert('Interval created successfully!');
                        } catch (error) {
                          console.error('Error creating Strava lap:', error);
                          alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                        }
                      }}
                      className={`${isMobile ? 'px-2.5 py-1.5 text-xs w-full' : 'px-3 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 text-xs sm:text-sm md:text-base w-full sm:w-auto'} bg-primary text-white ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} font-semibold shadow-md transition-colors flex items-center justify-center gap-2 hover:bg-primary-dark`}
                    >
                      <span>✓</span> Create Interval
                    </button>
                  </div>
                </div>
              )}
              

              {/* Laps/Intervals (Strava) */}
              <StravaLapsTable 
                selectedStrava={selectedStrava}
                stravaChartRef={null}
                maxTime={maxTime}
                loadStravaDetail={loadStravaDetail}
                loadExternalActivities={loadExternalActivities}
                onExportToTraining={handleExportToTraining}
                user={user}
              />
            </div>
          );
        })()}
          </div>
        )}

          </div>

      {/* Training Form Modal - Direct export with smart selection */}
      {showTrainingForm && trainingFormData && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isMobile ? 'p-2' : 'p-4'}`}>
          <div className={`w-full ${isMobile ? 'max-w-full' : 'max-w-4xl'} ${isMobile ? 'max-h-[95vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
            <TrainingForm
              onClose={() => {
                setShowTrainingForm(false);
                setTrainingFormData(null);
              }}
              onSubmit={handleTrainingFormSubmit}
              initialData={trainingFormData}
              isEditing={false}
              isLoading={isExporting}
                  />
                </div>
                </div>
                  )}
    </div>
  );
};

export default FitAnalysisPage;


