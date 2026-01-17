import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

const AddAthleteAndTestModal = ({ isOpen, onClose, onAthleteCreated }) => {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [athleteData, setAthleteData] = useState({
    name: '',
    surname: '',
    email: '',
    dateOfBirth: '',
    phone: '',
    address: '',
    height: '',
    weight: '',
    sport: '',
    specialization: ''
  });

  const handleAthleteInputChange = (e) => {
    const { name, value } = e.target;
    setAthleteData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateAthlete = async () => {
    if (!athleteData.name || !athleteData.surname) {
      addNotification('Name and surname are required', 'error');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/user/coach/add-athlete', athleteData);
      const athleteId = response.data.athlete?._id || response.data._id;
      const athlete = response.data.athlete || response.data;
      
      addNotification('Athlete created successfully!', 'success');
      
      // Reset form
      handleClose();
      
      // Notify parent component
      if (onAthleteCreated) {
        onAthleteCreated(athleteId, athlete);
      }
    } catch (error) {
      console.error('Error creating athlete:', error);
      addNotification(
        error.response?.data?.error || 'Failed to create athlete',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAthleteData({
      name: '',
      surname: '',
      email: '',
      dateOfBirth: '',
      phone: '',
      address: '',
      height: '',
      weight: '',
      sport: '',
      specialization: ''
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-semibold text-gray-900">
              Add New Athlete
            </h2>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                After creating the athlete, you'll be able to create a test for them using the normal test form.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={athleteData.name}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Surname *
                  </label>
                  <input
                    type="text"
                    name="surname"
                    value={athleteData.surname}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={athleteData.email}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={athleteData.dateOfBirth}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={athleteData.phone}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={athleteData.address}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    name="height"
                    value={athleteData.height}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    name="weight"
                    value={athleteData.weight}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sport
                  </label>
                  <select
                    name="sport"
                    value={athleteData.sport}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select sport</option>
                    <option value="run">Running</option>
                    <option value="bike">Cycling</option>
                    <option value="swim">Swimming</option>
                    <option value="triathlon">Triathlon</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Specialization
                  </label>
                  <input
                    type="text"
                    name="specialization"
                    value={athleteData.specialization}
                    onChange={handleAthleteInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAthlete}
                  disabled={loading || !athleteData.name || !athleteData.surname}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Athlete'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddAthleteAndTestModal;
