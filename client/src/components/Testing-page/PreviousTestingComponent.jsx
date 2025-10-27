import React, { useState, useEffect } from "react";
import LactateCurve from "./LactateCurve";
import TestingForm from "./TestingForm";
import DateSelector from "../DateSelector";
import LactateCurveCalculator from "./LactateCurveCalculator";
import TrainingZonesGenerator from "./TrainingZonesGenerator";
import TestComparison from "./TestComparison";
import TestSelector from "./TestSelector";
import api from '../../services/api';
import { motion, AnimatePresence } from "framer-motion";

const PreviousTestingComponent = ({ selectedSport, tests = [], setTests }) => {
  const [selectedTests, setSelectedTests] = useState([]);
  const [currentTest, setCurrentTest] = useState(null);
  const [glucoseColumnHidden, setGlucoseColumnHidden] = useState(false);
  const [didRestoreFromStorage, setDidRestoreFromStorage] = useState(false);

  // Filter tests based on selected sport
  const filteredTests = selectedSport === 'all' 
    ? tests 
    : tests.filter(test => test.sport === selectedSport);

  // Reset selected tests when sport changes
  useEffect(() => {
    setSelectedTests([]);
    setCurrentTest(null);
  }, [selectedSport]);

  useEffect(() => {
    if (filteredTests.length === 0) {
      setCurrentTest(null);
      return;
    }
    const lastTestId = localStorage.getItem('lachart:lastTestId');
    if (lastTestId) {
      const found = filteredTests.find(t => t._id === lastTestId);
      if (found) {
        setCurrentTest(found);
        return;
      }
    }
    // fallback – nejnovější
    const mostRecent = filteredTests.reduce((latest, cur) =>
      new Date(cur.date) > new Date(latest.date) ? cur : latest
    );
    setCurrentTest(mostRecent);
  }, [filteredTests]);

  const handleDateSelect = (date) => {
    const selectedTest = filteredTests.find(test => test.date === date);
    if (selectedTest) {
      setCurrentTest(selectedTest);
      setSelectedTests([]);
      window.localStorage.setItem('lachart:lastTestId', selectedTest._id);
    }
  };

  const handleTestSelect = (newSelectedTests) => {
    setSelectedTests(newSelectedTests);
    if (newSelectedTests.length > 0) {
      setCurrentTest(newSelectedTests[0]);
      window.localStorage.setItem('lachart:lastTestId', newSelectedTests[0]._id);
    }
  };

  const handleTestUpdate = async (updatedTest) => {
    try {
      console.log('Updating test with data:', updatedTest);
      const response = await api.put(`/test/${updatedTest._id}`, updatedTest);
      console.log('API response:', response.data);
      setTests(prev => prev.map(t => 
        t._id === updatedTest._id ? response.data : t
      ));
      setCurrentTest(response.data);
      window.localStorage.setItem('lachart:lastTestId', response.data._id);
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
      <AnimatePresence mode="wait">
        {filteredTests && filteredTests.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
        <DateSelector
              dates={filteredTests.map(test => test.date)}
          onSelectDate={handleDateSelect}
        />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-4 text-gray-500"
          >
            No tests available for {selectedSport === 'all' ? 'any sport' : selectedSport}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
      {currentTest && currentTest.results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col lg:flex-row justify-center gap-6 mt-5"
          >
            <motion.div 
              className={`${glucoseColumnHidden ? 'lg:flex-[2]' : 'lg:flex-[2.5]'} w-full`}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              {console.log('Rendering LactateCurve with data:', {
                sport: currentTest.sport,
                results: currentTest.results,
                baseLactate: currentTest.baseLactate
              })}
            <LactateCurve mockData={currentTest} />
            </motion.div>
            <motion.div 
              className={`${glucoseColumnHidden ? 'lg:flex-1' : 'lg:flex-1'} w-full bg-white rounded-2xl shadow-lg md:p-6 sm:p-2`}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
            <TestingForm 
              testData={currentTest}
              onSave={handleTestUpdate}
              onTestDataChange={() => {}} // (disable live change updates)
              onGlucoseColumnChange={handleGlucoseColumnChange}
              onDelete={handleTestDelete}
            />
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {currentTest && currentTest.results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
        <LactateCurveCalculator mockData={currentTest} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
      {currentTest && currentTest.results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
        <TrainingZonesGenerator mockData={currentTest} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <TestSelector 
          tests={filteredTests}
          selectedTests={selectedTests}
          onTestSelect={handleTestSelect}
          selectedSport={selectedSport}
        />
      </motion.div>

      <AnimatePresence>
        {selectedTests && selectedTests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <TestComparison tests={selectedTests} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PreviousTestingComponent;
