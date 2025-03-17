import React, { useState, useEffect } from "react";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";

const TestingPage = () => {
  const [showNewTesting, setShowNewTesting] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const sports = [
    { id: "all", name: "All Sports" },
    { id: "run", name: "Running" },
    { id: "bike", name: "Cycling" },
    { id: "swim", name: "Swimming" },
  ];

  useEffect(() => {
    const loadTests = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get(`/test/list/${user._id}`);
        
        // Ensure all test results have valid numeric values
        const processedTests = response.data.map(test => ({
          ...test,
          results: test.results.map(result => ({
            ...result,
            power: Number(result.power) || 0,
            heartRate: Number(result.heartRate) || 0,
            lactate: Number(result.lactate) || 0,
            glucose: Number(result.glucose) || 0,
            RPE: Number(result.RPE) || 0
          }))
        }));
        
        setTests(processedTests);
      } catch (err) {
        console.error('Error loading tests:', err);
        setError('Failed to load tests. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    if (user?._id) {
      loadTests();
    }
  }, [user?._id]);

  const handleAddTest = async (newTest) => {
    try {
      // Ensure numeric values in results
      const processedTest = {
        ...newTest,
        athleteId: user._id,
        results: newTest.results.map(result => ({
          ...result,
          power: Number(result.power) || 0,
          heartRate: Number(result.heartRate) || 0,
          lactate: Number(result.lactate) || 0,
          glucose: Number(result.glucose) || 0,
          RPE: Number(result.RPE) || 0
        }))
      };

      const response = await api.post('/test', processedTest);
      setTests(prev => [...prev, response.data]);
      setShowNewTesting(false);
    } catch (err) {
      console.error('Error adding test:', err);
      setError('Failed to add test. Please try again.');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
    </div>
  );

  if (error) return (
    <div className="p-6 text-red-600">
      {error}
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <SportsSelector
            sports={sports}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </div>

        <div className="ml-4">
          <NotificationBadge
            isActive={showNewTesting}
            onToggle={() => setShowNewTesting((prev) => !prev)}
          />
        </div>
      </div>

      {showNewTesting && (
        <div className="mb-6">
          <NewTestingComponent 
            selectedSport={selectedSport}
            onSubmit={handleAddTest}
          />
        </div>
      )}

      <PreviousTestingComponent 
        selectedSport={selectedSport}
        tests={tests}
        setTests={setTests}
      />
    </div>
  );
};

export default TestingPage;
