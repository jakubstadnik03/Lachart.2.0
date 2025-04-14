import React, { useState, useEffect } from "react";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";
import AthleteSelector from "../components/AthleteSelector";
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

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
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-center h-screen"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </motion.div>
  );

  if (error) return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-[1600px] mx-auto overflow-x-hidden md:p-6"
    >
      {user?.role === 'coach' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-2 sm:mb-4 md:mt-6"
        >
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
          />
        </motion.div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 mb-3 sm:mb-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full sm:w-auto sm:flex-1 min-w-0"
        >
          <SportsSelector
            sports={sports}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full sm:w-auto min-w-0"
        >
          <NotificationBadge
            isActive={showNewTesting}
            onToggle={() => setShowNewTesting((prev) => !prev)}
          />
        </motion.div>
      </div>

      <AnimatePresence>
        {showNewTesting && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-3 sm:mb-6 w-full"
          >
            <NewTestingComponent 
              selectedSport={selectedSport}
              onSubmit={handleAddTest}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="w-full min-w-0 overflow-x-hidden"
      >
        <PreviousTestingComponent 
          selectedSport={selectedSport}
          tests={tests}
          setTests={setTests}
        />
      </motion.div>
    </motion.div>
  );
};

export default TestingPage;
