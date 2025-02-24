import React, { useState } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingForm from '../components/TrainingForm';

const TrainingPage = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);

  return (
    <div className="px-6 max-w-[1600px] mx-auto">
      {/* Header s tlačítkem */}
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

      {/* Tabulka tréninků */}
      <UserTrainingsTable />

      {/* Modální okno s formulářem */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="relative">
              {/* Tlačítko pro zavření */}
              <TrainingForm onClose={() => setIsFormOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingPage;