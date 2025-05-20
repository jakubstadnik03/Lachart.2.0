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
  
    const handleTestDataChange = (updatedData) => {
      // Keep values as strings until save
      const processedData = {
        ...updatedData,
        title: updatedData.title?.trim(),
        sport: updatedData.sport || selectedSport,
        date: updatedData.date || new Date().toISOString().split('T')[0],
        weight: updatedData.weight || '',
        baseLactate: updatedData.baseLactate || '',
        results: updatedData.results.map(result => ({
          power: result.power || '',
          heartRate: result.heartRate || '',
          lactate: result.lactate || '',
          glucose: result.glucose || '',
          RPE: result.RPE || ''
        }))
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
        results: testData.results.map((result, index) => ({
          interval: index + 1,
          power: result.power === '' ? 0 : parseFloat(result.power.toString().replace(',', '.')),
          heartRate: result.heartRate === '' ? 0 : parseFloat(result.heartRate.toString().replace(',', '.')),
          lactate: result.lactate === '' ? 0 : parseFloat(result.lactate.toString().replace(',', '.')),
          glucose: result.glucose === '' ? 0 : parseFloat(result.glucose.toString().replace(',', '.')),
          RPE: result.RPE === '' ? 0 : parseFloat(result.RPE.toString().replace(',', '.'))
        }))
      };

      console.log('Processed data being submitted:', processedData);
      onSubmit(processedData);
    };
  
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 mt-4 lg:mt-5">
        <div className="w-full lg:w-1/2">
          <LactateCurve mockData={testData} />
        </div>
        <div className="w-full lg:w-1/2">
          <div className="bg-white rounded-2xl shadow-lg p-4 lg:p-6">
            <TestingForm 
              testData={testData} 
              onTestDataChange={handleTestDataChange}
              onSave={handleSaveTest}
            />
          </div>
        </div>
      </div>
    );
  };
  
export default NewTestingComponent;
