import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';

const AcceptInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invitationData, setInvitationData] = useState(null);

  useEffect(() => {
    const verifyInvitation = async () => {
      try {
        const response = await api.get(`/user/verify-invitation-token/${token}`);
        setInvitationData(response.data);
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
          <div className="text-red-500 text-xl mb-4">Chyba</div>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Přejít na přihlášení
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-white p-8 rounded-3xl shadow-sm max-w-md w-full">
        <h2 className="text-2xl font-bold text-center mb-6">Přijmout pozvánku do týmu</h2>
        
        <div className="text-center mb-6">
          <p className="text-gray-600">
            Byli jste pozváni do týmu trenéra.
          </p>
          <p className="text-gray-600 mt-2">
            Pro přijetí pozvánky klikněte na tlačítko níže.
          </p>
        </div>

        <button
          onClick={handleAcceptInvitation}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Přijmout pozvánku
        </button>
      </div>
    </div>
  );
};

export default AcceptInvitationPage; 