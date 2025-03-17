import React, { useState, useEffect } from 'react';
import { Trash, Plus, X, Save } from 'lucide-react';

function TestingForm({ testData, onTestDataChange, onSave }) {
  const formatDate = (dateString) => {
    if (!dateString) return new Date().toISOString().split('T')[0];
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const [rows, setRows] = useState(testData.results || []);
  const [formData, setFormData] = useState({
    title: testData.title || '',
    description: testData.description || '',
    weight: testData.weight || '',
    sport: testData.sport || '',
    baseLa: testData.baseLactate || '',
    date: formatDate(testData.date),
    specifics: testData.specifics || { specific: '', weather: '' },
    comments: testData.comments || ''
  });
  const [showGlucose, setShowGlucose] = useState(true);
  const [hoverGlucose, setHoverGlucose] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

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
        title: testData.title || '',
        description: testData.description || '',
        weight: testData.weight || '',
        sport: testData.sport || '',
        baseLa: testData.baseLactate || '',
        date: formatDate(testData.date),
        specifics: testData.specifics || { specific: '', weather: '' },
        comments: testData.comments || ''
      });
    }
  }, [testData]);

  const handleFormDataChange = (field, value) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    setIsDirty(true);

    // Propagate changes to parent component
    const updatedTestData = {
      ...testData,
      title: newFormData.title,
      description: newFormData.description,
      weight: newFormData.weight,
      sport: newFormData.sport,
      baseLactate: newFormData.baseLa,
      date: newFormData.date,
      specifics: newFormData.specifics,
      comments: newFormData.comments,
      results: rows
    };
    
    onTestDataChange(updatedTestData);
  };

  const handleValueChange = (rowIndex, field, value) => {
    // Ensure value is a valid number or empty string
    let processedValue = value;
    if (value !== '') {
      if (field === 'power' && (testData.sport === 'run' || testData.sport === 'swim')) {
        processedValue = value; // Keep pace format for run/swim
      } else {
        processedValue = Number(value) || 0;
      }
    }

    const updatedRows = rows.map((row, index) =>
      index === rowIndex ? { ...row, [field]: processedValue } : row
    );
    setRows(updatedRows);

    // Propagate changes to parent component with processed numeric values
    const updatedTestData = {
      ...testData,
      title: formData.title,
      description: formData.description,
      weight: formData.weight ? Number(formData.weight) : '',
      sport: formData.sport,
      baseLactate: formData.baseLa ? Number(formData.baseLa) : '',
      date: formData.date,
      specifics: formData.specifics,
      comments: formData.comments,
      results: updatedRows.map(row => ({
        power: row.power !== '' ? Number(row.power) || 0 : '',
        heartRate: row.heartRate !== '' ? Number(row.heartRate) || 0 : '',
        lactate: row.lactate !== '' ? Number(row.lactate) || 0 : '',
        glucose: row.glucose !== '' ? Number(row.glucose) || 0 : '',
        RPE: row.RPE !== '' ? Number(row.RPE) || 0 : ''
      }))
    };
    
    setIsDirty(true);
    onTestDataChange(updatedTestData);
  };

  const handleSaveChanges = () => {
    const updatedTest = {
      ...testData,
      title: formData.title,
      description: formData.description,
      weight: Number(formData.weight) || 0,
      sport: formData.sport,
      baseLactate: Number(formData.baseLa) || 0,
      date: formData.date,
      specifics: formData.specifics,
      comments: formData.comments,
      results: rows.map(row => ({
        power: Number(row.power) || 0,
        heartRate: Number(row.heartRate) || 0,
        lactate: Number(row.lactate) || 0,
        glucose: Number(row.glucose) || 0,
        RPE: Number(row.RPE) || 0
      }))
    };
    
    if (onSave) {
      onSave(updatedTest);
    }
    setIsDirty(false);
  };

  const handleDeleteRow = (rowIndex) => {
    const updatedRows = rows.filter((_, index) => index !== rowIndex);
    updatedRows.forEach((row, index) => (row.interval = index + 1));
    setRows(updatedRows);
    setIsDirty(true);
  };

  const handleAddRow = () => {
    const newRow = {
      power: '',
      heartRate: '',
      lactate: '',
      glucose: '',
      RPE: ''
    };
    
    const newRows = [...rows, newRow];
    setRows(newRows);

    // Propagate changes to parent component
    const updatedTestData = {
      ...testData,
      title: formData.title,
      description: formData.description,
      weight: formData.weight ? Number(formData.weight) : '',
      sport: formData.sport,
      baseLactate: formData.baseLa ? Number(formData.baseLa) : '',
      date: formData.date,
      specifics: formData.specifics,
      comments: formData.comments,
      results: newRows
    };
    
    setIsDirty(true);
    onTestDataChange(updatedTestData);
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto p-4 bg-gray-50 rounded-lg">
      <input 
        type="text"
        value={formData.title}
        onChange={(e) => handleFormDataChange('title', e.target.value)}
        className="w-full p-2 border rounded-lg mb-4"
        placeholder="Test Title *"
        required
      />

      <div className="flex gap-4 mb-4">
        <input 
          type="text"
          value={formData.specifics.specific}
          onChange={(e) => handleFormDataChange('specifics', { 
            ...formData.specifics, 
            specific: e.target.value 
          })}
          className="flex-1 p-2 border rounded-lg"
          placeholder="Specific (e.g., Indoor, Outdoor)"
        />
        <input 
          type="text"
          value={formData.specifics.weather}
          onChange={(e) => handleFormDataChange('specifics', { 
            ...formData.specifics, 
            weather: e.target.value 
          })}
          className="flex-1 p-2 border rounded-lg"
          placeholder="Weather"
        />
      </div>

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

      <textarea 
        value={formData.description} 
        onChange={(e) => handleFormDataChange('description', e.target.value)} 
        className="w-full p-2 border rounded-lg mt-4" 
        placeholder="Description of this testing..." 
      />

      <div className="flex gap-4 mt-4">
        <input 
          type="date" 
          value={formData.date}
          onChange={(e) => handleFormDataChange('date', e.target.value)} 
          className="p-2 border rounded-lg" 
        />
        <input 
          type="number" 
          value={formData.weight} 
          onChange={(e) => handleFormDataChange('weight', e.target.value)} 
          className="p-2 border rounded-lg w-24" 
          placeholder="Weight (kg)" 
        />
        <select 
          value={formData.sport} 
          onChange={(e) => handleFormDataChange('sport', e.target.value)} 
          className="p-2 border rounded-lg"
        >
          <option value="">Select sport *</option>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
        </select>
        <input 
          type="number" 
          value={formData.baseLa} 
          onChange={(e) => handleFormDataChange('baseLa', e.target.value)} 
          className="p-2 border rounded-lg w-24" 
          placeholder="Base La" 
        />
      </div>

      <textarea 
        value={formData.comments}
        onChange={(e) => handleFormDataChange('comments', e.target.value)}
        className="w-full p-2 border rounded-lg mt-4"
        placeholder="Comments"
      />

      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={handleAddRow} 
          className="flex items-center gap-2 px-4 py-2 text-white bg-green-500 rounded-lg hover:bg-green-600"
        >
          <Plus size={20} /> Add Interval
        </button>

        <button 
          onClick={handleSaveChanges}
          className="flex items-center gap-2 px-4 py-2 text-white bg-primary rounded-lg hover:bg-blue-600"
        >
          <Save size={20} /> Save Changes
        </button>
      </div>
    </div>
  );
}

export default TestingForm;
