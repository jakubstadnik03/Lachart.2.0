import React, { useState } from 'react';
import { formatDuration, formatDistance, formatSpeed } from '../../utils/fitAnalysisUtils';
import { updateLactateValues } from '../../services/api';

const LapsTable = ({ training, onUpdate }) => {
  const [editingLactate, setEditingLactate] = useState(false);
  const [lactateInputs, setLactateInputs] = useState({});

  if (!training || !training.laps || training.laps.length === 0) return null;

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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Intervals</h3>
        <button
          onClick={() => setEditingLactate(!editingLactate)}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
        >
          {editingLactate ? 'Cancel Edit' : 'Add Lactate'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Speed</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg HR</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Power</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lactate</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {training.laps.map((lap, index) => (
              <tr key={index} className={lap.lactate ? 'bg-purple-50' : ''}>
                <td className="px-4 py-3 text-sm">{index + 1}</td>
                <td className="px-4 py-3 text-sm">{formatDuration(lap.totalElapsedTime)}</td>
                <td className="px-4 py-3 text-sm">{formatDistance(lap.totalDistance)}</td>
                <td className="px-4 py-3 text-sm">{formatSpeed(lap.avgSpeed)}</td>
                <td className="px-4 py-3 text-sm">{lap.avgHeartRate ? `${Math.round(lap.avgHeartRate)} bpm` : '-'}</td>
                <td className="px-4 py-3 text-sm">{lap.avgPower ? `${Math.round(lap.avgPower)} W` : '-'}</td>
                <td className="px-4 py-3 text-sm">
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
                      className="w-20 px-2 py-1 border rounded text-sm"
                    />
                  ) : (
                    lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingLactate && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditingLactate(false);
              setLactateInputs({});
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveLactate}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Save Lactate Values
          </button>
        </div>
      )}
    </div>
  );
};

export default LapsTable;

