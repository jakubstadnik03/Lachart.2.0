import React, { useState } from 'react';
import TestingForm from './TestingForm';
import LactateCurve from './LactateCurve';

const NewTestingComponent = ({ selectedSport, onSubmit }) => {
    const [testData, setTestData] = useState({
      title: '',
      description: '',
      weight: '',
      sport: selectedSport === 'all' ? '' : selectedSport,
      baseLactate: '',
      date: new Date().toISOString().split('T')[0],
      specifics: {
        specific: '',
        weather: ''
      },
      comments: '',
      results: []
    });

    // Add unit system and input mode state
    const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'
    const [inputMode, setInputMode] = useState('pace'); // 'pace' or 'speed'

    // Conversion functions
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

    const convertPaceToImperial = (secondsPerKm) => {
      return secondsPerKm * 1.60934;
    };

    const convertSpeedToPace = (speedKmh) => {
      if (speedKmh <= 0) return 0;
      return Math.round(3600 / speedKmh);
    };

    const convertPaceToSpeed = (secondsPerKm) => {
      if (secondsPerKm <= 0) return 0;
      return 3600 / secondsPerKm;
    };

    // Handle unit system change - convert existing values
    const handleUnitSystemChange = (newUnitSystem) => {
      // Only convert if unit system actually changes
      if (newUnitSystem === unitSystem) return;
      
      if (testData.sport === 'run' || testData.sport === 'swim') {
        const updatedResults = testData.results.map(result => {
          if (!result.power || result.power === '') return result;
          
          let newPower = result.power;
          
          if (inputMode === 'speed') {
            // Speed input - convert between km/h and mph
            const speed = parseFloat(result.power.toString().replace(',', '.'));
            if (!isNaN(speed) && speed > 0) {
              if (newUnitSystem === 'imperial' && unitSystem === 'metric') {
                // Convert km/h to mph
                newPower = (speed * 0.621371).toFixed(1);
              } else if (newUnitSystem === 'metric' && unitSystem === 'imperial') {
                // Convert mph to km/h
                newPower = (speed / 0.621371).toFixed(1);
              }
            }
          } else {
            // Pace input - convert between pace/km and pace/mile
            if (typeof result.power === 'string' && result.power.includes(':')) {
              const paceInSeconds = convertPaceToSeconds(result.power);
              if (paceInSeconds > 0) {
                if (newUnitSystem === 'imperial' && unitSystem === 'metric') {
                  // Convert pace/km to pace/mile
                  const paceInMiles = convertPaceToImperial(paceInSeconds);
                  newPower = convertSecondsToPace(paceInMiles);
                } else if (newUnitSystem === 'metric' && unitSystem === 'imperial') {
                  // Convert pace/mile to pace/km
                  const paceInKm = paceInSeconds / 1.60934;
                  newPower = convertSecondsToPace(paceInKm);
                }
              }
            }
          }
          
          return { ...result, power: newPower };
        });
        
        const updatedTestData = {
          ...testData,
          results: updatedResults
        };
        
        setTestData(updatedTestData);
        handleTestDataChange(updatedTestData);
      }
      
      // Set unit system after processing
      setUnitSystem(newUnitSystem);
    };
  
    const handleTestDataChange = (updatedData) => {
      // Keep values as strings until save
      const processedData = {
        ...updatedData,
        title: updatedData.title?.trim(),
        sport: updatedData.sport || selectedSport,
        date: updatedData.date || new Date().toISOString().split('T')[0],
        weight: updatedData.weight || '',
        baseLactate: updatedData.baseLactate || '',
        results: updatedData.results.map(result => {
          let power = result.power;
          
          // Convert from backend seconds to display format based on input mode
          if (updatedData.sport === 'run' || updatedData.sport === 'swim') {
            if (inputMode === 'pace') {
              // Convert seconds to MM:SS format for display
              if (power && power > 0) {
                // Convert from imperial if needed
                let displaySeconds = power;
                if (unitSystem === 'imperial') {
                  displaySeconds = power / 1.60934; // Convert from seconds/mile to seconds/km
                }
                power = convertSecondsToPace(displaySeconds);
              }
            } else {
              // Convert seconds to speed format for display
              if (power && power > 0) {
                // Convert from imperial if needed
                let displaySeconds = power;
                if (unitSystem === 'imperial') {
                  displaySeconds = power / 1.60934; // Convert from seconds/mile to seconds/km
                }
                const speed = convertPaceToSpeed(displaySeconds);
                power = speed.toFixed(1);
              }
            }
          }
          
          return {
            power: power || '',
            heartRate: result.heartRate || '',
            lactate: result.lactate || '',
            glucose: result.glucose || '',
            RPE: result.RPE || ''
          };
        })
      };
      
      setTestData(processedData);
    };

    const handleSaveTest = () => {
      console.log('Current testData:', testData);

      // Validate required fields
      const missingFields = [];
      if (!testData.title?.trim()) missingFields.push('Title');
      if (!testData.sport) missingFields.push('Sport');
      if (!testData.date) missingFields.push('Date');

      if (missingFields.length > 0) {
        alert(`Please fill in all required fields: ${missingFields.join(', ')}`);
        return;
      }

      // Validate that there are some results
      if (!testData.results || testData.results.length === 0) {
        alert('Please add at least one test result');
        return;
      }

      // Convert values to numbers only at save time
      const processedData = {
        ...testData,
        title: testData.title,
        sport: testData.sport,
        date: testData.date,
        description: testData.description?.trim() || '',
        baseLactate: testData.baseLactate === '' ? 0 : parseFloat(testData.baseLactate.toString().replace(',', '.')),
        weight: testData.weight === '' ? 0 : parseFloat(testData.weight.toString().replace(',', '.')),
        specifics: {
          specific: testData.specifics?.specific || '',
          weather: testData.specifics?.weather || ''
        },
        comments: testData.comments?.trim() || '',
        // Add unit system and input mode to backend
        unitSystem: unitSystem,
        inputMode: inputMode,
        results: testData.results.map((result, index) => {
          let power = result.power;
          
          // Always convert to seconds for backend storage
          if (testData.sport === 'run' || testData.sport === 'swim') {
            if (inputMode === 'pace') {
              // Pace input - convert MM:SS to seconds per km/mile
              if (typeof power === 'string' && power.includes(':')) {
                const paceInSeconds = convertPaceToSeconds(power);
                if (paceInSeconds > 0) {
                  // Convert to imperial if needed
                  power = unitSystem === 'imperial' ? convertPaceToImperial(paceInSeconds) : paceInSeconds;
                }
              }
            } else {
              // Speed input - convert km/h or mph to seconds per km/mile
              const speed = parseFloat(power.toString().replace(',', '.'));
              if (!isNaN(speed) && speed > 0) {
                let paceInSeconds = convertSpeedToPace(speed);
                // Convert to imperial if needed
                if (unitSystem === 'imperial') {
                  paceInSeconds = convertPaceToImperial(paceInSeconds);
                }
                power = paceInSeconds;
              }
            }
          }
          
          return {
            interval: index + 1,
            power: power === '' ? 0 : parseFloat(power.toString().replace(',', '.')),
            heartRate: result.heartRate === '' ? 0 : parseFloat(result.heartRate.toString().replace(',', '.')),
            lactate: result.lactate === '' ? 0 : parseFloat(result.lactate.toString().replace(',', '.')),
            glucose: result.glucose === '' ? 0 : parseFloat(result.glucose.toString().replace(',', '.')),
            RPE: result.RPE === '' ? 0 : parseFloat(result.RPE.toString().replace(',', '.'))
          };
        })
      };

      console.log('Processed data being submitted:', processedData);
      onSubmit(processedData);
    };
  
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 mt-4 lg:mt-5">
        <div className="w-full lg:w-1/2">
          <LactateCurve 
            mockData={testData} 
            unitSystem={unitSystem}
            inputMode={inputMode}
          />
        </div>
        <div className="w-full lg:w-1/2">
          <div className="bg-white rounded-2xl shadow-lg p-4 lg:p-6">
            <TestingForm 
              testData={testData} 
              onTestDataChange={handleTestDataChange}
              onSave={handleSaveTest}
              unitSystem={unitSystem}
              inputMode={inputMode}
              onUnitSystemChange={handleUnitSystemChange}
              onInputModeChange={setInputMode}
            />
          </div>
        </div>
      </div>
    );
  };
  
export default NewTestingComponent;
