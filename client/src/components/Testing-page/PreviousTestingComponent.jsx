import React, { useState, useEffect } from "react";
import LactateCurve from "./LactateCurve";
import TestingForm from "./TestingForm";
import DateSelector from "../DateSelector";
import LactateCurveCalculator from "./LactateCurveCalculator";
import TestComparison from "./TestComparison";
import TestSelector from "./TestSelector";
import api from '../../services/api';

const PreviousTestingComponent = ({ selectedSport, tests = [], setTests }) => {
  const [selectedTests, setSelectedTests] = useState([]);
  const [currentTest, setCurrentTest] = useState(null);
  const [glucoseColumnHidden, setGlucoseColumnHidden] = useState(false);

  // Reset stavu při změně tests
  useEffect(() => {
    setSelectedTests([]);
    setCurrentTest(null);
  }, [tests]);

  useEffect(() => {
    if (!tests || tests.length === 0) return;

    const filteredTests = selectedSport === 'all' 
      ? tests 
      : tests.filter(test => test.sport === selectedSport);

    if (filteredTests.length > 0) {
      // If we have a current test, try to find it in the filtered tests
      if (currentTest) {
        const updatedCurrentTest = filteredTests.find(test => test._id === currentTest._id);
        if (updatedCurrentTest) {
          setCurrentTest(updatedCurrentTest);
        } else {
          // If current test is not in filtered tests, select the most recent one
          const mostRecentTest = filteredTests.reduce((latest, current) => {
            return new Date(current.date) > new Date(latest.date) ? current : latest;
          });
          setCurrentTest(mostRecentTest);
        }
      } else {
        // If no current test, select the most recent one
        const mostRecentTest = filteredTests.reduce((latest, current) => {
          return new Date(current.date) > new Date(latest.date) ? current : latest;
        });
        setCurrentTest(mostRecentTest);
      }
    } else {
      setCurrentTest(null);
    }
  }, [selectedSport, tests, currentTest]);

  const handleDateSelect = (date) => {
    const selectedTest = tests.find(test => test.date === date);
    if (selectedTest) {
      setCurrentTest(selectedTest);
      setSelectedTests([]); // Reset selected tests when changing date
    }
  };

  const handleTestSelect = (test) => {
    const canAddTest = selectedTests.length === 0 || selectedTests[0].sport === test.sport;
    
    setSelectedTests(prev => {
      const isSelected = prev.find(t => t._id === test._id);
      if (isSelected) {
        return prev.filter(t => t._id !== test._id);
      } else if (canAddTest) {
        return [...prev, test];
      } else {
        alert('You can only compare tests of the same sport type');
        return prev;
      }
    });
  };

  const handleTestUpdate = async (updatedTest) => {
    try {
      const response = await api.put(`/test/${updatedTest._id}`, updatedTest);
      setTests(prev => prev.map(t => 
        t._id === updatedTest._id ? response.data : t
      ));
      setCurrentTest(response.data);
      // Update selected tests if they include the updated test
      setSelectedTests(prev => prev.map(t => 
        t._id === updatedTest._id ? response.data : t
      ));
    } catch (err) {
      console.error('Error updating test:', err);
    }
  };

  const handleTestDelete = async (testToDelete) => {
    try {
      await api.delete(`/test/${testToDelete._id}`);
      setTests(prev => prev.filter(t => t._id !== testToDelete._id));
      setCurrentTest(null);
      setSelectedTests(prev => prev.filter(t => t._id !== testToDelete._id));
    } catch (err) {
      console.error('Error deleting test:', err);
    }
  };

  const handleGlucoseColumnChange = (hidden) => {
    setGlucoseColumnHidden(hidden);
  };

  return (
    <div className="space-y-6">
      {tests && tests.length > 0 ? (
        <DateSelector
          dates={tests.map(test => test.date)}
          onSelectDate={handleDateSelect}
        />
      ) : (
        <div className="text-center py-4 text-gray-500">
          No tests available
        </div>
      )}

      {currentTest && currentTest.results && (
        <div className="flex justify-center flex-wrap lg:flex-nowrap gap-6 mt-5">
          <div className={`${glucoseColumnHidden ? 'flex-[2]' : 'flex-[2.5]'}`}>
            <LactateCurve mockData={currentTest} />
          </div>
          <div className={`${glucoseColumnHidden ? 'flex-1 max-w-l mx-0' : 'flex-1 max-w-l'} bg-white rounded-2xl shadow-lg md:p-6 sm:p-2`}>
            <TestingForm 
              testData={currentTest} 
              onTestDataChange={handleTestUpdate}
              onGlucoseColumnChange={handleGlucoseColumnChange}
              onDelete={handleTestDelete}
            />
          </div>
        </div>
      )}

      {currentTest && currentTest.results && (
        <LactateCurveCalculator mockData={currentTest} />
      )}

      <TestSelector 
        tests={tests}
        selectedTests={selectedTests}
        onTestSelect={setSelectedTests}
        selectedSport={selectedSport}
      />

      <TestComparison tests={selectedTests} />
    </div>
  );
};

export default PreviousTestingComponent;
