import React, { useState, useEffect } from 'react';
import { ArrowTrendingUpIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { getTodayMetrics } from '../../services/api';
import TrainingGlossary from './TrainingGlossary';

const TodayMetricsCards = ({ athleteId }) => {
  const [showGlossary, setShowGlossary] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('Form & Fitness');
  const [todayMetrics, setTodayMetrics] = useState({
    fitness: 0,
    fatigue: 0,
    form: 0,
    fitnessChange: 0,
    fatigueChange: 0,
    formChange: 0
  });
  useEffect(() => {
    const loadData = async () => {
      if (!athleteId) return;
      try {
        const response = await getTodayMetrics(athleteId);
        if (response && response.data) {
          setTodayMetrics(response.data);
        }
      } catch (error) {
        console.error('Error loading today metrics:', error);
      }
    };

    loadData();
  }, [athleteId]);

  const MetricCard = ({ title, value, change, changeLabel, infoKey, onInfoClick }) => {
    const isPositive = change >= 0;
    const changeColor = isPositive ? 'text-green-600' : 'text-red-600';

    return (
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg relative">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
          <button
            onClick={onInfoClick}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show explanation"
          >
            <InformationCircleIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="text-3xl font-bold text-gray-900 mb-2">{value}</div>
        {change !== 0 && (
          <div className={`flex items-center gap-1 text-sm ${changeColor}`}>
            <ArrowTrendingUpIcon 
              className={`w-4 h-4 ${isPositive ? '' : 'rotate-180'}`} 
            />
            <span>{isPositive ? '+' : ''}{change}</span>
            {changeLabel && <span className="text-gray-500 ml-1">{changeLabel}</span>}
          </div>
        )}
      </div>
    );
  };

  const handleInfoClick = (term) => {
    setSelectedTerm(term);
    setShowGlossary(true);
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Today's Fitness"
          value={todayMetrics.fitness}
          change={todayMetrics.fitnessChange}
          changeLabel="from yesterday"
          infoKey="fitness"
          onInfoClick={() => handleInfoClick('Form & Fitness')}
        />
        <MetricCard
          title="Today's Fatigue"
          value={todayMetrics.fatigue}
          change={todayMetrics.fatigueChange}
          changeLabel="from yesterday"
          infoKey="fatigue"
          onInfoClick={() => handleInfoClick('Form & Fitness')}
        />
        <MetricCard
          title="Today's Form"
          value={todayMetrics.form}
          change={todayMetrics.formChange}
          changeLabel="from yesterday"
          infoKey="form"
          onInfoClick={() => handleInfoClick('Form & Fitness')}
        />
      </div>

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm={selectedTerm}
      />
    </>
  );
};

export default TodayMetricsCards;

