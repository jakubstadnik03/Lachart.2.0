import React, { useState } from 'react';
import Modal from '../Modal';
import { API_ENDPOINTS } from '../../config/api.config';
import { useNotification } from '../../context/NotificationContext';

const ChangePasswordModal = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validate passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password length
    if (formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.CHANGE_PASSWORD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        addNotification('Password changed successfully', 'success');
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        onClose();
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Failed to change password. Please try again.');
      console.error('Password change error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password">
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600 sm:text-sm">
            {error}
          </div>
        )}

        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700">Current Password</label>
          <input
            type="password"
            value={formData.currentPassword}
            onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
            className="mt-1 min-w-0 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary sm:px-4 sm:py-3"
            required
          />
        </div>

        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700">New Password</label>
          <input
            type="password"
            value={formData.newPassword}
            onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
            className="mt-1 min-w-0 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary sm:px-4 sm:py-3"
            required
            minLength={6}
          />
        </div>

        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
            className="mt-1 min-w-0 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary sm:px-4 sm:py-3"
            required
            minLength={6}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3 sm:pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 sm:w-auto"
            disabled={isLoading}
          >
            {isLoading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal; 