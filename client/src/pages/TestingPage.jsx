import React, { useState, useEffect } from "react";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";
import AthleteSelector from "../components/AthleteSelector";
import { useParams, useNavigate } from 'react-router-dom';

const TestingPage = () => {
  const { athleteId } = useParams();
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId);
  const [showNewTesting, setShowNewTesting] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const sports = [
    { id: "all", name: "All Sports" },
    { id: "run", name: "Running" },
    { id: "bike", name: "Cycling" },
    { id: "swim", name: "Swimming" },
  ];

  const loadTests = async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/test/list/${targetId}`);
      setTests(response.data);
    } catch (err) {
      console.error('Error loading tests:', err);
      setError('Failed to load tests');
    } finally {
      setLoading(false);
    }
  };

  // Synchronizace selectedAthleteId s URL parametrem
  useEffect(() => {
    if (athleteId) {
      setSelectedAthleteId(athleteId);
    }
  }, [athleteId]);

  // Načtení dat při prvním načtení stránky nebo změně atleta
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const targetId = selectedAthleteId || user._id;
    loadTests(targetId);
  }, [user, isAuthenticated, navigate, selectedAthleteId]);

  // Posluchač pro změnu atleta z menu
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId } = event.detail;
      setSelectedAthleteId(athleteId);
      navigate(`/testing/${athleteId}`, { replace: true });
    };

    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => window.removeEventListener('athleteChanged', handleAthleteChange);
  }, [navigate]);

  const handleAddTest = async (newTest) => {
    try {
      const processedTest = {
        ...newTest,
        athleteId: selectedAthleteId || user._id,
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

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/testing/${newAthleteId}`, { replace: true });
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
    <div className="w-full max-w-[1600px] mx-auto px-1 sm:px-4 lg:px-6 overflow-x-hidden">
      {user?.role === 'coach' && (
        <div className="mb-2 sm:mb-4 md:mt-6">
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
          />
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 mb-3 sm:mb-6 md:mt-5 sm:mt-1">
        <div className="w-full sm:w-auto sm:flex-1 min-w-0">
          <SportsSelector
            sports={sports}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </div>

        <div className="w-full sm:w-auto min-w-0">
          <NotificationBadge
            isActive={showNewTesting}
            onToggle={() => setShowNewTesting((prev) => !prev)}
          />
        </div>
      </div>

      {showNewTesting && (
        <div className="mb-3 sm:mb-6 w-full">
          <NewTestingComponent 
            selectedSport={selectedSport}
            onSubmit={handleAddTest}
          />
        </div>
      )}

      <div className="w-full min-w-0 overflow-x-hidden">
        <PreviousTestingComponent 
          selectedSport={selectedSport}
          tests={tests}
          setTests={setTests}
        />
      </div>
    </div>
  );
};

export default TestingPage;
