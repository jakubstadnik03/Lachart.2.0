import React, { useEffect, useState } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingForm from '../components/TrainingForm';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { getTrainingsByAthleteId, addTraining } from '../services/api';
import { useParams } from 'react-router-dom';
import AthleteSelector from '../components/AthleteSelector';

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
  const { user } = useAuth();

  // Přidáme debug log pro user objekt
  console.log('Current user:', user);

  // Načtení tréninků
  useEffect(() => {
    if (user?._id) {
      loadTrainings();
    }
  }, [user?._id]);

  // Funkce pro načtení tréninků
  const loadTrainings = async () => {
    try {
      setLoading(true);
      setError(null);
      const targetId = selectedAthleteId || user._id;
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

  // Funkce pro přidání nového tréninku
  const handleAddTraining = async (formData) => {
    try {
      console.log('Auth user:', user); // Debug log pro user v momentě submitu
      
      if (!user?._id) {
        console.log('User ID missing, full user object:', user); // Debug log pro chybějící ID
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

      console.log('Sending training data:', trainingData); // Uvidíme finální data

      // Použití importované addTraining funkce
      const response = await addTraining(trainingData);
      console.log('Training created:', response.data);

      // Aktualizace lokálního stavu
      await loadTrainings();

      // Nastavení nově přidaného tréninku jako vybraného
      setSelectedSport(response.data.sport);
      setSelectedTitle(response.data.title);
      setSelectedTraining(response.data._id);

      // Zavření formuláře
      setIsFormOpen(false);

      // Zobrazení úspěšné zprávy
      alert('Training successfully added!');

    } catch (err) {
      console.error('Error adding training:', err);
      console.log('Full error object:', err); // Debug log pro celý error objekt
      setError(err.response?.data?.message || 'Failed to add training');
      alert('Failed to add training: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
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
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
    </div>
  );

  if (error) return (
    <div className="p-6 text-red-600">
      {error}
    </div>
  );

  return (
    <div className="py-2 md:p-6 max-w-[1600px] mx-auto">
      {user?.role === 'coach' && (
        <AthleteSelector
          selectedAthleteId={selectedAthleteId}
          onAthleteChange={setSelectedAthleteId}
        />
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Training Log</h1>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
        >
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
          Add Training
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SpiderChart 
          trainings={trainings}
          selectedSport={selectedSport}
        />
        <TrainingGraph 
          trainingList={trainings}
          selectedSport={selectedSport}
          selectedTitle={selectedTitle}
          setSelectedTitle={setSelectedTitle}
          selectedTraining={selectedTraining}
          setSelectedTraining={setSelectedTraining}
        />
      </div>

      <UserTrainingsTable trainings={trainings} />

      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="relative">
              <TrainingForm 
                onClose={() => setIsFormOpen(false)} 
                onSubmit={handleAddTraining}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingPage;