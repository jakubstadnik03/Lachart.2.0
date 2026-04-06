import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

const UnitsPreferencesModal = ({ isOpen, onClose, onSubmit, userData }) => {
  const [units, setUnits] = useState({
    distance: 'metric',
    weight: 'kg',
    temperature: 'celsius',
  });

  useEffect(() => {
    if (userData?.units) {
      setUnits({
        distance: userData.units.distance || 'metric',
        weight: userData.units.weight || 'kg',
        temperature: userData.units.temperature || 'celsius',
      });
    }
  }, [userData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ units });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Units Preferences">
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <p className="mb-3 text-xs leading-relaxed text-gray-600 sm:mb-4 sm:text-sm">
          Choose your preferred units for distance, weight, and temperature.
        </p>

        <div className="grid grid-cols-1 gap-4 min-w-0 md:grid-cols-3 md:gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Distance</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="distance"
                  value="metric"
                  checked={units.distance === 'metric'}
                  onChange={(e) => setUnits(prev => ({ ...prev, distance: e.target.value }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Metric (km, m)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="distance"
                  value="imperial"
                  checked={units.distance === 'imperial'}
                  onChange={(e) => setUnits(prev => ({ ...prev, distance: e.target.value }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Imperial (miles, feet)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Weight</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="weight"
                  value="kg"
                  checked={units.weight === 'kg'}
                  onChange={(e) => setUnits(prev => ({ ...prev, weight: e.target.value }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Kilograms (kg)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="weight"
                  value="lbs"
                  checked={units.weight === 'lbs'}
                  onChange={(e) => setUnits(prev => ({ ...prev, weight: e.target.value }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Pounds (lbs)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Temperature</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="temperature"
                  value="celsius"
                  checked={units.temperature === 'celsius'}
                  onChange={(e) => setUnits(prev => ({ ...prev, temperature: e.target.value }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Celsius (°C)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="temperature"
                  value="fahrenheit"
                  checked={units.temperature === 'fahrenheit'}
                  onChange={(e) => setUnits(prev => ({ ...prev, temperature: e.target.value }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Fahrenheit (°F)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:justify-end sm:gap-3 sm:pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 sm:w-auto sm:px-6 sm:py-3"
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-primary-dark hover:shadow-lg sm:w-auto sm:px-6 sm:py-3"
          >
            Continue
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default UnitsPreferencesModal;
