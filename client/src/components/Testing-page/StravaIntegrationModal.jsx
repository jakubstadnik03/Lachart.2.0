import React, { useState } from 'react';
import Modal from '../Modal';
import { getStravaAuthUrl } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

const StravaIntegrationModal = ({ isOpen, onClose }) => {
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect Strava for Smart Test Recommendations">
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <img src="/icon/strava.png" alt="Strava" className="w-6 h-6" />
          </div>
          <p className="text-sm text-gray-600">
            By connecting your Strava account, LaChart can analyze your training data and provide personalized lactate test recommendations.
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
          <h4 className="text-base font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <span className="text-xl">🎯</span>
            What you'll get:
          </h4>
          <ul className="text-sm text-blue-800 space-y-2.5">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span><strong>HR-First Test Plan:</strong> Automatic calculation of recommended lactate test protocol based on your recent Strava activities with heart rate data</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span><strong>Personalized Thresholds:</strong> Estimated LT1 and LT2 heart rate zones from your training history</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span><strong>Test Protocol Steps:</strong> Detailed stage-by-stage recommendations with target heart rate, pace, and power for each test stage</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span><strong>Performance Tracking:</strong> Compare your test results with your training data to track improvements over time</span>
            </li>
          </ul>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">How it works:</h4>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
            <li>Connect your Strava account (one-time setup)</li>
            <li>LaChart analyzes your recent activities with heart rate data</li>
            <li>Get personalized test recommendations with specific HR zones and pacing</li>
            <li>Follow the recommended protocol during your lactate test</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-orange-600 rounded-xl hover:bg-orange-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <img src="/icon/strava.png" alt="Strava" className="w-4 h-4" />
                Connect Strava
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default StravaIntegrationModal;
