import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from 'react-router-dom';
import LactateCurve from "./LactateCurve";
import TestingForm from "./TestingForm";
import DateSelector from "../DateSelector";
import LactateCurveCalculator from "./LactateCurveCalculator";
import TrainingZonesGenerator from "./TrainingZonesGenerator";
import TestComparison from "./TestComparison";
import TestSelector from "./TestSelector";
import api from '../../services/api';
import { motion, AnimatePresence } from "framer-motion";

const PreviousTestingComponent = ({ selectedSport, tests = [], setTests, selectedTestId = null }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTests, setSelectedTests] = useState([]);
  const [currentTest, setCurrentTest] = useState(null);
  const [glucoseColumnHidden, setGlucoseColumnHidden] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastRestoredTestIdRef = useRef(null);

  // Filter tests based on selected sport
  const filteredTests = selectedSport === 'all' 
    ? tests 
    : tests.filter(test => test.sport === selectedSport);

  // Reset selected tests when sport changes, but keep initialization state
  // The main useEffect will handle restoring the correct test for the new sport
  useEffect(() => {
    setSelectedTests([]);
    // Don't reset isInitialized or lastRestoredTestIdRef here - let the main useEffect
    // restore the test from localStorage for the new sport
    // Only reset if we're switching to a completely different sport context
  }, [selectedSport]);

  useEffect(() => {
    // PRIORITY 1: Use testId from URL (highest priority) - check this FIRST, even if tests are loading
    // This ensures URL testId is always respected, even on page refresh
    if (selectedTestId) {
      // First check in all tests (not filtered by sport), in case sport filter is hiding it
      const foundInAll = tests.find(t => t._id === selectedTestId);
      if (foundInAll) {
        // Check if test has valid results
        if (foundInAll.results && Array.isArray(foundInAll.results) && foundInAll.results.length > 0) {
          setCurrentTest(foundInAll);
          setIsInitialized(true);
          lastRestoredTestIdRef.current = foundInAll._id;
          // Save to localStorage for persistence
          const lastTestKey = `lachart:lastTestId:${selectedSport}`;
          const generalTestKey = 'lachart:lastTestId';
          localStorage.setItem(lastTestKey, foundInAll._id);
          localStorage.setItem(generalTestKey, foundInAll._id);
          return; // Exit early - URL testId has highest priority
        }
      } else {
        // Test from URL not found in all tests
        if (tests.length === 0) {
          // Tests are still loading - wait and don't do anything else
          // This prevents fallback from running before tests are loaded
          return;
        }
        // Tests are loaded but test not found - it might have been deleted
        // Keep URL as is (don't change it), but don't set currentTest
        // This way URL stays the same even if test doesn't exist
        // Don't use fallback if URL has testId - preserve the URL
        return;
      }
    }
    
    // If no tests available yet, wait (don't reset anything)
    // But only if we don't have a testId in URL (which was already handled above)
    if (filteredTests.length === 0 && !selectedTestId) {
      // Only reset if we're sure there are no tests (after initialization)
      if (isInitialized && tests.length === 0) {
        // All tests loaded but none available for this sport
      setCurrentTest(null);
        setIsInitialized(false);
        lastRestoredTestIdRef.current = null;
      }
      return;
    }
    
    // PRIORITY 2: If we already have a currentTest that matches the restored ID, keep it
    if (currentTest && lastRestoredTestIdRef.current === currentTest._id && !selectedTestId) {
      const stillValid = filteredTests.find(t => t._id === currentTest._id);
      if (stillValid && stillValid.results && Array.isArray(stillValid.results) && stillValid.results.length > 0) {
        // Test is still valid, just update with fresh data
        setCurrentTest(stillValid);
        return;
      }
    }
    
    // PRIORITY 3: Try to restore from localStorage (sport-specific key first, then general)
    const lastTestKey = `lachart:lastTestId:${selectedSport}`;
    const generalTestKey = 'lachart:lastTestId';
    const lastTestId = localStorage.getItem(lastTestKey) || localStorage.getItem(generalTestKey);
    
    if (lastTestId) {
      const found = filteredTests.find(t => t._id === lastTestId);
      if (found) {
        // Check if test has valid results
        if (found.results && Array.isArray(found.results) && found.results.length > 0) {
        setCurrentTest(found);
          setIsInitialized(true);
          lastRestoredTestIdRef.current = found._id;
          // Update both keys for backward compatibility
          localStorage.setItem(lastTestKey, found._id);
          localStorage.setItem(generalTestKey, found._id);
          return;
        } else {
          // Test exists but has no valid results, remove it from storage
          localStorage.removeItem(lastTestKey);
          localStorage.removeItem(generalTestKey);
        }
      } else {
        // Test not found in filteredTests - might be for different sport or not loaded yet
        // If we have tests loaded but test not found, it might be filtered out by sport
        // Check if test exists in all tests (not filtered)
        const allTests = selectedSport === 'all' ? tests : tests;
        const foundInAll = allTests.find(t => t._id === lastTestId);
        if (foundInAll && foundInAll.sport !== selectedSport && selectedSport !== 'all') {
          // Test exists but for different sport - clear it from storage for this sport
          localStorage.removeItem(lastTestKey);
          // But keep general key in case user switches back
        }
        // If test not found at all and we're initialized, it might have been deleted
        // Don't use fallback yet - wait a bit more
        if (!isInitialized) {
          return; // Wait for tests to fully load
        }
      }
    }
    
    // PRIORITY 4: If already initialized and we have a restored test ID, try to keep it
    if (isInitialized && lastRestoredTestIdRef.current && !selectedTestId) {
      const restoredTest = filteredTests.find(t => t._id === lastRestoredTestIdRef.current);
      if (restoredTest && restoredTest.results && Array.isArray(restoredTest.results) && restoredTest.results.length > 0) {
        setCurrentTest(restoredTest);
        return;
      }
    }
    
    // PRIORITY 5: Fallback - only if we haven't initialized and no test in localStorage or URL
    if (!isInitialized && !lastRestoredTestIdRef.current && !lastTestId && !selectedTestId) {
      // fallback – nejnovější test s validními results
      const validTests = filteredTests.filter(t => t.results && Array.isArray(t.results) && t.results.length > 0);
      if (validTests.length > 0) {
        const mostRecent = validTests.reduce((latest, cur) =>
      new Date(cur.date) > new Date(latest.date) ? cur : latest
    );
    setCurrentTest(mostRecent);
        setIsInitialized(true);
        lastRestoredTestIdRef.current = mostRecent._id;
        // Save the selected test
        localStorage.setItem(lastTestKey, mostRecent._id);
        localStorage.setItem(generalTestKey, mostRecent._id);
        // Only update URL with testId if URL doesn't already have one (to preserve existing URL on refresh)
        if (!searchParams.get('testId')) {
          const newParams = new URLSearchParams(searchParams);
          newParams.set('testId', mostRecent._id);
          setSearchParams(newParams, { replace: true });
        }
      } else {
        setCurrentTest(null);
        setIsInitialized(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTests, selectedSport, tests.length, selectedTestId]);

  const handleDateSelectorTestSelect = (testId) => {
    const selectedTest = filteredTests.find(test => test._id === testId);
    if (selectedTest) {
      setCurrentTest(selectedTest);
      setSelectedTests([]);
      lastRestoredTestIdRef.current = selectedTest._id;
      // Save with sport-specific key
      const testKey = `lachart:lastTestId:${selectedSport}`;
      localStorage.setItem(testKey, selectedTest._id);
      localStorage.setItem('lachart:lastTestId', selectedTest._id);
      // Update URL with testId
      const newParams = new URLSearchParams(searchParams);
      newParams.set('testId', selectedTest._id);
      setSearchParams(newParams, { replace: true });
    }
  };

  const handleTestSelect = (newSelectedTests) => {
    setSelectedTests(newSelectedTests);
    if (newSelectedTests.length > 0) {
      setCurrentTest(newSelectedTests[0]);
      lastRestoredTestIdRef.current = newSelectedTests[0]._id;
      // Save with sport-specific key
      const testKey = `lachart:lastTestId:${selectedSport}`;
      localStorage.setItem(testKey, newSelectedTests[0]._id);
      localStorage.setItem('lachart:lastTestId', newSelectedTests[0]._id);
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
      lastRestoredTestIdRef.current = response.data._id;
      // Save with sport-specific key
      const testKey = `lachart:lastTestId:${selectedSport}`;
      localStorage.setItem(testKey, response.data._id);
      localStorage.setItem('lachart:lastTestId', response.data._id);
      // Update URL with testId
      const newParams = new URLSearchParams(searchParams);
      newParams.set('testId', response.data._id);
      setSearchParams(newParams, { replace: true });
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
          tests={filteredTests}
          onSelectTest={handleDateSelectorTestSelect}
          selectedTestId={currentTest?._id}
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
      {currentTest && currentTest.results && Array.isArray(currentTest.results) && currentTest.results.length > 0 && (
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
            <LactateCurve mockData={currentTest} />
            </motion.div>
            <motion.div 
              className={`${glucoseColumnHidden ? 'lg:flex-1' : 'lg:flex-1'} w-full bg-white rounded-2xl shadow-lg md:p-6 sm:p-2 h-[600px] flex flex-col`}
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
      {currentTest && currentTest.results && Array.isArray(currentTest.results) && currentTest.results.length > 0 && (
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
      {currentTest && currentTest.results && Array.isArray(currentTest.results) && currentTest.results.length > 0 && (
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
