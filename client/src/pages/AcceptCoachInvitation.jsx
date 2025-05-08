import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS } from '../config/api.config';

const AcceptCoachInvitation = () => {
    let { token } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [coachInfo, setCoachInfo] = useState(null);

    // Fallback: pokud token není v useParams, zkusit jej získat z localStorage
    if (!token) {
        token = localStorage.getItem('pendingInvitationToken');
        if (!token) {
            setError('Chybí token pozvánky');
            setLoading(false);
        }
    }

    useEffect(() => {
        // If not authenticated, store the token and redirect to login
        if (!isAuthenticated) {
            console.log('User not authenticated, storing invitation token and redirecting to login');
            if (token) {
                localStorage.setItem('pendingInvitationToken', token);
            }
            navigate('/login', { state: { from: `/accept-coach-invitation/${token}` } });
            return;
        }

        // If authenticated, try to get token from URL params or localStorage
        const invitationToken = token || localStorage.getItem('pendingInvitationToken');
        if (!invitationToken) {
            setError('Chybí token pozvánky');
            setLoading(false);
            return;
        }

        const verifyInvitation = async () => {
            try {
                const authToken = localStorage.getItem('token');
                if (!authToken) {
                    throw new Error('Chybí autorizační token');
                }

                console.log('Verifying invitation with token:', invitationToken);
                console.log('Using auth token:', authToken);
                
                const verifyUrl = API_ENDPOINTS.VERIFY_COACH_INVITATION(invitationToken);
                console.log('API endpoint:', verifyUrl);

                const response = await fetch(verifyUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });

                console.log('Response status:', response.status);
                console.log('Response headers:', response.headers);

                if (!response.ok) {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Chyba při ověřování pozvánky');
                    } else {
                        const text = await response.text();
                        console.error('Server response:', text);
                        throw new Error('Chyba při ověřování pozvánky - server vrátil neplatnou odpověď');
                    }
                }

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error('Server response:', text);
                    throw new Error('Chyba při ověřování pozvánky - server vrátil neplatnou odpověď');
                }

                const data = await response.json();
                console.log('Received data:', data);
                setCoachInfo(data.coach);
                // Only remove the token after successful verification
                localStorage.removeItem('pendingInvitationToken');
                setLoading(false);
            } catch (error) {
                console.error('Error verifying invitation:', error);
                setError(error.message);
                setLoading(false);
            }
        };

        if (invitationToken) {
            verifyInvitation();
        } else {
            setError('Chybí token pozvánky');
            setLoading(false);
        }
    }, [token, isAuthenticated, navigate]);

    const handleAcceptInvitation = async () => {
        try {
            setLoading(true);
            const authToken = localStorage.getItem('token');
            if (!authToken) {
                throw new Error('Chybí autorizační token');
            }

            const invitationToken = token || localStorage.getItem('pendingInvitationToken');
            if (!invitationToken) {
                throw new Error('Chybí token pozvánky');
            }

            const acceptUrl = API_ENDPOINTS.ACCEPT_COACH_INVITATION(invitationToken);
            console.log('Accepting invitation at:', acceptUrl);

            const response = await fetch(acceptUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Chyba při přijímání pozvánky');
                } else {
                    const text = await response.text();
                    console.error('Server response:', text);
                    throw new Error('Chyba při přijímání pozvánky - server vrátil neplatnou odpověď');
                }
            }

            addNotification('Pozvánka byla úspěšně přijata', 'success');
            navigate('/dashboard');
        } catch (error) {
            console.error('Error accepting invitation:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        navigate('/dashboard');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Athlete Invitation</h2>
                    <p className="mt-2 text-gray-600">
                        An athlete has invited you to be their coach in LaChart.
                    </p>
                    {coachInfo && (
                        <div className="mt-4 p-4 bg-gray-50 rounded">
                            <p className="text-sm text-gray-500">Invitation expires in 7 days</p>
                        </div>
                    )}
                </div>

                <div className="mt-8 space-y-4">
                    <button
                        onClick={handleAcceptInvitation}
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        {loading ? 'Accepting...' : 'Accept Invitation'}
                    </button>
                    <button
                        onClick={handleCancel}
                        className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AcceptCoachInvitation;