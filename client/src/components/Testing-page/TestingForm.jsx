import React, { useState, useEffect } from 'react';
import { Trash, Plus, X, Save } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';

function TestingForm({ testData, onTestDataChange, onSave, onGlucoseColumnChange }) {
  const { addNotification } = useNotification();

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const convertPaceToSeconds = (pace) => {
    if (!pace) return '';
    try {
      const [minutes, seconds] = pace.split(':').map(Number);
      if (isNaN(minutes) || isNaN(seconds)) return '';
      return minutes * 60 + seconds;
    } catch (error) {
      console.error('Error converting pace to seconds:', error);
      return '';
    }
  };

  const convertSecondsToPace = (seconds) => {
    if (!seconds && seconds !== 0) return '';
    try {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('Error converting seconds to pace:', error);
      return '';
    }
  };

  const [formData, setFormData] = useState({
    title: testData?.title || '',
    description: testData?.description || '',
    weight: testData?.weight || '',
    sport: testData?.sport || '',
    baseLa: testData?.baseLactate || '',
    date: formatDate(testData?.date),
    specifics: testData?.specifics || { specific: '', weather: '' },
    comments: testData?.comments || ''
  });

  const [rows, setRows] = useState(testData?.results?.map(row => ({
    interval: row.interval || 1,
    power: formData.sport === 'bike' ? (row.power || 0) : (row.power ? convertSecondsToPace(row.power) : '0:00'),
    heartRate: row.heartRate || 0,
    lactate: row.lactate || 0,
    glucose: row.glucose || 0,
    RPE: row.RPE || 0
  })) || [{
    interval: 1,
    power: formData.sport === 'bike' ? 0 : '0:00',
    heartRate: 0,
    lactate: 0,
    glucose: 0,
    RPE: 0
  }]);

  const [showGlucose, setShowGlucose] = useState(true);
  const [hoverGlucose, setHoverGlucose] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Check if any row has glucose data
  const hasGlucoseData = rows.some(row => 
    row.glucose !== undefined && 
    row.glucose !== null && 
    row.glucose !== '' && 
    Number(row.glucose) !== 0
  );

  // Update showGlucose based on whether there's any non-zero glucose data
  useEffect(() => {
    if (!hasGlucoseData) {
      setShowGlucose(false);
    }
  }, [hasGlucoseData]);

  // Notify parent component when glucose column visibility changes
  useEffect(() => {
    if (onGlucoseColumnChange) {
      onGlucoseColumnChange(!showGlucose);
    }
  }, [showGlucose, onGlucoseColumnChange]);

  const handlePaceChange = (index, value) => {
    console.log('Pace change:', { index, value });
    const updatedRows = rows.map((row, i) =>
      i === index ? { ...row, power: value } : row
    );
    console.log('Updated rows after pace change:', updatedRows);
    setRows(updatedRows);
    setIsDirty(true);
  };

  const handleValueChange = (rowIndex, field, value) => {
    console.log('Value change:', { rowIndex, field, value, currentSport: formData.sport });
    
    if (field === 'power' && (formData.sport === 'run' || formData.sport === 'swim')) {
      handlePaceChange(rowIndex, value);
      return;
    }

    let processedValue = value;

    // Ensure numeric values are properly converted
    if (field !== 'power' || formData.sport === 'bike') {
      processedValue = value === '' ? 0 : Number(value);
    }

    const updatedRows = rows.map((row, index) =>
      index === rowIndex ? { ...row, [field]: processedValue } : row
    );
    console.log('Updated rows after value change:', updatedRows);
    setRows(updatedRows);
    setIsDirty(true);

    // Update glucose visibility when glucose value changes
    if (field === 'glucose') {
      const hasNonZeroGlucose = updatedRows.some(row => Number(row.glucose) > 0);
      setShowGlucose(hasNonZeroGlucose);
    }

    // Propagate changes to parent component with processed rows
    const processedRows = updatedRows.map((row, idx) => ({
      interval: idx + 1,
      power: formData.sport === 'bike' ? 
        (row.power === '' ? 0 : Number(row.power)) :
        (row.power ? convertPaceToSeconds(row.power) : 0),
      heartRate: row.heartRate === '' ? 0 : Number(row.heartRate),
      lactate: row.lactate === '' ? 0 : Number(row.lactate),
      glucose: row.glucose === '' ? 0 : Number(row.glucose),
      RPE: row.RPE === '' ? 0 : Number(row.RPE)
    }));

    const updatedTestData = {
      ...testData,
      results: processedRows
    };
    
    onTestDataChange(updatedTestData);
  };

  useEffect(() => {
    if (testData) {
      console.log('Initial test data:', testData);
      setRows(testData.results?.map(row => ({
        ...row,
        power: formData.sport === 'bike' ? row.power : row.power ? convertSecondsToPace(row.power) : ''
      })) || []);
    }
  }, [testData, formData.sport]);

  const handleFormDataChange = (field, value) => {
    console.log('Form data change:', { field, value, currentSport: formData.sport });
    
    if (field === 'sport') {
      console.log('Sport changed, resetting form:', { from: formData.sport, to: value });
      
      // Create new form data with updated sport
      const newFormData = {
        ...formData,
        sport: value
      };
      setFormData(newFormData);
      
      // Update rows with converted power values
      const updatedRows = rows.map(row => {
        let power = row.power;
        if (value === 'bike' && power) {
          // Convert from pace to power (seconds)
          power = convertPaceToSeconds(power);
        } else if ((value === 'run' || value === 'swim') && power) {
          // Convert from power (seconds) to pace
          power = convertSecondsToPace(power);
        }
        return { ...row, power };
      });
      setRows(updatedRows);
      
      // Create complete updated test data
      const updatedTestData = {
        ...testData,
        title: newFormData.title,
        description: newFormData.description,
        weight: newFormData.weight ? Number(newFormData.weight) : '',
        sport: value,
        baseLactate: newFormData.baseLa ? Number(newFormData.baseLa) : '',
        date: newFormData.date,
        specifics: newFormData.specifics,
        comments: newFormData.comments,
        results: updatedRows
      };
      
      console.log('Updating test data with new sport:', updatedTestData);
      onTestDataChange(updatedTestData);
      return;
    }

    // For other field changes
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    setIsDirty(true);

    // Propagate changes to parent component
    const updatedTestData = {
      ...testData,
      title: newFormData.title,
      description: newFormData.description,
      weight: newFormData.weight ? Number(newFormData.weight) : '',
      sport: newFormData.sport,
      baseLactate: newFormData.baseLa ? Number(newFormData.baseLa) : '',
      date: newFormData.date,
      specifics: newFormData.specifics,
      comments: newFormData.comments,
      results: rows
    };
    
    console.log('Propagating changes to parent:', updatedTestData);
    onTestDataChange(updatedTestData);
  };

  const handleSaveChanges = () => {
    if (!formData.title) {
      addNotification('Test title is required', 'error');
      return;
    }
    
    if (!formData.sport) {
      addNotification('Sport is required', 'error');
      return;
    }
    
    // Process rows to ensure correct format with numeric values
    const processedRows = rows.map((row, index) => {
      let power = row.power;
      
      // Convert power based on sport type
      if (formData.sport === 'bike') {
        power = power === '' ? 0 : Number(power);
      } else if (formData.sport === 'run' || formData.sport === 'swim') {
        power = power ? convertPaceToSeconds(power) : 0;
      }
      
      // Ensure all numeric values are properly converted
      return {
        interval: index + 1,
        power: power,
        heartRate: row.heartRate === '' ? 0 : Number(row.heartRate),
        lactate: row.lactate === '' ? 0 : Number(row.lactate),
        glucose: row.glucose === '' ? 0 : Number(row.glucose),
        RPE: row.RPE === '' ? 0 : Number(row.RPE)
      };
    });
    
    const updatedTest = {
      ...testData,
      title: formData.title,
      description: formData.description || '',
      weight: formData.weight === '' ? 0 : Number(formData.weight),
      sport: formData.sport,
      baseLactate: formData.baseLa === '' ? 0 : Number(formData.baseLa),
      date: formData.date,
      specifics: formData.specifics || { specific: '', weather: '' },
      comments: formData.comments || '',
      results: processedRows
    };
    
    console.log('Saving test data:', updatedTest);
    
    if (onSave) {
      try {
        onSave(updatedTest);
        addNotification('Test data saved successfully', 'success');
      } catch (error) {
        console.error('Error saving test data:', error);
        addNotification('Failed to save test data', 'error');
      }
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
      interval: rows.length + 1,
      power: formData.sport === 'bike' ? 0 : '0:00',
      heartRate: 0,
      lactate: 0,
      glucose: 0,
      RPE: 0
    };
    
    const newRows = [...rows, newRow];
    setRows(newRows);
    setIsDirty(true);
  };

  // Calculate grid columns based on whether glucose is shown
  const gridCols = showGlucose ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-4 sm:grid-cols-6';

  // Add useEffect to handle testData changes
  useEffect(() => {
    if (testData) {
      console.log('Test data changed, updating form:', testData);
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
      
      setRows(testData.results?.map(row => ({
        ...row,
        power: testData.sport === 'bike' ? row.power : row.power ? convertSecondsToPace(row.power) : ''
      })) || []);
    }
  }, [testData]);

  return (
    <div className={`flex flex-col w-full max-w-l mx-auto p-1 sm:px-1 sm:py-4 bg-gray-50 rounded-lg ${!showGlucose ? 'w-11/12 mx-0' : ''}`}>
      <input 
        type="text"
        value={formData.title}
        onChange={(e) => handleFormDataChange('title', e.target.value)}
        className="w-full p-2 border rounded-lg mb-4"
        placeholder="Test Title *"
        required
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
        <input 
          type="text"
          value={formData.specifics.specific}
          onChange={(e) => handleFormDataChange('specifics', { 
            ...formData.specifics, 
            specific: e.target.value 
          })}
          className="w-full p-2 border rounded-lg"
          placeholder="Specific (e.g., Indoor, Outdoor)"
        />
        <input 
          type="text"
          value={formData.specifics.weather}
          onChange={(e) => handleFormDataChange('specifics', { 
            ...formData.specifics, 
            weather: e.target.value 
          })}
          className="w-full p-2 border rounded-lg"
          placeholder="Weather"
        />
      </div>

      <div className={`grid ${gridCols} gap-1 sm:gap-2 items-center p-2 text-xs sm:text-sm font-semibold bg-gray-100 rounded-lg`}>
        <div className="text-center">Int.</div>
        <div className="text-center">{formData.sport === 'run' || formData.sport === 'swim' ? 'Pace' : 'Power'}</div>
        <div className="text-center">HR</div>
        <div className="text-center">La</div>
        {showGlucose && (
          <div className="hidden sm:block text-center relative"
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
        <div className="hidden sm:block text-center">RPE</div>
        <div className="hidden sm:block text-center">Actions</div>
      </div>

      {rows.map((row, index) => (
        <div key={index} className={`grid ${gridCols} gap-1 sm:gap-2 items-center mt-2 p-2 bg-white rounded-lg`}>
          <div className="text-center text-sm">{index + 1}</div>
          <input 
            type={formData.sport === 'bike' ? "number" : "text"}
            value={row.power || ''}
            onChange={(e) => {
              console.log('Input change:', e.target.value);
              handleValueChange(index, 'power', e.target.value);
            }}
            className="p-1 text-sm border rounded-lg"
            placeholder={formData.sport === 'bike' ? "Power" : "Pace (MM:SS)"}
          />
          <input 
            type="number" 
            value={row.heartRate || ''}
            onChange={(e) => handleValueChange(index, 'heartRate', e.target.value)} 
            className="p-1 text-sm border rounded-lg" 
          />
          <input 
            type="number" 
            value={row.lactate || ''}
            onChange={(e) => handleValueChange(index, 'lactate', e.target.value)} 
            className="p-1 text-sm border rounded-lg" 
          />
          {showGlucose && <input 
            type="number" 
            value={row.glucose || ''}
            onChange={(e) => handleValueChange(index, 'glucose', e.target.value)} 
            className="hidden sm:block p-1 text-sm border rounded-lg" 
          />}
          <input 
            type="number" 
            value={row.RPE || ''}
            onChange={(e) => handleValueChange(index, 'RPE', e.target.value)} 
            className="hidden sm:block p-1 text-sm border rounded-lg" 
          />
          <button onClick={() => handleDeleteRow(index)} className="hidden sm:block p-1 text-red-600"><Trash size={20} /></button>
        </div>
      ))}

      <textarea 
        value={formData.description} 
        onChange={(e) => handleFormDataChange('description', e.target.value)} 
        className="w-full p-2 border rounded-lg mt-4" 
        placeholder="Description of this testing..." 
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4">
        <input 
          type="date" 
          value={formData.date}
          onChange={(e) => handleFormDataChange('date', e.target.value)} 
          className="p-2 border rounded-lg w-full sm:w-auto" 
        />
        <input 
          type="number" 
          value={formData.weight} 
          onChange={(e) => handleFormDataChange('weight', e.target.value)} 
          className="p-2 border rounded-lg w-full sm:w-24" 
          placeholder="Weight (kg)" 
        />
        <select 
          value={formData.sport} 
          onChange={(e) => handleFormDataChange('sport', e.target.value)} 
          className="p-2 border rounded-lg w-full sm:w-auto"
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
          className="p-2 border rounded-lg w-full sm:w-24" 
          placeholder="Base La" 
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 mt-4">
        <button 
          onClick={handleAddRow} 
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-white bg-green rounded-lg hover:bg-green-600"
        >
          <Plus size={20} /> Add Interval
        </button>

        <button 
          onClick={handleSaveChanges}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-white bg-primary rounded-lg hover:bg-blue-600"
        >
          <Save size={20} /> Save Changes
        </button>
      </div>
    </div>
  );
}

export default TestingForm;
