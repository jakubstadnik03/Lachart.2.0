import React, { useEffect, useState } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingForm from '../components/TrainingForm';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import { TrainingStats } from '../components/DashboardPage/TrainingStats';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { getTrainingsByAthleteId, addTraining } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';
import AthleteSelector from '../components/AthleteSelector';
import { motion, AnimatePresence } from 'framer-motion';

const TrainingPage = () => {
  const { athleteId } = useParams();
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId);
  const [trainings, setTrainings] = useState([]);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Přidáme debug log pro user objekt
  // console.log('Current user:', user);

  const loadTrainings = async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/user/athlete/${targetId}/trainings`);
      setTrainings(response.data);
      
      // Nastavení výchozího vybraného tréninku
      if (response.data.length > 0) {
        const sportTrainings = response.data.filter(t => t.sport === selectedSport);
        if (sportTrainings.length > 0) {
          setSelectedTitle(sportTrainings[0].title);
          setSelectedTraining(sportTrainings[0]._id);
        }
      }
    } catch (err) {
      console.error('Error loading trainings:', err);
      setError('Failed to load trainings');
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
    loadTrainings(targetId);
  }, [user, isAuthenticated, navigate, selectedAthleteId]);

  // Posluchač pro změnu atleta
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId, trainings } = event.detail;
      setSelectedAthleteId(athleteId);
      setTrainings(trainings);
      
      // Nastavení výchozího vybraného tréninku pro nového atleta
      if (trainings.length > 0) {
        const sportTrainings = trainings.filter(t => t.sport === selectedSport);
        if (sportTrainings.length > 0) {
          setSelectedTitle(sportTrainings[0].title);
          setSelectedTraining(sportTrainings[0]._id);
        }
      }
    };

    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => window.removeEventListener('athleteChanged', handleAthleteChange);
  }, [selectedSport]);

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/training/${newAthleteId}`);
  };

  // Funkce pro přidání nového tréninku
  const handleAddTraining = async (formData) => {
    try {
      setIsSubmitting(true);
      console.log('Auth user:', user);
      
      if (!user?._id) {
        console.log('User ID missing, full user object:', user);
        throw new Error('User not authenticated');
      }

      setLoading(true);
      setError(null);

      const targetId = selectedAthleteId || user._id;
      const trainingData = {
        ...formData,
        athleteId: targetId,
        coachId: user._id
      };

      console.log('Sending training data:', trainingData);

      const response = await addTraining(trainingData);
      console.log('Training created:', response.data);

      await loadTrainings(targetId);

      setSelectedSport(response.data.sport);
      setSelectedTitle(response.data.title);
      setSelectedTraining(response.data._id);

      setIsFormOpen(false);

      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 ease-in-out';
      notification.textContent = 'Training successfully added!';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
      }, 3000);

    } catch (err) {
      console.error('Error adding training:', err);
      console.log('Full error object:', err);
      setError(err.response?.data?.message || 'Failed to add training');
      
      // Show error notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 ease-in-out';
      notification.textContent = `Failed to add training: ${err.response?.data?.message || err.message}`;
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
      }, 3000);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  // Helper funkce pro převod formátu MM:SS na sekundy
  const parseMMSSToSeconds = (mmss) => {
    if (!mmss) return null;
    const [minutes, seconds] = mmss.split(':').map(Number);
    return minutes * 60 + (seconds || 0);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
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
      className="py-2 md:p-6 max-w-[1600px] mx-auto"
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
      <div className="flex justify-between items-center mb-6">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-semibold"
        >
          Training Log
        </motion.h1>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-violet-500 transition-colors"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          {isSubmitting ? 'Adding...' : 'Add Training'}
        </motion.button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <SpiderChart 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
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
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mb-6"
      >
        <UserTrainingsTable trainings={trainings} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <TrainingStats 
          trainings={trainings} 
          selectedSport={selectedSport}
          onSportChange={setSelectedSport}
        />
      </motion.div>

      <AnimatePresence>
        {isFormOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="relative">
                <TrainingForm 
                  onClose={() => setIsFormOpen(false)} 
                  onSubmit={handleAddTraining}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TrainingPage;