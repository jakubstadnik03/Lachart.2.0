import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import SpiderChart from './DashboardPage/SpiderChart';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api.config';

export default function AthleteProfile() {
  const { athleteId } = useParams();
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedSport, setSelectedSport] = useState('run');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Načtení všech dat paralelně
        const [athleteData, trainingsData, testsData] = await Promise.all([
          api.get(`/user/athlete/${athleteId}`),
          api.get(`/user/athlete/${athleteId}/trainings`),
          api.get(`/user/athlete/${athleteId}/tests`)
        ]);

        setAthlete(athleteData.data);
        setTrainings(trainingsData.data);
        setTests(testsData.data);
      } catch (error) {
        console.error('Error fetching athlete data:', error);
        setError(error.message || 'Failed to load athlete data');
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'coach' && athleteId) {
      fetchAthleteData();
    }
  }, [athleteId, user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen text-red-600">
        {error}
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="flex justify-center items-center h-screen">
        No athlete data available
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="relative">
          {/* Header s pozadím */}
          <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-50" />
          
          {/* Avatar a základní info */}
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end -mt-16 mb-4 gap-4">
              <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-white mx-auto sm:mx-0">
                <img
                  src={athlete.avatar || '/images/triathlete-avatar.jpg'}
                  alt={athlete.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-center sm:text-left sm:ml-4">
                <h1 className="text-2xl font-bold">{`${athlete.name} ${athlete.surname}`}</h1>
                <p className="text-gray-600">{athlete.email}</p>
              </div>
            </div>

            {/* Detailní informace */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-white rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">Training Overview</h2>
                <SpiderChart
                  trainings={trainings}
                  selectedSport={selectedSport}
                />
              </div>

              <div className="bg-white rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">Tests Overview</h2>
                {/* Zde můžete přidat komponentu pro zobrazení testů */}
              </div>
            </div>

            {/* Tabulka tréninků */}
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4">Recent Trainings</h2>
              {/* Zde můžete přidat komponentu pro zobrazení tréninků */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}