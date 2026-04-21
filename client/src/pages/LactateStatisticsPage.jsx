import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useParams } from 'react-router-dom';
import LactateStatistics from '../components/LactateStatistics/LactateStatistics';

const LactateStatisticsPage = () => {
  const { user } = useAuth();
  const { athleteId: urlAthleteId } = useParams();

  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (urlAthleteId) return urlAthleteId;
    try { return localStorage.getItem('global_selectedAthleteId') || user?._id || null; } catch { return user?._id || null; }
  });

  // Keep in sync with global athlete selection
  useEffect(() => {
    const handler = (e) => {
      const { athleteId } = e.detail || {};
      if (athleteId) setSelectedAthleteId(athleteId);
    };
    window.addEventListener('globalAthleteChanged', handler);
    return () => window.removeEventListener('globalAthleteChanged', handler);
  }, []);

  // Also react to URL param changes
  useEffect(() => {
    if (urlAthleteId) setSelectedAthleteId(urlAthleteId);
  }, [urlAthleteId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 md:mb-8">Lactate Statistics</h1>
        <LactateStatistics selectedAthleteId={selectedAthleteId} />
      </div>
    </div>
  );
};

export default LactateStatisticsPage;
