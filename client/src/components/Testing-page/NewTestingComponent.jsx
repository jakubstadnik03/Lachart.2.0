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
      // Simply update the state without processing
      setTestData(updatedData);
    };

    const handleSaveFromForm = (formData) => {
      // This will be called from TestingForm when user clicks save
      console.log('Saving from form:', formData);
      onSubmit(formData);
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
              onSave={handleSaveFromForm}
            />
          </div>
        </div>
      </div>
    );
  };
  
export default NewTestingComponent;
