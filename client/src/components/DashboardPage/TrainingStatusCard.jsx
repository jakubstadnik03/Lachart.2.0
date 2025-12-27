import React, { useState, useEffect } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { getTrainingStatus } from '../../services/api';
import TrainingGlossary from './TrainingGlossary';

const TrainingStatusCard = ({ athleteId }) => {
  const [showGlossary, setShowGlossary] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState({
    status: 'Maintaining',
    statusText: 'Maintaining',
    statusColor: 'bg-blue-500',
    weeklyTSS: 0,
    optimalMin: 0,
    optimalMax: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!athleteId) return;
      try {
        setLoading(true);
        const response = await getTrainingStatus(athleteId);
        if (response && response.data) {
          setTrainingStatus(response.data);
        }
      } catch (error) {
        console.error('Error loading training status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [athleteId]);

  return (
    <>
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Training Status</h3>
          <button
            onClick={() => setShowGlossary(true)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show explanation"
          >
            <InformationCircleIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${trainingStatus.statusColor}`}></div>
            <span className="text-lg font-semibold text-gray-900">{trainingStatus.statusText}</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Training Status"
      />
    </>
  );
};

export default TrainingStatusCard;

