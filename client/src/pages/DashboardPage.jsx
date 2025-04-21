import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from 'react-router-dom';
import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/DashboardPage/TrainingTable";
import { TrainingStats } from "../components/DashboardPage/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import AthleteSelector from "../components/AthleteSelector";
import LactateCurveCalculator from "../components/Testing-page/LactateCurveCalculator";
import DateSelector from "../components/DateSelector";
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { 
  CalendarIcon, 
  ClockIcon, 
  FireIcon, 
  HeartIcon, 
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';

const DashboardPage = () => {
  const { athleteId } = useParams();
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [currentTest, setCurrentTest] = useState(null);
  const [tests, setTests] = useState([]);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const loadTrainings = async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/user/athlete/${targetId}/trainings`);
      if (response && response.data) {
        return response.data;
      }
    } catch (error) {
      console.error('Error loading trainings:', error);
     // setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTests = async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/test/list/${targetId}`);
      if (response && response.data) {
        setTests(response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Error loading tests:', error);
      setError('Failed to load tests');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadAthlete = async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/user/athlete/${targetId}`);
      if (response && response.data) {
        return response.data;
      }
    } catch (error) {
      console.error('Error loading athlete:', error);
    //  setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const targetId = selectedAthleteId || user._id;
    const loadData = async () => {
      try {
        if (!user || !user._id) return;
        
        // Pokud je uživatel trenér a má vybraného atleta, načteme data pro atleta
        // Jinak načteme data pro samotného uživatele
        const athleteId = user.role === 'coach' && selectedAthleteId ? selectedAthleteId : user._id;
        
        const [trainingsData, athleteData, testsData] = await Promise.all([
          loadTrainings(athleteId),
          loadAthlete(athleteId),
          loadTests(athleteId)
        ]);

        if (trainingsData) {
          setTrainings(trainingsData);
        }
        if (athleteData) {
          setSelectedAthleteId(athleteData._id);
        }
      } catch (error) {
        console.error('Error loading data:', error);
       // setError(error.message);
      }
    };

    loadData();
  }, [user?._id, selectedAthleteId]);

  useEffect(() => {
    if (trainings.length > 0) {
      const sportTrainings = trainings.filter(t => t.sport === selectedSport);
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        setSelectedTitle(uniqueTitles[0]);
        const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
        if (firstTrainingWithTitle) {
          setSelectedTraining(firstTrainingWithTitle._id);
        }
      }
    }
  }, [selectedSport, trainings]);

  const handleDateSelect = (date) => {
    const selectedTest = tests.find(test => new Date(test.date).toISOString() === new Date(date).toISOString());
    setCurrentTest(selectedTest);
  };

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/dashboard/${newAthleteId}`);
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

  if (!user) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 text-gray-600"
    >
      Please log in to view this page
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-6 m-auto max-w-[1600px] mx-auto py-4 md:p-6"
    >
      {user?.role === 'coach' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
          />
        </motion.div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-3 md:col-span-2"
        >
          <TrainingTable 
            trainings={trainings}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 md:col-span-2"
        >
          <SpiderChart 
            trainings={trainings}
            selectedSport={selectedSport}
            setSelectedSport={setSelectedSport}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-3 md:col-span-2"
        >
          <TrainingStats 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="lg:col-span-2 md:col-span-2"
        >
          <TrainingGraph 
            trainingList={trainings}
            selectedSport={selectedSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTraining={selectedTraining}
            setSelectedTraining={setSelectedTraining}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="lg:col-span-5 md:col-span-2"
        >
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
              <LactateCurveCalculator mockData={currentTest} />
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default DashboardPage;
