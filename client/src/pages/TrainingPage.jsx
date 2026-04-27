import React, { useEffect, useState, useCallback, useMemo, Suspense, lazy } from 'react';
import { PlusIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingForm from '../components/TrainingForm';
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import { TrainingStats } from '../components/DashboardPage/TrainingStats';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { addTraining, updateTraining, getStravaActivityDetail } from '../services/api';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import FieldLactateTrainingPanel from '../components/training/FieldLactateTrainingPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { useCategories } from '../context/CategoryContext';

const TrainingComparison = lazy(() => import('../components/Training-log/TrainingComparison'));

const COACH_LIKE_ROLES = ['coach', 'tester', 'testing'];

export default function TrainingPage() {
  const { athleteId } = useParams();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const coachLike = COACH_LIKE_ROLES.includes(String(user?.role || '').toLowerCase());
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (athleteId) return athleteId;
    if (coachLike && user) {
      try {
        const globalId = localStorage.getItem('global_selectedAthleteId');
        if (globalId) return globalId;
      } catch {
        // ignore
      }
      return user._id || null;
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
  const { categories, getCategoryStyle } = useCategories();
  const [fieldLactatePanelKey, setFieldLactatePanelKey] = useState(0);
  const [lactateActivityLoadingId, setLactateActivityLoadingId] = useState(null);
  const [stravaLactateFormError, setStravaLactateFormError] = useState(null);
  const [stravaLactateModal, setStravaLactateModal] = useState({
    isOpen: false,
    initialData: null,
  });
  const [stravaLactateSubmitting, setStravaLactateSubmitting] = useState(false);

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

    if (coachLike && user?._id && !selectedAthleteId) {
      setSelectedAthleteId(user._id);
      return;
    }

    const targetId = selectedAthleteId || user._id;
    loadTrainings(targetId);
  }, [user, isAuthenticated, navigate, selectedAthleteId, loadTrainings, coachLike]);

  useEffect(() => {
    if (location.hash !== '#field-lactate') return;
    const t = window.setTimeout(() => {
      document.getElementById('field-lactate')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname]);

  const integrationAthleteId = useMemo(() => {
    if (!user || !coachLike || !selectedAthleteId) return null;
    if (String(selectedAthleteId) !== String(user._id)) return String(selectedAthleteId);
    return null;
  }, [user, coachLike, selectedAthleteId]);

  const closeStravaLactateModal = useCallback(() => {
    setStravaLactateModal({
      isOpen: false,
      initialData: null,
    });
  }, []);

  const handleFieldAddLactate = useCallback(
    async (activity) => {
      const stravaNumericId = String(activity.stravaId || '');
      if (!stravaNumericId) {
        setStravaLactateFormError('No Strava ID found for this activity.');
        return;
      }
      setStravaLactateFormError(null);
      setLactateActivityLoadingId(String(activity._id || activity.stravaId));
      try {
        const integAthleteId = integrationAthleteId ? String(integrationAthleteId) : null;
        const data = await getStravaActivityDetail(stravaNumericId, integAthleteId);
        const detail = data.detail || {};
        const laps = data.laps || [];
        if (!laps.length) {
          setStravaLactateFormError('No intervals found for this activity.');
          return;
        }
        // Build form data the same way as FitAnalysisPage's performExportToTraining
        const sportType = detail.sport_type || detail.sport || 'bike';
        const sportLower = sportType.toLowerCase();
        const sport = sportLower.includes('swim') ? 'swim' : sportLower.includes('run') ? 'run' : 'bike';
        const isRun = sport === 'run';
        const isSwim = sport === 'swim';

        const fmtDur = (sec) => {
          const s = Number(sec) || 0;
          const m = Math.floor(s / 60);
          const ss = Math.round(s % 60);
          return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        };

        const results = laps.map((lap, idx) => {
          const durationSec = Math.round(
            lap.moving_time ?? lap.elapsed_time ?? lap.duration ?? 0
          );
          const distM = Math.round(lap.distance ?? 0);
          const speed = lap.average_speed ?? 0;

          let powerValue = '';
          if (isRun || isSwim) {
            const effectiveSpeed = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);
            if (effectiveSpeed > 0.05) {
              const paceSec = isSwim ? Math.round(100 / effectiveSpeed) : Math.round(1000 / effectiveSpeed);
              powerValue = fmtDur(paceSec);
            }
          } else {
            const w = lap.average_watts ?? lap.average_power ?? 0;
            powerValue = w > 0 ? String(Math.round(w)) : '';
          }

          const isSwimRest = isSwim && distM < 10;
          return {
            interval: idx + 1,
            power: powerValue,
            heartRate: String(Math.round(lap.average_heartrate ?? lap.avg_heart_rate ?? 0) || ''),
            lactate: lap.lactate != null ? String(lap.lactate) : '',
            RPE: '',
            elevation: (() => {
              const g = lap.total_elevation_gain ?? lap.elevation_gain ?? null;
              return g != null && Number.isFinite(Number(g)) ? String(Math.round(Number(g))) : '';
            })(),
            duration: fmtDur(durationSec),
            durationSeconds: durationSec,
            durationType: 'time',
            distanceMeters: distM > 0 ? distM : undefined,
            repeatCount: 1,
            isRecovery: isSwimRest,
            isSelected: !isSwimRest,
          };
        });

        const activityDate = detail.start_date_local || detail.start_date || new Date();
        const parsedDate = new Date(activityDate);
        const dateStr = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().slice(0, 16);

        const initialData = {
          sport,
          type: 'interval',
          category: data.category || '',
          title: data.titleManual || detail.name || 'Untitled Training',
          customTitle: '',
          description: data.description || detail.description || '',
          date: dateStr,
          sourceStravaActivityId: String(detail.id || detail.stravaId || stravaNumericId),
          specifics: { specific: '', weather: '', customSpecific: '', customWeather: '' },
          results,
        };

        setStravaLactateModal({ isOpen: true, initialData });
      } catch (err) {
        setStravaLactateFormError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            err.message ||
            'Could not open lactate form'
        );
      } finally {
        setLactateActivityLoadingId(null);
      }
    },
    [integrationAthleteId]
  );

  const handleStravaLactateFormSubmit = useCallback(
    async (formData) => {
      try {
        setStravaLactateSubmitting(true);
        setStravaLactateFormError(null);
        const targetId = selectedAthleteId || user._id;
        const trainingData = { ...formData, athleteId: targetId, coachId: user._id };
        if (formData._id) {
          await updateTraining(formData._id, trainingData);
        } else {
          await addTraining(trainingData);
        }
        await loadTrainings(targetId);
        setFieldLactatePanelKey((k) => k + 1);
        closeStravaLactateModal();
      } catch (err) {
        setStravaLactateFormError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            err.message ||
            'Save failed'
        );
      } finally {
        setStravaLactateSubmitting(false);
      }
    },
    [selectedAthleteId, user, loadTrainings, closeStravaLactateModal]
  );

  const showFieldLactatePanel = ['coach', 'athlete', 'tester', 'testing'].includes(
    String(user?.role || '').toLowerCase()
  );

  // Sync selectedAthleteId when URL param :athleteId changes (e.g. CoachAthleteBar navigates)
  useEffect(() => {
    if (athleteId && athleteId !== selectedAthleteId) {
      setSelectedAthleteId(athleteId);
    } else if (!athleteId && coachLike && user?._id && selectedAthleteId !== user._id) {
      // No URL param → fall back to coach self
      setSelectedAthleteId(user._id);
    }
  }, [athleteId, user?._id, coachLike]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posluchač pro změnu atleta (z menu nebo CoachAthleteBar)
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId: newAthleteId, trainings: newTrainings } = event.detail;
      if (!newAthleteId || newAthleteId === selectedAthleteId) return;
      setSelectedAthleteId(newAthleteId);
      // If trainings were bundled with the event (legacy menu dispatch), use them directly
      if (Array.isArray(newTrainings) && newTrainings.length > 0) {
        setTrainings(newTrainings);
      }
      // Navigate so URL stays in sync (CoachAthleteBar already navigated, but legacy menu doesn't)
      navigate(`/training/${newAthleteId}`, { replace: true });
    };

    // globalAthleteChanged = CoachAthleteBar  |  athleteChanged = legacy desktop Menu
    window.addEventListener('globalAthleteChanged', handleAthleteChange);
    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => {
      window.removeEventListener('globalAthleteChanged', handleAthleteChange);
      window.removeEventListener('athleteChanged', handleAthleteChange);
    };
  }, [navigate, selectedAthleteId]);

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


  // Apply sport & category filters for all visual components
  const filteredTrainings = useMemo(() => {
    let data = trainings || [];
    if (selectedSport !== 'all') {
      data = data.filter(t => t.sport === selectedSport);
    }
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'uncategorized') {
        data = data.filter(t => !t.category);
      } else {
        data = data.filter(t => t.category === selectedCategory);
      }
    }
    return data;
  }, [trainings, selectedSport, selectedCategory]);

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
      className="mx-auto w-full max-w-[1600px] px-2 sm:px-4 py-4 md:p-6"
    >
      {/* ── HEADER ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6"
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <ListBulletIcon className="w-6 h-6 text-primary" />
            Training Log
          </h1>
          {filteredTrainings.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{filteredTrainings.length} training{filteredTrainings.length !== 1 ? 's' : ''}</p>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {/* Category filter — scrollable pills */}
          <div
            className="flex items-center gap-1.5 min-w-0"
            style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', flexShrink: 1, touchAction: 'pan-x' }}
          >
            {/* All pill */}
            <button
              onClick={() => setSelectedCategory('all')}
              style={{ touchAction: 'pan-x manipulation', WebkitTapHighlightColor: 'transparent' }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-gray-800 border-gray-800 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              All
            </button>

            {categories.map(cat => {
              const isActive = selectedCategory === cat.id;
              const style = getCategoryStyle(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(isActive ? 'all' : cat.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
                  style={isActive
                    ? { backgroundColor: cat.color, borderColor: cat.color, color: '#fff', touchAction: 'pan-x manipulation', WebkitTapHighlightColor: 'transparent' }
                    : { backgroundColor: style.backgroundColor, borderColor: style.borderColor, color: style.color, touchAction: 'pan-x manipulation', WebkitTapHighlightColor: 'transparent' }
                  }
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Add Training button — never shrinks */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1.5 h-9 px-4 bg-primary text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-60 flex-shrink-0 ml-1"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <PlusIcon className="w-4 h-4" />
            )}
            {isSubmitting ? 'Adding…' : 'Add Training'}
          </motion.button>
        </div>
      </motion.div>

      {/* Error banner */}
      {stravaLactateFormError && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span>{stravaLactateFormError}</span>
          <button
            type="button"
            onClick={() => setStravaLactateFormError(null)}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 5-COLUMN DASHBOARD GRID ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">

        {/* Row 1: Field Lactate (2 cols) + TrainingGraph (3 cols) */}
        {showFieldLactatePanel && user ? (
          <>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="lg:col-span-2 md:col-span-2 min-w-0 flex flex-col"
            >
              <FieldLactateTrainingPanel
                key={fieldLactatePanelKey}
                integrationAthleteId={integrationAthleteId}
                user={user}
                onAddLactate={handleFieldAddLactate}
                loadingActivityId={lactateActivityLoadingId}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3 md:col-span-2 min-w-0 flex flex-col"
            >
              <TrainingGraph
                trainingList={filteredTrainings}
                selectedSport={selectedSport}
                selectedTitle={selectedTitle}
                setSelectedTitle={setSelectedTitle}
                selectedTraining={selectedTraining}
                setSelectedTraining={setSelectedTraining}
              />
            </motion.div>
          </>
        ) : (
          /* No lactate panel — TrainingGraph full row */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-5 md:col-span-2 min-w-0"
          >
            <TrainingGraph
              trainingList={filteredTrainings}
              selectedSport={selectedSport}
              selectedTitle={selectedTitle}
              setSelectedTitle={setSelectedTitle}
              selectedTraining={selectedTraining}
              setSelectedTraining={setSelectedTraining}
            />
          </motion.div>
        )}

        {/* Row 2: Training Stats — full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-5 md:col-span-2 min-w-0"
        >
          <TrainingStats
            trainings={filteredTrainings}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
            isFullWidth={true}
            user={user}
          />
        </motion.div>

        {/* Row 3: Training Comparison — full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-5 md:col-span-2 min-w-0"
        >
          <Suspense fallback={
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center py-12">
              <p className="text-sm text-gray-400">Loading comparison…</p>
            </div>
          }>
            <TrainingComparison trainings={trainings} />
          </Suspense>
        </motion.div>

        {/* Row 4: Training Table — full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="lg:col-span-5 md:col-span-2 min-w-0"
        >
          <UserTrainingsTable trainings={filteredTrainings} />
        </motion.div>

      </div>

      {/* ── MODALS ── */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[1000] p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full sm:max-w-2xl"
            >
              <TrainingForm
                onClose={() => setIsFormOpen(false)}
                onSubmit={handleAddTraining}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stravaLactateModal.isOpen && stravaLactateModal.initialData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[1001] p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full sm:max-w-2xl"
            >
              <TrainingForm
                key={stravaLactateModal.initialData.sourceStravaActivityId || 'strava-lac'}
                onClose={() => {
                  closeStravaLactateModal();
                  setStravaLactateFormError(null);
                }}
                onSubmit={handleStravaLactateFormSubmit}
                initialData={stravaLactateModal.initialData}
                isEditing={false}
                isLoading={stravaLactateSubmitting}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}