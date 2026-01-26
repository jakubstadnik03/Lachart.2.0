import React, { useEffect, useState, useCallback } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingForm from '../components/TrainingForm';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import { TrainingStats } from '../components/DashboardPage/TrainingStats';
import TrainingComparison from '../components/Training-log/TrainingComparison';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { addTraining } from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';
import AthleteSelector from '../components/AthleteSelector';
import { motion, AnimatePresence } from 'framer-motion';

const TrainingPage = () => {
  const { athleteId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (athleteId) return athleteId;
    if (user?.role === 'coach') {
      try {
        const globalId = localStorage.getItem('global_selectedAthleteId');
        if (globalId) return globalId;
      } catch {
        // ignore
      }
      return user?._id || null;
    }
    return null;
  });
  const [trainings, setTrainings] = useState([]);
  // Initialize selectedSport with localStorage or default to 'all'
  const [selectedSport, setSelectedSport] = useState(() => {
    const saved = localStorage.getItem('trainingStats_selectedSport');
    return saved || 'all';
  });
  
  // Save to localStorage when selectedSport changes
  useEffect(() => {
    localStorage.setItem('trainingStats_selectedSport', selectedSport);
  }, [selectedSport]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Přidáme debug log pro user objekt
  // console.log('Current user:', user);

  const loadTrainings = useCallback(async (targetId) => {
    const cacheKey = `athleteTrainings_${targetId}`;
    const tsKey = `${cacheKey}_ts`;
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    // 1) Zkusit načíst tréninky z cache pro rychlé vykreslení
    try {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(tsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (!Number.isNaN(age) && age < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setTrainings(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Error reading trainings cache:', e);
    }

    // 2) Vždy se pokusíme data z API obnovit (stale-while-revalidate)
    try {
      setError(null);

      const response = await api.get(`/user/athlete/${targetId}/trainings`, {
        // kratší TTL v axios cache – chrání server při rychlém přepínání
        cacheTtlMs: 6000,
      });
      const [fitResponse, stravaResponse] = await Promise.all([
        api.get(`/api/fit/trainings`, { params: { athleteId: targetId } }).catch(() => ({ data: [] })),
        api.get(`/api/integrations/activities`, { params: { athleteId: targetId } }).catch(() => ({ data: [] }))
      ]);
      
      const allTrainings = [
        ...response.data,
        ...(fitResponse.data || []).map(t => ({ ...t, category: t.category || null })),
        ...(stravaResponse.data || []).map(a => ({ ...a, category: a.category || null }))
      ];
      
      setTrainings(allTrainings);
      
      // Nastavení výchozího vybraného tréninku
      if (response.data.length > 0) {
        const sportTrainings = selectedSport === 'all' 
          ? response.data 
          : response.data.filter(t => t.sport === selectedSport);
        if (sportTrainings.length > 0) {
          setSelectedTitle(sportTrainings[0].title);
          setSelectedTraining(sportTrainings[0]._id);
        }
      }

      // 3) Uložit do localStorage, aby další stránky/otevření byly rychlé
      try {
        const payload = JSON.stringify(allTrainings);
        if (payload.length < 300000) {
          localStorage.setItem(cacheKey, payload);
          localStorage.setItem(tsKey, Date.now().toString());
        }
      } catch (e) {
        console.warn('Error saving trainings cache:', e);
      }
    } catch (err) {
      console.error('Error loading trainings:', err);
      //  setError('Failed to load trainings');
    }
  }, [selectedSport]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    // Pokud je trenér a není vybraný atlet, nastav sebe jako výchozí
    if (user?.role === 'coach' && !selectedAthleteId) {
      setSelectedAthleteId(user._id);
      return;
    }

    const targetId = selectedAthleteId || user._id;
    loadTrainings(targetId);
  }, [user, isAuthenticated, navigate, selectedAthleteId, loadTrainings]);

  // Posluchač pro změnu atleta
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId, trainings } = event.detail;
      setSelectedAthleteId(athleteId);
      setTrainings(trainings);
      navigate(`/testing/${athleteId}`, { replace: true });

      // Nastavení výchozího vybraného tréninku pro nového atleta
      if (trainings.length > 0) {
      // Filter by sport and category
      let filteredTrainings = trainings;
      if (selectedSport !== 'all') {
        filteredTrainings = filteredTrainings.filter(t => t.sport === selectedSport);
      }
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'uncategorized') {
          filteredTrainings = filteredTrainings.filter(t => !t.category);
        } else {
          filteredTrainings = filteredTrainings.filter(t => t.category === selectedCategory);
        }
      }
      
      const sportTrainings = filteredTrainings;
        if (sportTrainings.length > 0) {
          setSelectedTitle(sportTrainings[0].title);
          setSelectedTraining(sportTrainings[0]._id);
        }
      }
    };

    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => window.removeEventListener('athleteChanged', handleAthleteChange);
  }, [navigate, selectedSport, selectedCategory]);

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
      setIsSubmitting(false);
    }
  };


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
            user={user}
          />
        </motion.div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-semibold"
        >
          Training Log
        </motion.h1>
        <div className="flex items-center gap-3">
          {/* Category Filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 pr-8 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
              style={{ WebkitAppearance: 'none', appearance: 'none' }}
            >
              <option value="all">All categories</option>
              <option value="endurance">Endurance</option>
              <option value="tempo">Tempo</option>
              <option value="threshold">Threshold</option>
              <option value="vo2max">VO2max</option>
              <option value="anaerobic">Anaerobic</option>
              <option value="recovery">Recovery</option>
              <option value="uncategorized">Bez kategorie</option>
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.02 }}
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
          whileHover={{ scale: 1.02 }}
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
        className='max-w-[94vw] md:max-w-none'
      >
        <TrainingStats 
          trainings={trainings} 
          selectedSport={selectedSport}
          onSportChange={setSelectedSport}
          isFullWidth={true}
          user={user}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-6"
      >
        <TrainingComparison trainings={trainings} />
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