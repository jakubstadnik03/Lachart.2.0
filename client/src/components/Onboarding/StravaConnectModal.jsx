import React, { useState } from 'react';
import Modal from '../Modal';
import { getStravaAuthUrl } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

const StravaConnectModal = ({ isOpen, onClose, onSkip }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { addNotification } = useNotification();

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error('Strava connect error:', error);
      addNotification('Failed to start Strava connection', 'error');
      setIsConnecting(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleSkip} title="Connect Strava">
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h-5.688l2.852-5.599m5.73-2.824L12.36 0 8.611 6.372l3.747 7.38z"/>
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Connect Your Strava Account</h3>
          <p className="text-sm text-gray-600">
            Sync your activities from Strava to automatically track your training data in LaChart.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">Benefits of connecting:</h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Automatically import your training activities</li>
            <li>Track your progress over time</li>
            <li>Analyze your performance data</li>
            <li>Sync your profile picture</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
          >
            Skip for Now
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-orange-600 rounded-xl hover:bg-orange-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? 'Connecting...' : 'Connect Strava'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default StravaConnectModal;

