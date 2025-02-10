import React, { useState } from 'react';
import TestingForm from './TestingForm';
import LactateCurve from './LactateCurve';

const NewTestingComponent = () => {
    const [testData, setTestData] = useState({
      description: '',
      weight: '',
      sport: '',
      baseLactate: '',
      results: [{ power: null, heartRate: null, lactate: null, glucose: null, RPE: null }]
    });
  
    return (
      <div className="flex flex-wrap lg:flex-nowrap gap-6 mt-5 ml-5 mr-5">
        <LactateCurve mockData={testData} />
        <div className="flex-1 max-w-xl bg-white rounded-2xl shadow-lg p-6">
          <TestingForm testData={testData} onTestDataChange={setTestData} />
        </div>
      </div>
    );
  };
  

export default NewTestingComponent;
