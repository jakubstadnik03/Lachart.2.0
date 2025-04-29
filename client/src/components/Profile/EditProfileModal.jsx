import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

const EditProfileModal = ({ isOpen, onClose, onSubmit, userData }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      console.log('Formatting date for input:', dateString);
      
      // Pokud je datum ve formátu DD.MM.YY
      if (dateString.includes('.')) {
        const [day, month, year] = dateString.split('.');
        // Přidáme 20 před rok, pokud je rok ve formátu YY
        const fullYear = year.length === 2 ? `20${year}` : year;
        const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (isNaN(date.getTime())) return ''; // Invalid date
        return date.toISOString().split('T')[0];
      }
      
      // Pro ostatní formáty
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return ''; // Invalid date
      
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      
      const formattedDate = `${year}-${month}-${day}`;
      console.log('Formatted date for input:', formattedDate);
      return formattedDate;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const parseDateForSubmit = (dateString) => {
    if (!dateString) return '';
    try {
      console.log('Parsing date for submit:', dateString);
      // Vytvoříme datum s časem nastaveným na půlnoc UTC
      const date = new Date(dateString + 'T00:00:00.000Z');
      if (isNaN(date.getTime())) return ''; // Invalid date
      
      const isoDate = date.toISOString();
      console.log('Parsed date for submit:', isoDate);
      return isoDate;
    } catch (error) {
      console.error('Error parsing date:', error);
      return '';
    }
  };

  useEffect(() => {
    if (userData) {
      try {
        console.log('Initial userData:', userData);
        const initialFormData = {
          name: userData.name || '',
          dateOfBirth: formatDateForInput(userData.dateOfBirth),
          address: userData.address || '',
          phone: userData.phone || '',
          height: userData.height || '',
          weight: userData.weight || '',
          sport: userData.sport || '',
          specialization: userData.specialization || '',
          bio: userData.bio || ''
        };
        console.log('Initial formData:', initialFormData);
        setFormData(initialFormData);
      } catch (error) {
        console.error('Error setting form data:', error);
        setFormData({
          name: userData.name || '',
          dateOfBirth: '',
          address: userData.address || '',
          phone: userData.phone || '',
          height: userData.height || '',
          weight: userData.weight || '',
          sport: userData.sport || '',
          specialization: userData.specialization || '',
          bio: userData.bio || ''
        });
      }
    }
  }, [userData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // Základní validace
    if (!formData.name?.trim()) {
      setError('Name is required');
      return;
    }

    // Převedení data zpět do ISO formátu před odesláním
    const dataToSubmit = {
      ...formData,
      dateOfBirth: parseDateForSubmit(formData.dateOfBirth)
    };

    console.log('Submitting form data:', dataToSubmit);
    onSubmit(dataToSubmit);
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    console.log('Date changed:', newDate);
    setFormData(prev => ({ ...prev, dateOfBirth: newDate }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
            <input
              type="date"
              value={formData.dateOfBirth || ''}
              onChange={handleDateChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Address</label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Height (cm)</label>
            <input
              type="number"
              value={formData.height || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
            <input
              type="number"
              value={formData.weight || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Sport</label>
            <select
              value={formData.sport || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, sport: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            >
              <option value="triathlon">Triathlon</option>
              <option value="cycling">Cycling</option>
              <option value="running">Running</option>
              <option value="swimming">Swimming</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Specialization</label>
            <input
              type="text"
              value={formData.specialization || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Bio</label>
            <textarea
              value={formData.bio || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark"
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditProfileModal; 