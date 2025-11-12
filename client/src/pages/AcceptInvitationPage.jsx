import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const verifyInvitation = async () => {
      try {
        await api.get(`/user/verify-invitation-token/${token}`);
        setLoading(false);
      } catch (error) {
        setError(error.response?.data?.error || 'Neplatná nebo expirovaná pozvánka');
        setLoading(false);
      }
    };

    verifyInvitation();
  }, [token]);

  const handleAcceptInvitation = async () => {
    try {
      await api.post(`/user/accept-invitation/${token}`);
      alert('Pozvánka byla úspěšně přijata!');
      navigate('/dashboard');
    } catch (error) {
      setError(error.response?.data?.error || 'Chyba při přijímání pozvánky');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Načítání...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-white p-8 rounded-3xl shadow-sm max-w-md w-full">
        <h2 className="text-2xl font-bold text-center mb-6">Accept Team Invitation</h2>
        
        <div className="text-center mb-6">
          <p className="text-gray-600">
            You have been invited to join a coach's team.
          </p>
          <p className="text-gray-600 mt-2">
            Click the button below to accept the invitation.
          </p>
        </div>

        <button
          onClick={handleAcceptInvitation}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Accept Invitation
        </button>
      </div>
    </div>
  );
};

export default AcceptInvitationPage; 