import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import LactateCurve from "./LactateCurve";
import TestingForm from "./TestingForm";
import DateSelector from "../DateSelector";
import LactateCurveCalculator from "./LactateCurveCalculator";
import TrainingZonesGenerator from "./TrainingZonesGenerator";
import TestComparison from "./TestComparison";
import TestSelector from "./TestSelector";
import { resolveLtAnchorsFromTest } from "./resolveLtAnchorsFromTest";
import { updateTest, deleteTest } from '../../services/api';
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from '../../context/AuthProvider';
import { getUserUnits, resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { usePremium } from '../../hooks/usePremium';
import UpgradeModal from '../UpgradeModal';
import { LockClosedIcon } from '@heroicons/react/24/outline';

const KM_PER_MILE = 1.609344;

const RacePacePredictorCard = lazy(() => import("../RacePacePredictor/RacePacePredictorCard.tsx"));

function predictorSportFromTest(test) {
  const s = String(test?.sport || "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("bike") || s === "cycling" || s === "cycle") return "bike";
  if (s.includes("run")) return "run";
  if (s.includes("swim")) return "swim";
  return null;
}

/** True when this test's run paces were stored as seconds per mile (aligned with LactateCurveCalculator). */
function testRunPaceStoredPerMile(test) {
  const u = String(test?.unitSystem ?? "").trim().toLowerCase();
  return (
    u === "imperial" ||
    u === "us" ||
    u === "mile" ||
    u === "miles" ||
    u === "mi" ||
    u === "mph"
  );
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Rough training context for Race Pace card from Strava-linked activities (~8 weeks). */
function buildPredictorTraining(externalActivities, sport) {
  const now = Date.now();
  const cutoff = now - 56 * 24 * 60 * 60 * 1000;
  const matchSport = (act) => {
    const s = String(act.sport || act.type || "").toLowerCase();
    if (sport === "bike") {
      return (
        s.includes("ride") ||
        s.includes("bike") ||
        s.includes("cycling") ||
        s === "virtualride"
      );
    }
    if (sport === "run") return s.includes("run");
    if (sport === "swim") return s.includes("swim");
    return false;
  };
  const acts = (externalActivities || []).filter((a) => {
    const t = new Date(a.startDate || a.date || a.start_date || 0).getTime();
    return !Number.isNaN(t) && t >= cutoff && matchSport(a);
  });
  const sessions = acts.length;
  const volume = acts.reduce((sum, a) => {
    const sec = Number(a.movingTime ?? a.elapsedTime ?? a.duration ?? 0);
    return sum + (Number.isFinite(sec) && sec > 0 ? sec / 3600 : 0);
  }, 0);
  const longWorkout = acts.reduce((max, a) => {
    const sec = Number(a.movingTime ?? a.elapsedTime ?? a.duration ?? 0);
    const h = Number.isFinite(sec) && sec > 0 ? sec / 3600 : 0;
    return Math.max(max, h);
  }, 0);
  const intervals = clamp(Math.round(sessions / 12), 0, 5);
  if (sessions === 0) {
    return {
      volume: 8,
      sessions: 6,
      zoneDistribution: [0.28, 0.34, 0.2, 0.12, 0.06],
      longWorkout: 1.5,
      intervals: 1,
    };
  }
  const z1 = clamp(0.22 + (sessions > 24 ? 0.06 : 0), 0.18, 0.4);
  const z2 = clamp(0.34 - (sessions > 24 ? 0.04 : 0), 0.22, 0.38);
  const z3 = 0.2;
  const z4 = clamp(0.12 + (longWorkout < 1.5 ? 0.03 : 0), 0.06, 0.18);
  let z5 = clamp(1 - z1 - z2 - z3 - z4, 0.02, 0.12);
  const raw = [z1, z2, z3, z4, z5];
  const sumZ = raw.reduce((a, b) => a + b, 0) || 1;
  const zoneDistribution = raw.map((v) => v / sumZ);
  return {
    volume: Math.round(volume * 10) / 10,
    sessions,
    zoneDistribution,
    longWorkout: Math.round(longWorkout * 10) / 10,
    intervals,
  };
}

function PremiumLockedCard({ title, description, onUpgrade }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 flex flex-col items-center justify-center gap-3 text-center min-h-[160px]">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <LockClosedIcon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={onUpgrade}
        className="mt-1 px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

const PreviousTestingComponent = ({
  selectedSport,
  tests = [],
  setTests,
  selectedTestId = null,
  onSelectTestId,
  externalActivities = [],
  athleteId = null,
}) => {
  const { user } = useAuth();
  // usePremium already force-unlocks on native iOS for App Store 3.1.1 —
  // see comment in client/src/hooks/usePremium.js.
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const [selectedTests, setSelectedTests] = useState([]);
  const [currentTest, setCurrentTest] = useState(null);
  const [glucoseColumnHidden, setGlucoseColumnHidden] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastRestoredTestIdRef = useRef(null);

  // Filter tests based on selected sport and validate.
  // IMPORTANT: memoize arrays so useEffect dependencies don't churn on every render (prevents UI freezes).
  const validTests = useMemo(() => (
    Array.isArray(tests) ? tests.filter(test => test && test._id) : []
  ), [tests]);
  
  const uniqueTests = useMemo(() => {
    const seenIds = new Set();
    return validTests.filter(test => {
      const testIdStr = String(test._id);
      if (seenIds.has(testIdStr)) {
        // Keep warning but avoid spamming: duplicates usually come in batches
        return false;
      }
      seenIds.add(testIdStr);
      return true;
    });
  }, [validTests]);
  
  const filteredTests = useMemo(() => (
    selectedSport === 'all'
      ? uniqueTests
      : uniqueTests.filter(test => test.sport === selectedSport)
  ), [uniqueTests, selectedSport]);

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
      try {
        // Avoid noisy logs; this effect runs during navigation/restores.
        
        // First check in all tests (not filtered by sport), in case sport filter is hiding it
        // Validate tests array and filter out invalid entries
        const validTests = Array.isArray(tests) ? tests.filter(t => t && t._id) : [];
        
        // Try to find test by ID - normalize both to strings for comparison
        const searchIdStr = String(selectedTestId);
        const foundInAll = validTests.find(t => String(t._id) === searchIdStr);

        // If currentTest already matches URL, don't override it.
        if (currentTest && String(currentTest._id) === searchIdStr) {
          setIsInitialized(true);
          lastRestoredTestIdRef.current = currentTest._id;
          return;
        }
        
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
          } else {
            console.warn('[PreviousTestingComponent] Test found but has no valid results:', foundInAll);
          }
        } else {
          // Test from URL not found in all tests
          console.warn('[PreviousTestingComponent] Test not found in tests array:', selectedTestId);
          
          if (tests.length === 0) {
            // Tests are still loading - wait and don't do anything else
            // This prevents fallback from running before tests are loaded
            return;
          }
          // Tests are loaded but test not found - it might have been deleted
          // Keep URL as is (don't change it), but don't set currentTest
          // This way URL stays the same even if test doesn't exist
          // Don't use fallback if URL has testId - preserve the URL
          console.warn('[PreviousTestingComponent] Test not found after tests loaded');
          return;
        }
      } catch (error) {
        console.error('[PreviousTestingComponent] Error handling selectedTestId:', error);
        // Don't crash, just continue with fallback logic
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

    // Recovery:
    // If the currently displayed test is no longer present in the loaded list,
    // clear it so Priority 5 fallback can select a valid test.
    if (!selectedTestId && currentTest && Array.isArray(filteredTests) && filteredTests.length > 0) {
      const stillExists = filteredTests.some(t => String(t._id) === String(currentTest._id));
      if (!stillExists) {
        setCurrentTest(null);
        setSelectedTests([]);
        setIsInitialized(false);
        lastRestoredTestIdRef.current = null;
        return;
      }
    }
    
    // PRIORITY 2: If we already have a currentTest that matches the restored ID, keep it
    if (currentTest && String(lastRestoredTestIdRef.current) === String(currentTest._id) && !selectedTestId) {
      const stillValid = filteredTests.find(t => String(t._id) === String(currentTest._id));
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
      const found = filteredTests.find(t => String(t._id) === String(lastTestId));
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
        const foundInAll = allTests.find(t => String(t._id) === String(lastTestId));
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
      const restoredTest = filteredTests.find(t => String(t._id) === String(lastRestoredTestIdRef.current));
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
      } else {
        setCurrentTest(null);
        setIsInitialized(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTests, selectedSport, tests.length, selectedTestId]);

  const handleDateSelectorTestSelect = useCallback((testId) => {
    const selectedTest = filteredTests.find(test => test._id === testId);
    if (selectedTest) {
      setCurrentTest(selectedTest);
      setSelectedTests([]);
      lastRestoredTestIdRef.current = selectedTest._id;
      const testKey = `lachart:lastTestId:${selectedSport}`;
      localStorage.setItem(testKey, selectedTest._id);
      localStorage.setItem('lachart:lastTestId', selectedTest._id);
      if (typeof onSelectTestId === 'function') onSelectTestId(selectedTest._id);
    }
  }, [filteredTests, selectedSport, onSelectTestId]);

  const handleTestSelect = useCallback((newSelectedTests) => {
    setSelectedTests(newSelectedTests);
    if (newSelectedTests.length > 0) {
      setCurrentTest(newSelectedTests[0]);
      lastRestoredTestIdRef.current = newSelectedTests[0]._id;
      const testKey = `lachart:lastTestId:${selectedSport}`;
      localStorage.setItem(testKey, newSelectedTests[0]._id);
      localStorage.setItem('lachart:lastTestId', newSelectedTests[0]._id);
      if (typeof onSelectTestId === 'function') onSelectTestId(newSelectedTests[0]._id);
    } else {
      if (typeof onSelectTestId === 'function') onSelectTestId(null);
    }
  }, [selectedSport, onSelectTestId]);

  const handleTestUpdate = useCallback(async (updatedTest) => {
    try {
      const response = await updateTest(updatedTest._id, updatedTest);
      setTests(prev => prev.map(t => t._id === updatedTest._id ? response.data : t));
      setCurrentTest(response.data);
      lastRestoredTestIdRef.current = response.data._id;
      const testKey = `lachart:lastTestId:${selectedSport}`;
      localStorage.setItem(testKey, response.data._id);
      localStorage.setItem('lachart:lastTestId', response.data._id);
      setSelectedTests(prev => prev.map(t => t._id === updatedTest._id ? response.data : t));
    } catch (err) {
      console.error('Error updating test:', err);
      throw err;
    }
  }, [selectedSport, setTests]);

  const handleTestDelete = useCallback(async (testToDelete) => {
    try {
      await deleteTest(testToDelete._id);
      setTests(prev => prev.filter(t => t._id !== testToDelete._id));
      setCurrentTest(null);
      setSelectedTests(prev => prev.filter(t => t._id !== testToDelete._id));
    } catch (err) {
      console.error('Error deleting test:', err);
    }
  }, [setTests]);

  const handleGlucoseColumnChange = (hidden) => {
    setGlucoseColumnHidden(hidden);
  };

  const racePredictorProps = useMemo(() => {
    if (!currentTest?.results?.length) return null;
    const sport = predictorSportFromTest(currentTest);
    // Support run and bike; swim uses same pace logic as run
    if (!sport) return null;
    const anchors = resolveLtAnchorsFromTest(currentTest);
    if (!anchors) return null;

    const raw = currentTest.results
      .map((r) => ({
        load: Number(String(r.power ?? "").replace(",", ".")),
        lac: Number(String(r.lactate ?? "").replace(",", ".")),
      }))
      .filter((p) => Number.isFinite(p.load) && Number.isFinite(p.lac));

    if (raw.length < 3) return null;

    const training = buildPredictorTraining(externalActivities, sport);
    const athleteWeightKg = currentTest.weight ? Number(currentTest.weight) : undefined;

    if (sport === "bike") {
      // Cycling: X-axis is power in watts — use values directly, no pace conversion
      const lactateCurve = [...raw]
        .map((p) => ({ x: p.load, y: p.lac }))
        .sort((a, b) => a.x - b.x);
      const lt1 = anchors.lt1_value;
      const lt2 = anchors.lt2_value;
      return {
        lt1,
        lt2,
        lactateCurve,
        training,
        sport,
        athleteWeightKg: athleteWeightKg && athleteWeightKg > 0 ? athleteWeightKg : undefined,
      };
    }

    // Run / swim: X-axis is pace (min/km internally)
    const displayUnitSystem = resolveDistanceUnitSystem(
      { units: getUserUnits(user) },
      currentTest.unitSystem || "metric"
    );
    const testStoredPerMile = testRunPaceStoredPerMile(currentTest);
    const paceSecToMinPerKm = (paceSeconds) =>
      testStoredPerMile ? paceSeconds / (60 * KM_PER_MILE) : paceSeconds / 60;

    const lactateCurve = [...raw]
      .map((p) => ({ x: paceSecToMinPerKm(p.load), y: p.lac }))
      .sort((a, b) => b.x - a.x);
    const lt1 = paceSecToMinPerKm(anchors.lt1_value);
    const lt2 = paceSecToMinPerKm(anchors.lt2_value);

    return {
      lt1,
      lt2,
      lactateCurve,
      training,
      sport,
      unitSystem: displayUnitSystem,
    };
  }, [currentTest, externalActivities, user]);

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
            className="flex flex-col lg:flex-row justify-center gap-4 lg:gap-6 mt-4 sm:mt-5"
          >
            <div className={`${glucoseColumnHidden ? 'lg:flex-[2]' : 'lg:flex-[2.5]'} w-full`}>
              <LactateCurve mockData={currentTest} />
            </div>
            <div className={`lg:flex-1 w-full bg-white rounded-2xl shadow-lg p-1 sm:p-2 md:p-6 min-h-[380px] sm:min-h-[500px] lg:h-[600px] flex flex-col overflow-hidden`}>
              <TestingForm
                testData={currentTest}
                onSave={handleTestUpdate}
                onTestDataChange={() => {}}
                onGlucoseColumnChange={handleGlucoseColumnChange}
                onDelete={handleTestDelete}
                isPremium={isPremium}
              />
            </div>
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
        <LactateCurveCalculator mockData={currentTest} athleteId={athleteId} isPremium={isPremium} />
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
        {isPremium ? (
          <TrainingZonesGenerator mockData={currentTest} />
        ) : (
          <PremiumLockedCard
            title="Training Zones"
            description="Unlock personalised training zones based on your lactate thresholds."
            onUpgrade={() => gate('Training Zones', 'pro')}
          />
        )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {racePredictorProps && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            <Suspense
              fallback={
                <div className="rounded-xl border border-gray-100 bg-white/80 p-4 text-center text-sm text-gray-500">
                  Loading race predictor…
                </div>
              }
            >
              {isPremium ? (
                <RacePacePredictorCard {...racePredictorProps} />
              ) : (
                <PremiumLockedCard
                  title="Race Pace Predictor"
                  description="Predict your race paces based on your lactate test thresholds."
                  onUpgrade={() => gate('Race Pace Predictor', 'pro')}
                />
              )}
            </Suspense>
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
            className="mt-6 overflow-visible"
          >
            <TestComparison tests={selectedTests} />
          </motion.div>
        )}
      </AnimatePresence>

      <UpgradeModal {...UpgradeModalProps} />
    </div>
  );
};

export default PreviousTestingComponent;
