import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Trash, Plus, X, Save, HelpCircle, ArrowRight, Edit } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { trackEvent } from '../../utils/analytics';

// Tutorial steps configuration
const tutorialSteps = [
  {
    field: 'title',
    message: 'Start by entering the test title',
    example: 'Example: Lactate Test - Bike (15.3.2024)'
  },
  {
    field: 'sport',
    message: 'Select the sport for your test',
    example: 'Running, Cycling or Swimming'
  },
  {
    field: 'weight',
    message: 'Enter your weight',
    example: 'Value in kg (e.g., 75)'
  },
  {
    field: 'baseLa',
    message: 'Enter your baseline lactate level',
    example: 'Value in mmol/L measured before the test (e.g., 1.2)'
  },
  {
    field: 'power_0',
    message: 'Enter power/pace for the first interval',
    example: 'For cycling: watts (e.g., 200W)\nFor running/swimming: pace (e.g., 4:30)'
  },
  {
    field: 'heartRate_0',
    message: 'Enter heart rate',
    example: 'Value in beats per minute (e.g., 150)'
  },
  {
    field: 'lactate_0',
    message: 'Enter measured lactate value',
    example: 'Value in mmol/L (e.g., 2.5)'
  }
];

// Portal-based Tutorial message component
const TutorialMessagePortal = ({ step, onNext, onSkip, inputRef }) => {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (inputRef && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX + rect.width / 2,
        width: rect.width
      });
    }
  }, [inputRef, step]);

  if (!step) return null;

  return ReactDOM.createPortal(
    <div 
      ref={tooltipRef}
      className="z-50 bg-white rounded-lg shadow-lg border border-primary/10 p-4 max-w-xs"
      style={{
        position: 'absolute',
        top: coords.top - 16, // 16px above input
        left: coords.left,
        transform: 'translate(-50%, -100%)',
        animation: 'fadeIn 0.3s ease-out',
        pointerEvents: 'auto',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold">
          ?
        </div>
        <div className="flex-1">
          <p className="text-gray-800 font-medium mb-1">{step.message}</p>
          <p className="text-gray-500 text-sm whitespace-pre-line">{step.example}</p>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={onSkip}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Skip tutorial
            </button>
            <button
              onClick={onNext}
              className="flex items-center gap-1 text-primary hover:text-primary-dark font-medium"
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="absolute w-3 h-3 bg-white transform rotate-45 border-r border-b border-primary/10"
           style={{
             bottom: '-6px',
             left: '50%',
             marginTop: '-3px'
           }}
      />
    </div>,
    document.body
  );
};

// Tooltip component
const Tooltip = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div className="absolute z-50 bg-gray-900 text-white text-sm px-2 py-1 rounded-md -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          {content}
        </div>
      )}
    </div>
  );
};

// Field help content configuration
const fieldHelp = {
  title: {
    text: "Zadejte název testu (např. 'Laktátový test - Kolo')",
    example: "Příklad: Laktátový test 15.3.2024"
  },
  sport: {
    text: "Vyberte sport, pro který test provádíte",
    example: "Běh, Kolo nebo Plavání"
  },
  power: {
    bike: {
      text: "Zadejte výkon ve wattech pro tento interval",
      example: "Příklad: 200W"
    },
    run: {
      text: "Zadejte tempo ve formátu MM:SS na kilometr",
      example: "Příklad: 4:30"
    },
    swim: {
      text: "Zadejte tempo ve formátu MM:SS na 100m",
      example: "Příklad: 1:45"
    }
  },
  heartRate: {
    text: "Zadejte tepovou frekvenci v úderech za minutu",
    example: "Příklad: 150"
  },
  lactate: {
    text: "Zadejte naměřenou hodnotu laktátu v mmol/L",
    example: "Příklad: 2.5"
  },
  glucose: {
    text: "Zadejte hodnotu glukózy v krvi (volitelné)",
    example: "Příklad: 5.5"
  },
  RPE: {
    text: "Zadejte subjektivní hodnocení zátěže (1-10)",
    example: "Příklad: 7"
  },
  weight: {
    text: "Zadejte váhu v kilogramech",
    example: "Příklad: 75"
  },
  baseLa: {
    text: "Zadejte klidovou hodnotu laktátu před testem",
    example: "Příklad: 1.2"
  }
};

// Input help tooltip component
const InputHelp = ({ field, isVisible, position }) => {
  if (!isVisible || !fieldHelp[field]) return null;

  return (
    <div 
      className="absolute z-50 bg-white px-4 py-3 rounded-lg shadow-lg border border-primary/10 max-w-xs"
      style={{
        ...position,
        animation: 'fadeIn 0.2s ease-in-out'
      }}
    >
      <div className="text-gray-800 font-medium mb-1">{fieldHelp[field].text}</div>
      <div className="text-gray-500 text-sm">{fieldHelp[field].example}</div>
    </div>
  );
};

// Improved click logging function
const logClick = (element, details = {}) => {
  // Format the details object to be more readable
  const formattedDetails = Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  
  console.log(`[Click] ${element}${formattedDetails ? ` (${formattedDetails})` : ''}`);
};

// Add data change logging
const logDataChange = (type, data) => {
  // Only log essential data to keep console clean
  const essentialData = {
    title: data.title,
    sport: data.sport,
    date: data.date,
    results: data.results?.length || 0
  };
  console.log(`[Data Change] ${type}:`, essentialData);
};

function TestingForm({ testData, onTestDataChange, onSave, onGlucoseColumnChange, onDelete, demoMode = false, disableInnerScroll = false }) {
  const { addNotification } = useNotification();
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [highlightedField, setHighlightedField] = useState(null);
  const [activeHelp, setActiveHelp] = useState(null);
  const [helpPosition, setHelpPosition] = useState({ top: 0, left: 0 });
  const [isEditMode, setIsEditMode] = useState(false);
  const [inputMode, setInputMode] = useState('pace');
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' (km, pace/km) nebo 'imperial' (mile, mph)

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

  // Helper functions for conversions
  const convertSecondsToPace = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
      const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const convertPaceToSeconds = (paceString) => {
    if (!paceString || typeof paceString !== 'string') return 0;
    const [minutes, seconds] = paceString.split(':').map(Number);
    return (minutes * 60) + seconds;
  };

  const convertSecondsToSpeed = (seconds, unitSystem) => {
    if (!seconds) return 0;
    if (unitSystem === 'imperial') {
      // Convert pace (seconds per km) to speed (mph)
      // First convert seconds per km to km/h, then to mph
      const kmh = 3600 / seconds; // Convert seconds per km to km/h
      return kmh * 0.621371; // Convert km/h to mph
    } else {
      // Convert pace (seconds per km) to speed (km/h)
      return 3600 / seconds;
    }
  };

  const convertSpeedToSeconds = (speed, unitSystem) => {
    if (!speed) return 0;
    if (unitSystem === 'imperial') {
      // Convert speed (mph) to pace (seconds per km)
      // First convert mph to km/h, then to seconds per km
      const kmh = speed / 0.621371; // Convert mph to km/h
      return 3600 / kmh; // Convert km/h to seconds per km
    } else {
      // Convert speed (km/h) to pace (seconds per km)
      return 3600 / speed;
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

  useEffect(() => {
    if (testData) {
      if (testData.unitSystem) {
        setUnitSystem(testData.unitSystem);
      }
      if (testData.inputMode) {
        setInputMode(testData.inputMode);
      }
    }
  }, [testData]);

  // Convert display format when switching inputMode/unitSystem (only for backend data)
  useEffect(() => {
    if ((formData.sport === 'run' || formData.sport === 'swim')) {
      const updatedRows = rows.map(row => {
        if (!row.power || row.power === '') return row;
        
        // Convert based on current inputMode
        if (inputMode === 'pace') {
          // Convert to pace format
          const powerNum = parseFloat(row.power);
          if (!isNaN(powerNum) && powerNum > 100) {
            // This is seconds from backend, convert to pace
            return { ...row, power: convertSecondsToPace(powerNum) };
          } else if (typeof row.power === 'string' && row.power.includes(':')) {
            // Already in pace format, keep as is
            return row;
          } else if (!isNaN(powerNum) && powerNum < 100) {
            // This is speed, convert to pace
            const seconds = convertSpeedToSeconds(powerNum, unitSystem);
            return { ...row, power: convertSecondsToPace(seconds) };
          }
        } else if (inputMode === 'speed') {
          // Convert to speed format
          if (typeof row.power === 'string' && row.power.includes(':')) {
            // This is pace format, convert to speed
            const seconds = convertPaceToSeconds(row.power);
            const speed = convertSecondsToSpeed(seconds, unitSystem);
            return { ...row, power: speed.toFixed(1) };
          } else {
            const powerNum = parseFloat(row.power);
            if (!isNaN(powerNum) && powerNum > 100) {
              // This is seconds from backend, convert to speed
              const speed = convertSecondsToSpeed(powerNum, unitSystem);
              return { ...row, power: speed.toFixed(1) };
            }
          }
        }
        
        return row; // Keep user-typed values as is
      });
      
      if (JSON.stringify(updatedRows) !== JSON.stringify(rows)) {
        setRows(updatedRows);
      }
    }
    // eslint-disable-next-line
  }, [inputMode, unitSystem, formData.sport]);

  // Determine if we're in new test mode (all editable) or previous test mode (needs edit button)
  const isNewTest = !testData?._id;

  const [rows, setRows] = useState([]);

  const [showGlucose, setShowGlucose] = useState(true);
  const [hoverGlucose, setHoverGlucose] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const inputRefs = useRef({});

  // Handle tutorial navigation
  const handleNextTutorialStep = () => {
    setCurrentTutorialStep(prev => {
      if (prev < tutorialSteps.length - 1) {
        return prev + 1;
      }
      return -1; // End tutorial
    });
  };

  const handleSkipTutorial = () => {
    setCurrentTutorialStep(-1);
  };

  // Update tutorial position when step changes
  useEffect(() => {
    if (currentTutorialStep >= 0) {
      const currentStep = tutorialSteps[currentTutorialStep];
      const inputEl = inputRefs.current[currentStep.field];
      if (inputEl) {
        inputEl.focus();
      }
    }
  }, [currentTutorialStep]);

  // Initialize refs for new rows
  useEffect(() => {
    rows.forEach((_, index) => {
      ['power', 'heartRate', 'lactate', 'glucose', 'RPE'].forEach(field => {
        const key = `${field}_${index}`;
        if (!inputRefs.current[key]) {
          inputRefs.current[key] = null;
        }
      });
    });

    Object.keys(inputRefs.current).forEach(key => {
      if (key.includes('_') && parseInt(key.split('_')[1]) >= rows.length) {
        delete inputRefs.current[key];
      }
    });
  }, [rows]);

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
    console.log('Input change:', { rowIndex, field, value });
    
    // Always store the value as a string
    const updatedRows = rows.map((row, index) => {
      if (index === rowIndex) {
        return { ...row, [field]: String(value) };
      }
      return row;
    });
    
    console.log('Updated rows:', updatedRows);
    setRows(updatedRows);
      setIsDirty(true);
      
      const updatedTestData = {
        ...testData,
      results: updatedRows
      };
    
      onTestDataChange(updatedTestData);
  };

  // Update useEffect for testData changes to preserve raw values
  useEffect(() => {
    if (testData) {
      setFormData({
        title: testData.title || '',
        description: testData.description || '',
        weight: testData.weight?.toString() || '',
        sport: testData.sport || '',
        baseLa: testData.baseLactate?.toString() || '',
        date: formatDate(testData.date),
        specifics: testData.specifics || { specific: '', weather: '' },
        comments: testData.comments || ''
      });
      
      if (testData.results && testData.results.length > 0) {
        const initialRows = testData.results.map(row => {
          let powerValue = row.power ? String(row.power) : '';
          
          // Convert backend seconds to display format based on inputMode and unitSystem
          if ((testData.sport === 'run' || testData.sport === 'swim') && powerValue) {
            const currentInputMode = testData.inputMode || 'pace';
            const currentUnitSystem = testData.unitSystem || 'metric';
            const seconds = parseFloat(powerValue);
            
            if (!isNaN(seconds) && seconds > 0) {
              if (currentInputMode === 'pace') {
                // Convert seconds to MM:SS format
                powerValue = convertSecondsToPace(seconds);
              } else if (currentInputMode === 'speed') {
                // Convert seconds to speed format
                const speed = convertSecondsToSpeed(seconds, currentUnitSystem);
                powerValue = speed.toFixed(1);
              }
            }
          }
          
          return {
            interval: row.interval || 1,
            power: powerValue,
            heartRate: row.heartRate ? String(row.heartRate) : '',
            lactate: row.lactate ? String(row.lactate) : '',
            glucose: row.glucose ? String(row.glucose) : '',
            RPE: row.RPE ? String(row.RPE) : ''
          };
        });
        setRows(initialRows);
    } else {
        setRows([{
          interval: 1,
          power: '',
          heartRate: '',
          lactate: '',
          glucose: '',
          RPE: ''
        }]);
      }
    } else {
      setRows([{
        interval: 1,
        power: '',
        heartRate: '',
        lactate: '',
        glucose: '',
        RPE: ''
      }]);
    }
  }, [testData]);

// NO AUTOMATIC CONVERSIONS - let user type anything

  const handleSaveChanges = () => {
    if (!validateForm()) {
      return;
    }
    const finalInputMode = inputMode; // místo nedefinovaných propInputMode/localInputMode
    const updatedTest = {
      ...testData,
      title: formData.title.trim(),
      description: formData.description?.trim() || '',
      weight: formData.weight === '' ? 0 : parseFloat(formData.weight.replace(',', '.')),
      sport: formData.sport,
      baseLactate: formData.baseLa === '' ? 0 : parseFloat(formData.baseLa.replace(',', '.')),
      date: formData.date,
      specifics: formData.specifics || { specific: '', weather: '' },
      comments: formData.comments?.trim() || '',
      unitSystem: unitSystem, // <--- přidáno
      inputMode: inputMode, // <--- přidáno
      results: rows.map((row, index) => {
        let powerValue = row.power;
        if ((formData.sport === 'run' || formData.sport === 'swim')) {
          if (finalInputMode === 'pace' && typeof powerValue === 'string' && powerValue.includes(':')) {
            // Convert pace (MM:SS) to seconds for backend
            powerValue = convertPaceToSeconds(powerValue);
          } else if (finalInputMode === 'speed' && !isNaN(Number(powerValue)) && !powerValue.includes(':')) {
            // Convert speed to seconds for backend
            const speed = parseFloat(powerValue.toString().replace(',', '.'));
            powerValue = convertSpeedToSeconds(speed, unitSystem);
          }
        }
        const convertToNumber = (value) => {
          if (value === '' || value === undefined || value === null) return 0;
          if (typeof value !== 'string') {
            const n = Number(value);
            return isNaN(n) ? 0 : n;
          }
          return parseFloat(value.replace(',', '.'));
        };
        return {
          interval: index + 1,
          power: convertToNumber(powerValue),
          heartRate: convertToNumber(row.heartRate),
          lactate: convertToNumber(row.lactate),
          glucose: convertToNumber(row.glucose),
          RPE: convertToNumber(row.RPE)
        };
      })
    };
    if (onSave) {
      try {
        onSave(updatedTest);
        addNotification('Test data saved successfully', 'success');
        trackEvent('test_saved', {
          sport: formData.sport,
          intervals: rows.length,
          isNewTest: isNewTest
        });
        setIsDirty(false);
        if (!isNewTest) {
          setIsEditMode(false);
        }
      } catch (error) {
        console.error('Error saving test data:', error);
        addNotification('Failed to save test data', 'error');
      }
    }
  };

  const validateForm = () => {
    const errors = [];
    
    if (!formData.title?.trim()) {
      errors.push('Test title is required');
      setHighlightedField('title');
    }
    
    if (!formData.sport) {
      errors.push('Sport is required');
      setHighlightedField('sport');
    }
    
    if (errors.length > 0) {
      errors.forEach(error => addNotification(error, 'error'));
      return false;
    }
    
    return true;
  };

  const handleFormDataChange = (field, value) => {
    logClick('Form Field Change', { field, value });
    
    if (field === 'sport') {
      const newFormData = {
        ...formData,
        sport: value
      };
      setFormData(newFormData);
      
      // Update rows with converted power values
      const updatedRows = rows.map(row => {
        let power = row.power;
        if (value === 'bike' && power) {
          power = convertPaceToSeconds(power);
        } else if ((value === 'run' || value === 'swim') && power) {
          power = convertSecondsToPace(power);
        }
        return { ...row, power };
      });
      setRows(updatedRows);
      
      const updatedTestData = {
        ...testData,
        title: newFormData.title,
        description: newFormData.description,
        weight: newFormData.weight,
        sport: value,
        baseLactate: newFormData.baseLa,
        date: newFormData.date,
        specifics: newFormData.specifics,
        comments: newFormData.comments,
        results: updatedRows
      };
      
      logDataChange('Sport Change', updatedTestData);
      onTestDataChange(updatedTestData);
      return;
    }

    // For other field changes
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    setIsDirty(true);

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
    
    logDataChange('Field Update', updatedTestData);
    onTestDataChange(updatedTestData);
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
      power: '',
      heartRate: '',
      lactate: '',
      glucose: '',
      RPE: ''
    };
    
    setRows([...rows, newRow]);
    setIsDirty(true);
  };

  const handleDeleteTest = () => {
    if (window.confirm('Are you sure you want to delete this test? This action cannot be undone.')) {
      if (onDelete) {
        onDelete(testData);
        addNotification('Test deleted successfully', 'success');
      }
    }
  };

  // Calculate grid columns based on whether glucose is shown
  const gridCols = showGlucose ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-4 sm:grid-cols-6';

  // Highlight fields with errors
  const validateField = (field, value) => {
    if (field === 'title' && !value) {
      setHighlightedField('title');
      return false;
    }
    if (field === 'sport' && !value) {
      setHighlightedField('sport');
      return false;
    }
    return true;
  };

  // Handle input focus
  const handleInputFocus = (field, event) => {
    const rect = event.target.getBoundingClientRect();
    setHelpPosition({
      top: `${rect.top - 80}px`,
      left: `${rect.left}px`
    });
    setActiveHelp(field);
  };

  // Handle input blur
  const handleInputBlur = () => {
    // Add small delay to make the help message more readable
    setTimeout(() => {
      setActiveHelp(null);
    }, 200);
  };

  // Helper to get the correct ref for the current tutorial step
  const getTutorialInputRef = () => {
    if (currentTutorialStep < 0) return null;
    const step = tutorialSteps[currentTutorialStep];
    // For table fields like power_0, heartRate_0, etc.
    if (step.field.includes('_')) {
      return inputRefs.current[step.field] ? { current: inputRefs.current[step.field] } : null;
    }
    // For form fields
    return inputRefs.current[step.field] ? { current: inputRefs.current[step.field] } : null;
  };


  // Validate and format power input on blur
  const handlePowerBlur = (index, value) => {
    if ((formData.sport !== 'run' && formData.sport !== 'swim')) return;
    
    let formattedValue = value;
    let isValid = true;
    let errorMessage = '';
    
    if (inputMode === 'pace') {
      // Validate pace format (MM:SS)
      if (value && value.trim() !== '') {
        if (value.includes(':')) {
          const [minutes, seconds] = value.split(':').map(Number);
          if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
            isValid = false;
            errorMessage = 'Invalid pace format. Use MM:SS (e.g., 5:30)';
          } else {
            formattedValue = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
        } else {
          // Try to convert number to MM:SS
          const totalSeconds = parseFloat(value);
          if (!isNaN(totalSeconds) && totalSeconds > 0) {
            const minutes = Math.floor(totalSeconds / 60);
            const secs = Math.round(totalSeconds % 60);
            formattedValue = `${minutes}:${secs.toString().padStart(2, '0')}`;
          } else {
            isValid = false;
            errorMessage = 'Invalid pace format. Use MM:SS (e.g., 5:30)';
          }
        }
      }
    } else if (inputMode === 'speed') {
      // Validate speed format (number)
      if (value && value.trim() !== '') {
        const speed = parseFloat(value);
        if (isNaN(speed) || speed <= 0) {
          isValid = false;
          errorMessage = 'Invalid speed. Enter a positive number (e.g., 14)';
        } else {
          formattedValue = speed.toFixed(1);
        }
      }
    }
    
    if (isValid) {
      // Update the row with formatted value
      const updatedRows = rows.map((row, i) => 
        i === index ? { ...row, power: formattedValue } : row
      );
      setRows(updatedRows);
    } else {
      // Show error message (you can implement a toast or inline error)
      console.error(errorMessage);
      // For now, just log the error - you can add visual feedback later
    }
  };

  // Update the input field in the table
  const renderInput = (index, field, value, placeholder) => {
    const isTutorialField = currentTutorialStep >= 0 && tutorialSteps[currentTutorialStep].field === `${field}_${index}`;
    let displayValue = value;
    
    // NO AUTOMATIC CONVERSIONS - let user type anything
    // Only show the raw value as stored in state
  return (
      <div className="min-w-0 overflow-hidden relative">
      <input 
          ref={el => inputRefs.current[`${field}_${index}`] = el}
        type="text"
          value={displayValue === undefined || displayValue === null ? '' : String(displayValue)}
          onChange={(e) => {
            handleValueChange(index, field, e.target.value);
          }}
          onBlur={(e) => {
            if (field === 'power' && (formData.sport === 'run' || formData.sport === 'swim')) {
              handlePowerBlur(index, e.target.value);
            }
          }}
          disabled={!isNewTest && !isEditMode}
          className={`w-full min-w-0 p-0.5 text-xs border rounded-lg text-center focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
            (!isNewTest && !isEditMode) ? 'bg-gray-50' : ''
          } ${isTutorialField ? 'ring-2 ring-primary border-primary' : ''}`}
          placeholder={placeholder}
        />
      </div>
    );
  };

  // Update the form fields to include tutorial tooltips
  const renderFormField = (field, label, type = 'text', placeholder = '') => {
    const isTutorialField = currentTutorialStep >= 0 && tutorialSteps[currentTutorialStep].field === field;
    
    return (
      <div className="relative">
        <label className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
        {isTutorialField && (
          <TutorialMessagePortal
            step={tutorialSteps[currentTutorialStep]}
            onNext={handleNextTutorialStep}
            onSkip={handleSkipTutorial}
            inputRef={getTutorialInputRef()}
          />
        )}
        <input 
          ref={el => inputRefs.current[field] = el}
          type={type}
          value={formData[field]}
          onChange={(e) => handleFormDataChange(field, e.target.value)}
          className={`w-full p-1 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
            isTutorialField ? 'ring-2 ring-primary border-primary' : ''
          }`}
          disabled={!isNewTest && !isEditMode}
          placeholder={placeholder}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col max-w-lg mx-auto p-1 sm:px-1 sm:py-4 bg-gray-50 rounded-lg relative">
      {/* keyframes moved to global CSS (index.css) */}

      {/* Single Tutorial Message Portal */}
      {demoMode && currentTutorialStep >= 0 && (
        <TutorialMessagePortal
          step={tutorialSteps[currentTutorialStep]}
          onNext={handleNextTutorialStep}
          onSkip={handleSkipTutorial}
          inputRef={getTutorialInputRef()}
        />
      )}

      {/* Help Button */}
      {demoMode && (
        <button
          onClick={() => setCurrentTutorialStep(0)}
          className="absolute top-[1.3rem] right-4 text-primary hover:text-primary-dark transition-colors"
        >
          <HelpCircle size={24} />
              </button>
            )}

      <div className="space-y-2">
        {/* Title and Edit Button Row */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex-1">
            <input 
              ref={el => inputRefs.current['title'] = el}
              type="text"
              value={formData.title}
              onChange={(e) => {
                logClick('Title Input Change', { value: e.target.value });
                handleFormDataChange('title', e.target.value);
                setHighlightedField(null);
              }}
              disabled={!isNewTest && !isEditMode}
              className={`test-title-input w-full p-1.5 border rounded-lg text-sm ${
                highlightedField === 'title' ? 'border-red-500 ring-2 ring-red-200' : ''
              } ${(!isNewTest && !isEditMode) ? 'bg-gray-50' : ''}`}
              placeholder="Test Title *"
              required
            />
          </div>
          
          {/* Edit Mode Toggle - Only show for existing tests */}
          {!isNewTest && (
            <button
              onClick={() => {
                logClick('Edit/Cancel Button', { isEditMode });
                setIsEditMode(!isEditMode);
              }}
              className={`px-2 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap text-sm ${
                isEditMode 
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : 'bg-primary hover:bg-primary-dark text-white'
              }`}
            >
              {isEditMode ? (
                <>
                  <X size={14} />
                  Cancel
                </>
              ) : (
                <>
                  <Edit size={14} />
                  Edit
                </>
              )}
            </button>
          )}
      </div>

      <textarea 
        value={formData.description} 
        onChange={(e) => handleFormDataChange('description', e.target.value)} 
          className="w-full p-1.5 border rounded-lg text-sm"
          disabled={!isNewTest && !isEditMode}
        placeholder="Description of this testing..." 
          rows={2}
      />

        <div className="grid grid-cols-4 gap-2">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Date</label>
        <input 
              ref={el => inputRefs.current['date'] = el}
          type="date" 
          value={formData.date}
          onChange={(e) => handleFormDataChange('date', e.target.value)} 
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 0 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
        />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Weight</label>
        <input 
              ref={el => inputRefs.current['weight'] = el}
          type="text" 
          value={formData.weight} 
              onChange={(e) => handleFormDataChange('weight', e.target.value)}
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 2 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
              placeholder="kg"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Base La</label>
            <input 
              ref={el => inputRefs.current['baseLa'] = el}
              type="text"
              value={formData.baseLa}
              onChange={(e) => handleFormDataChange('baseLa', e.target.value)}
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 3 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
              placeholder="mmol/L"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Sport</label>
        <select 
              ref={el => inputRefs.current['sport'] = el}
          value={formData.sport} 
              onChange={(e) => {
                logClick('Sport Select Change', { value: e.target.value });
                handleFormDataChange('sport', e.target.value);
              }}
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 1 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
            >
              <option value="">Sport *</option>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
        </select>
          </div>
        </div>

        {/* Unit System Controls */}
        {(formData.sport === 'run' || formData.sport === 'swim') && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Input Mode</label>
              <div className="bg-gray-100 rounded-lg p-1 inline-flex shadow-sm">
                <button
                  onClick={() => setInputMode('pace')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${inputMode === 'pace' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  Pace
                </button>
                <button
                  onClick={() => setInputMode('speed')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${inputMode === 'speed' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  Speed
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Unit System</label>
              <div className="bg-gray-100 rounded-lg p-1 inline-flex shadow-sm">
                <button
                  onClick={() => setUnitSystem('metric')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${unitSystem === 'metric' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  {inputMode === 'pace' ? 'pace/km' : 'km/h'}
                </button>
                <button
                  onClick={() => setUnitSystem('imperial')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${unitSystem === 'imperial' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  {inputMode === 'pace' ? 'pace/mile' : 'mph'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Conditions</label>
        <input 
              ref={el => inputRefs.current['specifics'] = el}
              type="text"
              value={formData.specifics.specific}
              onChange={(e) => handleFormDataChange('specifics', { 
                ...formData.specifics, 
                specific: e.target.value 
              })}
              onFocus={(e) => handleInputFocus('specifics', e)}
              onBlur={handleInputBlur}
              className="w-full p-1 border rounded-lg text-sm"
              disabled={!isNewTest && !isEditMode}
              placeholder="e.g., Indoor"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Weather</label>
        <input 
              ref={el => inputRefs.current['specifics'] = el}
              type="text"
              value={formData.specifics.weather}
              onChange={(e) => handleFormDataChange('specifics', { 
                ...formData.specifics, 
                weather: e.target.value 
              })}
              onFocus={(e) => handleInputFocus('specifics', e)}
              onBlur={handleInputBlur}
              className="w-full p-1 border rounded-lg text-sm"
              disabled={!isNewTest && !isEditMode}
              placeholder="e.g., 20°C"
        />
      </div>
      </div>

        {/* Data Table */}
        <div className="mt-3 overflow-x-auto">
          {(() => {
            const gridCols = (isNewTest || isEditMode) 
              ? (showGlucose 
                  ? 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]'
                  : 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]')
              : (showGlucose
                  ? 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
                  : 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]');
            
            return (
              <>
                <div className={`grid ${gridCols} gap-0.5 items-center p-1 text-xs font-semibold bg-gray-100 rounded-lg w-full min-w-0`}>
                  <div className="text-center min-w-0 overflow-hidden">Int.</div>
                  <div className="text-center min-w-0 overflow-hidden">
  {formData.sport === 'bike' ? 'Power' :
    (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'pace' ? 'Pace' :
    (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'speed' ? 'Speed' : 'Power'}
</div>
                  <div className="text-center min-w-0 overflow-hidden">HR</div>
                  <div className="text-center min-w-0 overflow-hidden">La</div>
                  {showGlucose && <div className="text-center min-w-0 overflow-hidden">Glu</div>}
                  <div className="text-center min-w-0 overflow-hidden">RPE</div>
                  {(isNewTest || isEditMode) && <div className="text-center min-w-0 overflow-hidden">Del</div>}
                </div>
                <div className={`${disableInnerScroll ? '' : 'max-h-[400px] overflow-y-auto'}`}>
                  {rows.map((row, index) => (
                    <div
                      key={index}
                      className={`grid ${gridCols} gap-0.5 items-center mt-0.5 p-1 bg-white rounded-lg w-full min-w-0 hover:bg-gray-50 transition-colors`}
                    >
                      <div className="text-center text-xs min-w-0 overflow-hidden">{index + 1}</div>
                      {renderInput(index, 'power', row.power,
                        formData.sport === 'bike' ? 'W' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'pace' ? 'MM:SS' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'speed' ? (unitSystem === 'imperial' ? 'mph' : 'km/h') : 'MM:SS'
                      )}
                      {renderInput(index, 'heartRate', row.heartRate, 'bpm')}
                      {renderInput(index, 'lactate', row.lactate, 'mmol/L')}
                      {showGlucose && renderInput(index, 'glucose', row.glucose, 'mmol/L')}
                      {renderInput(index, 'RPE', row.RPE, '1-10')}
                      {(isNewTest || isEditMode) && (
                        <div className="flex justify-center min-w-0 overflow-hidden">
        <button 
                            onClick={() => {
                              logClick('Delete Row Button', { rowIndex: index });
                              handleDeleteRow(index);
                            }}
                            className="p-0.5 text-red-600 hover:text-red-800 transition-colors"
                          >
                            <Trash size={14} />
        </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {/* Action Buttons */}
        {(isNewTest || isEditMode) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-2">
            <button 
              onClick={() => {
                logClick('Add Interval Button');
                handleAddRow();
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus size={14} /> Add Interval
            </button>

          <div className="flex gap-2 w-full sm:w-auto">
              {!isNewTest && (
            <button 
                  onClick={() => {
                    logClick('Delete Test Button', { testId: testData._id });
                    handleDeleteTest();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Trash size={14} /> Delete Test
            </button>
              )}

            <button 
                onClick={() => {
                  logClick('Save Button', { isNewTest });
                  handleSaveChanges();
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
            >
                <Save size={14} /> {isNewTest ? 'Save Test' : 'Save Changes'}
            </button>
            </div>
          </div>
        )}
      </div>

      {/* Field Validation Messages */}
      {highlightedField && (
        <div className="mt-2 text-red-500 text-sm">
          Please fill in the {highlightedField} field
        </div>
      )}
    </div>
  );
}

export default TestingForm;
