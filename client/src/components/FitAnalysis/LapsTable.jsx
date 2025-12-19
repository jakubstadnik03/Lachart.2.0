import React, { useState } from 'react';
import { formatDuration, formatDistance, formatSpeed } from '../../utils/fitAnalysisUtils';
import { updateLactateValues } from '../../services/api';

const LapsTable = ({ training, onUpdate, user }) => {
  const [editingLactate, setEditingLactate] = useState(false);
  const [lactateInputs, setLactateInputs] = useState({});
  
  // Additional safety check - ensure no duplicates in the component
  const uniqueLaps = React.useMemo(() => {
    if (!training || !training.laps || !Array.isArray(training.laps)) return [];
    
    console.log('LapsTable: Processing laps, count:', training.laps.length);
    
    const seen = new Map();
    const unique = [];
    
    training.laps.forEach((lap, index) => {
      // Strategy 1: Use startTime or start_date as primary identifier
      const startTime = lap.startTime || lap.start_time || lap.start_date;
      if (startTime) {
        const key = `time_${startTime}`;
        if (seen.has(key)) {
          console.warn(`LapsTable: Duplicate lap by startTime at index ${index}:`, {
            index,
            startTime,
            elapsedTime: lap.totalElapsedTime || lap.elapsed_time,
            distance: lap.totalDistance || lap.distance,
            power: lap.avgPower || lap.average_watts
          });
          return; // Skip this duplicate
        }
        seen.set(key, true);
        unique.push(lap);
        return;
      }
      
      // Strategy 2: Use _id if available
      if (lap._id) {
        const idStr = lap._id.toString();
        if (seen.has(`id_${idStr}`)) {
          console.warn(`LapsTable: Duplicate lap by _id at index ${index}`);
          return; // Skip this duplicate
        }
        seen.set(`id_${idStr}`, true);
        unique.push(lap);
        return;
      }
      
      // Strategy 3: Use combination of properties (without index to detect true duplicates)
      const elapsedTime = lap.totalElapsedTime || lap.total_elapsed_time || lap.elapsed_time || 0;
      const distance = lap.totalDistance || lap.total_distance || lap.distance || 0;
      const power = lap.avgPower || lap.avg_power || lap.average_watts || 0;
      const hr = lap.avgHeartRate || lap.avg_heart_rate || lap.average_heartrate || 0;
      
      // Create a key without index - if two laps have same values, they're duplicates
      const key = `t${Math.round(elapsedTime)}_d${Math.round(distance)}_p${Math.round(power)}_hr${Math.round(hr)}`;
      
      if (seen.has(key)) {
        console.warn(`LapsTable: Duplicate lap at index ${index}:`, {
          index,
          elapsedTime,
          distance,
          power,
          hr,
          existingIndex: seen.get(key)
        });
        return; // Skip this duplicate
      }
      seen.set(key, index); // Store index for reference
      unique.push(lap);
    });
    
    if (unique.length !== training.laps.length) {
      console.log(`LapsTable: Removed ${training.laps.length - unique.length} duplicate laps. Original: ${training.laps.length}, Unique: ${unique.length}`);
    }
    
    return unique;
  }, [training]);

  if (!training || !training.laps || uniqueLaps.length === 0) return null;

  const handleSaveLactate = async () => {
    const lactateValues = Object.entries(lactateInputs).map(([key, value]) => {
      const [type, index] = key.split('-');
      return {
        type,
        index: parseInt(index),
        lactate: parseFloat(value)
      };
    }).filter(lv => lv.lactate && !isNaN(lv.lactate));

    try {
      await updateLactateValues(training._id, lactateValues);
      await onUpdate(training._id);
      setEditingLactate(false);
      setLactateInputs({});
      alert('Lactate values saved successfully!');
    } catch (error) {
      console.error('Error saving lactate:', error);
      alert('Error saving lactate values');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900">Intervals</h3>
        <button
          onClick={() => setEditingLactate(!editingLactate)}
          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl hover:bg-primary-dark text-xs sm:text-sm shadow-md transition-colors w-full sm:w-auto"
        >
          {editingLactate ? 'Cancel Edit' : 'Add Lactate'}
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/40 bg-white/60 backdrop-blur-sm shadow-lg -mx-2 sm:mx-0">
        <table className="min-w-full divide-y divide-gray-200/50">
          <thead className="bg-white/80 backdrop-blur-sm">
            <tr>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">#</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Time</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase hidden sm:table-cell">Distance</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase hidden md:table-cell">Avg Speed</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Avg HR</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Avg Power</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Lactate</th>
            </tr>
          </thead>
          <tbody className="bg-white/40 backdrop-blur-sm divide-y divide-gray-200/30">
            {uniqueLaps.map((lap, index) => (
              <tr key={index} className={`transition-colors hover:bg-white/60 ${lap.lactate ? 'bg-primary/10' : ''}`}>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900">{index + 1}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{formatDuration(lap.totalElapsedTime)}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 hidden sm:table-cell">{formatDistance(lap.totalDistance, user)}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 hidden md:table-cell">{formatSpeed(lap.avgSpeed, user)}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{lap.avgHeartRate ? `${Math.round(lap.avgHeartRate)} bpm` : '-'}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{lap.avgPower ? `${Math.round(lap.avgPower)} W` : '-'}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
                      className="w-16 sm:w-20 md:w-24 px-1.5 sm:px-2 py-1 sm:py-1.5 border border-primary/50 rounded-lg text-xs sm:text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  ) : (
                    <span className={lap.lactate ? 'font-semibold text-primary-dark' : 'text-gray-500'}>
                      {lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '-'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingLactate && (
        <div className="mt-4 flex flex-col sm:flex-row justify-end gap-2">
          <button
            onClick={() => {
              setEditingLactate(false);
              setLactateInputs({});
            }}
            className="px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 shadow-md transition-colors text-sm w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveLactate}
            className="px-3 sm:px-4 py-2 bg-greenos text-white rounded-xl shadow-md transition-colors hover:opacity-90 text-sm w-full sm:w-auto"
          >
            Save Lactate Values
          </button>
        </div>
      )}
    </div>
  );
};

export default LapsTable;

