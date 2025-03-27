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
      // Ensure all numeric values are properly converted
      const processedData = {
        ...updatedData,
        title: updatedData.title?.trim(),
        sport: updatedData.sport || selectedSport,
        date: updatedData.date || new Date().toISOString().split('T')[0],
        weight: updatedData.weight ? Number(updatedData.weight) : '',
        baseLactate: updatedData.baseLactate ? Number(updatedData.baseLactate) : '',
        results: updatedData.results.map(result => ({
          power: result.power ? Number(result.power) : 0,
          heartRate: result.heartRate ? Number(result.heartRate) : 0,
          lactate: result.lactate ? Number(result.lactate) : 0,
          glucose: result.glucose ? Number(result.glucose) : 0,
          RPE: result.RPE ? Number(result.RPE) : 0
        }))
      };
      
      setTestData(processedData);
    };

    const handleSaveTest = () => {
      console.log('Current testData:', testData); // Debug log

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

      // Call the onSubmit prop with the processed data
      const processedData = {
        ...testData,
        title: testData.title,
        sport: testData.sport,
        date: testData.date,
        description: testData.description?.trim() || '',
        baseLactate: Number(testData.baseLactate) || 0,
        weight: Number(testData.weight) || 0,
        specifics: {
          specific: testData.specifics?.specific || '',
          weather: testData.specifics?.weather || ''
        },
        comments: testData.comments?.trim() || '',
        results: testData.results.map((result, index) => ({
          interval: index + 1,
          power: Number(result.power) || 0,
          heartRate: Number(result.heartRate) || 0,
          lactate: Number(result.lactate) || 0,
          glucose: Number(result.glucose) || 0,
          RPE: Number(result.RPE) || 0
        }))
      };

      console.log('Processed data being submitted:', processedData); // Debug log
      onSubmit(processedData);
    };
  
    return (
      <div className="flex justify-center flex-wrap lg:flex-nowrap gap-6 mt-5">
        <LactateCurve mockData={testData} />
        <div className="flex-1 max-w-xl bg-white rounded-2xl shadow-lg p-6">
          <TestingForm 
            testData={testData} 
            onTestDataChange={handleTestDataChange}
            onSave={handleSaveTest}
          />
        </div>
      </div>
    );
  };
  
export default NewTestingComponent;
