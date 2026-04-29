import React, { useState } from 'react';
import Modal from '../Modal';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { usePremium } from '../../hooks/usePremium';
import UpgradeModal from '../UpgradeModal';

const AddAthleteAndTestModal = ({ isOpen, onClose, onAthleteCreated, athleteCount = 0 }) => {
  const { addNotification } = useNotification();
  const { isPremium, gate, UpgradeModalProps } = usePremium();
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
    specialization: '',
    gender: 'male'
  });

  const handleAthleteInputChange = (e) => {
    const { name, value } = e.target;
    setAthleteData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateAthlete = async () => {
    if (!athleteData.name || !athleteData.surname) {
      addNotification('Name and surname are required', 'error');
      return;
    }

    // ── Premium gate: free plan allows only 1 athlete ──────────────────────
    if (!isPremium && athleteCount >= 1) {
      gate('Multiple Athletes', 'coach');
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
      setLoading(true);
      const response = await api.post('/user/coach/add-athlete', athleteData);
      const athleteId = response.data.athlete?._id || response.data._id;
      const athlete = response.data.athlete || response.data;

      addNotification('Athlete created successfully!', 'success');

      setTimeout(() => {
        try {
          const event = new CustomEvent('athleteListUpdated', {
            detail: { athlete, athleteId },
            bubbles: true
          });
          window.dispatchEvent(event);
          window.dispatchEvent(new CustomEvent('coachAthletesUpdated', { detail: { athlete, athleteId } }));
        } catch (e) {
          console.warn('Failed to dispatch athleteListUpdated event', e);
        }
      }, 10);

      setTimeout(() => {
        if (onAthleteCreated) onAthleteCreated(athleteId, athlete);
      }, 200);

      setTimeout(() => handleClose(), 150);
    } catch (error) {
      console.error('Error creating athlete:', error);
      addNotification(error.response?.data?.error || 'Failed to create athlete', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAthleteData({
      name: '', surname: '', email: '', dateOfBirth: '', phone: '',
      address: '', height: '', weight: '', sport: '', specialization: '', gender: 'male'
    });
    onClose();
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <>
    <UpgradeModal {...UpgradeModalProps} />
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Athlete">
      <div className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 sm:p-4 sm:text-sm">
          After creating the athlete you can immediately create a test for them using the normal test form.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Name *</label>
            <input
              type="text"
              name="name"
              value={athleteData.name}
              onChange={handleAthleteInputChange}
              className={inputClass}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Surname *</label>
            <input
              type="text"
              name="surname"
              value={athleteData.surname}
              onChange={handleAthleteInputChange}
              className={inputClass}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              value={athleteData.email}
              onChange={handleAthleteInputChange}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Date of Birth</label>
            <input
              type="date"
              name="dateOfBirth"
              value={athleteData.dateOfBirth}
              onChange={handleAthleteInputChange}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Phone</label>
            <input
              type="tel"
              name="phone"
              value={athleteData.phone}
              onChange={handleAthleteInputChange}
              className={inputClass}
              placeholder="+420 123 456 789"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Address</label>
            <input
              type="text"
              name="address"
              value={athleteData.address}
              onChange={handleAthleteInputChange}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Height (cm)</label>
            <input
              type="number"
              name="height"
              value={athleteData.height}
              onChange={handleAthleteInputChange}
              className={inputClass}
              placeholder="175"
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Weight (kg)</label>
            <input
              type="number"
              name="weight"
              value={athleteData.weight}
              onChange={handleAthleteInputChange}
              className={inputClass}
              placeholder="70"
              min="0"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Sport</label>
            <select
              name="sport"
              value={athleteData.sport}
              onChange={handleAthleteInputChange}
              className={inputClass}
            >
              <option value="">Select sport</option>
              <option value="run">Running</option>
              <option value="bike">Cycling</option>
              <option value="swim">Swimming</option>
              <option value="triathlon">Triathlon</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Gender</label>
            <select
              name="gender"
              value={athleteData.gender}
              onChange={handleAthleteInputChange}
              className={inputClass}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700">Specialization</label>
            <input
              type="text"
              name="specialization"
              value={athleteData.specialization}
              onChange={handleAthleteInputChange}
              className={inputClass}
              placeholder="e.g. Long distance, Sprint..."
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:justify-end sm:gap-3 sm:pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 sm:w-auto sm:px-6 sm:py-3"
            style={{ touchAction: 'manipulation' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateAthlete}
            disabled={loading || !athleteData.name || !athleteData.surname}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-primary-dark hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6 sm:py-3"
            style={{ touchAction: 'manipulation' }}
          >
            {loading ? 'Creating…' : 'Create Athlete'}
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
};

export default AddAthleteAndTestModal;
