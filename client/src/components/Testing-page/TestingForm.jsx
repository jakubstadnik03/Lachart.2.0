import React, { useState, useEffect } from 'react';
import { Trash, Plus, X } from 'lucide-react';

function TestingForm({ testData, onTestDataChange }) {
  const [rows, setRows] = useState(testData.results || []);
  const [formData, setFormData] = useState({
    description: testData.description || '',
    weight: testData.weight || '',
    sport: testData.sport || '',
    baseLa: testData.baseLactate || '',
    date: testData.date || new Date().toISOString().split('T')[0],
  });
  const [showGlucose, setShowGlucose] = useState(true);
  const [hoverGlucose, setHoverGlucose] = useState(false);

  const convertPaceToSeconds = (pace) => {
    const [minutes, seconds] = pace.split(":").map(Number);
    return minutes * 60 + seconds;
  };

  const convertSecondsToPace = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  useEffect(() => {
    if (testData) {
      setRows(testData.results || []);
      setFormData({
        description: testData.description || '',
        weight: testData.weight || '',
        sport: testData.sport || '',
        baseLa: testData.baseLactate || '',
        date: testData.date || new Date().toISOString().split('T')[0],
      });
    }
  }, [testData]);

  const handleValueChange = (rowIndex, field, value) => {
    if (value === "") {
      value = ""; // Pokud je prázdné, nastavíme prázdný řetězec
    } else if (value && value.includes(":")) {
      // Pokud je tempo ve formátu mm:ss, převedeme ho na sekundy
      value = convertPaceToSeconds(value);
    }
  
    const updatedRows = rows.map((row, index) =>
      index === rowIndex ? { ...row, [field]: value } : row
    );
    setRows(updatedRows);
    onTestDataChange({ ...testData, results: updatedRows });
  };
  

  const handleDeleteRow = (rowIndex) => {
    const updatedRows = rows.filter((_, index) => index !== rowIndex);
    updatedRows.forEach((row, index) => (row.interval = index + 1));
    setRows(updatedRows);
    onTestDataChange({ ...testData, results: updatedRows });
  };

  const handleAddRow = () => {
    const newRow = { power: '', heartRate: '', lactate: '', glucose: '', RPE: '' };
    setRows([...rows, newRow]);
    onTestDataChange({ ...testData, results: [...rows, newRow] });
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto p-4 bg-gray-50 rounded-lg">
      <div className="grid grid-cols-7 gap-2 items-center p-2 text-sm font-semibold bg-gray-100 rounded-lg">
        <div style={{paddingLeft: '12px'}}>Int.</div>
        <div>{formData.sport === 'run' || formData.sport === 'swim' ? 'Pace' : 'Power'}</div>
        <div>Heart Rate</div>
        <div>Lactate</div>
        {showGlucose && (
          <div
            className="relative"
            onMouseEnter={() => setHoverGlucose(true)}
            onMouseLeave={() => setHoverGlucose(false)}
          >
            Glucose
            {hoverGlucose && (
              <button className="absolute -top-2 -right-2 text-red-600" onClick={() => setShowGlucose(false)}>
                <X size={14} />
              </button>
            )}
          </div>
        )}
        <div>RPE</div>
        <div>Actions</div>
      </div>

      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-7 gap-2 items-center mt-2 p-2 bg-white rounded-lg">
          <div className="text-center">{index + 1}</div>
          <input 
            type="text" 
            value={formData.sport === 'run' || formData.sport === 'swim' ? convertSecondsToPace(row.power) : row.power}
            onChange={(e) => handleValueChange(index, 'power', e.target.value)} 
            className="p-1 border rounded-lg"
          />
          <input 
            type="number" 
            value={row.heartRate} 
            onChange={(e) => handleValueChange(index, 'heartRate', e.target.value)} 
            className="p-1 border rounded-lg" 
          />
          <input 
            type="number" 
            value={row.lactate} 
            onChange={(e) => handleValueChange(index, 'lactate', e.target.value)} 
            className="p-1 border rounded-lg" 
          />
          {showGlucose && <input 
            type="number" 
            value={row.glucose} 
            onChange={(e) => handleValueChange(index, 'glucose', e.target.value)} 
            className="p-1 border rounded-lg" 
          />}
          <input 
            type="number" 
            value={row.RPE} 
            onChange={(e) => handleValueChange(index, 'RPE', e.target.value)} 
            className="p-1 border rounded-lg" 
          />
          <button onClick={() => handleDeleteRow(index)} className="p-1 text-red-600"><Trash size={20} /></button>
        </div>
      ))}

      <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full p-2 border rounded-lg mt-4" placeholder="Description of this testing..." />

      <div className="flex gap-4 mt-4">
        <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="p-2 border rounded-lg" />
        <input type="text" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} className="p-2 border rounded-lg w-12" placeholder="Weight (kg)" />
        <select value={formData.sport} onChange={(e) => setFormData({ ...formData, sport: e.target.value })} className="p-2 border rounded-lg">
          <option value="">Select sport</option>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
        </select>
        <input type="text" value={formData.baseLa} onChange={(e) => setFormData({ ...formData, baseLa: e.target.value })} className="p-2 border rounded-lg w-12" placeholder="Base La (mmol/L)" />
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={handleAddRow} className="flex items-center gap-2 px-4 py-2 text-white bg-green-500 rounded-lg">
          <Plus size={20} /> Add Interval
        </button>
      </div>
    </div>
  );
}

export default TestingForm;
