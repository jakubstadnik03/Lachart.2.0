import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

const BasicProfileModal = ({ isOpen, onClose, onSubmit, userData }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (userData) {
      const initialFormData = {
        name: userData.name || '',
        dateOfBirth: userData.dateOfBirth ? formatDateForInput(userData.dateOfBirth) : '',
        address: userData.address || '',
        phone: userData.phone || '',
        height: userData.height || '',
        weight: userData.weight || '',
        sport: userData.sport || '',
        specialization: userData.specialization || '',
        bio: userData.bio || '',
      };
      setFormData(initialFormData);
    }
  }, [userData]);

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      if (typeof dateString === 'string' && dateString.includes('.')) {
        const [day, month, year] = dateString.split('.');
        const fullYear = year && year.length === 2 ? `20${year}` : year;
        if (!fullYear || !month || !day) return '';
        const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const parseDateForSubmit = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString + 'T00:00:00.000Z');
      if (isNaN(date.getTime())) return '';
      return date.toISOString();
    } catch (error) {
      console.error('Error parsing date:', error);
      return '';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name?.trim()) {
      setError('Name is required');
      return;
    }

    const dataToSubmit = {
      ...formData,
      dateOfBirth: parseDateForSubmit(formData.dateOfBirth),
    };

    onSubmit(dataToSubmit);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Your Profile">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <p className="text-sm text-gray-600 mb-4">
          Let's start by completing your basic profile information.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Date of Birth *</label>
            <input
              type="date"
              value={formData.dateOfBirth || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Address</label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Enter your address"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Phone</label>
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="+420 123 456 789"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Height (cm)</label>
            <input
              type="number"
              value={formData.height || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="175"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Weight (kg)</label>
            <input
              type="number"
              value={formData.weight || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="70"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Sport *</label>
            <select
              value={formData.sport || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, sport: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              required
            >
              <option value="">Select sport</option>
              <option value="triathlon">Triathlon</option>
              <option value="cycling">Cycling</option>
              <option value="running">Running</option>
              <option value="swimming">Swimming</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Specialization</label>
            <input
              type="text"
              value={formData.specialization || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="e.g. Long distance, Sprint..."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700">Bio</label>
            <textarea
              value={formData.bio || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
              placeholder="Tell us about yourself..."
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="px-6 py-3 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-dark shadow-md hover:shadow-lg transition-all"
          >
            Continue
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default BasicProfileModal;
