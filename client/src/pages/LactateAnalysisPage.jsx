import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthProvider';
import LactateSessionForm from '../components/LactateAnalysis/LactateSessionForm';
import LactateAnalysisResults from '../components/LactateAnalysis/LactateAnalysisResults';
import api from '../services/api';

const LactateAnalysisPage = () => {
  const { user, token } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Get current user ID from auth context
  const currentUserId = user?._id || localStorage.getItem('userId') || '67ee3f1adb0943b29d8eaa53';

  useEffect(() => {
    console.log('🔄 useEffect triggered:', { user: !!user, token: !!token, currentUserId });
    if (user && token) {
      loadSessions();
    }
  }, [user, token]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading sessions for user:', currentUserId);
      const response = await api.get(`/api/lactate/athletes/${currentUserId}/sessions`);
      console.log('📊 Sessions response:', response);
      console.log('📋 Sessions data:', response.data);
      setSessions(response.data);
    } catch (err) {
      console.error('❌ Error loading sessions:', err);
      console.error('❌ Error details:', err.response?.data);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const createSession = async (sessionData) => {
    try {
      setLoading(true);
      console.log('➕ Creating session with data:', sessionData);
      const response = await api.post('/api/lactate/sessions', {
        ...sessionData,
        athleteId: currentUserId
      });
      console.log('✅ Session created:', response.data);
      setCurrentSession(response.data);
      setShowForm(false);
      await loadSessions();
    } catch (err) {
      console.error('❌ Error creating session:', err);
      console.error('❌ Error details:', err.response?.data);
      setError('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const analyzeSession = async (sessionId) => {
    try {
      setLoading(true);
      console.log('🔬 Analyzing session:', sessionId);
      const response = await api.post(`/api/lactate/sessions/${sessionId}/analyze`);
      console.log('📈 Analysis response:', response.data);
      console.log('📊 Session data:', response.data.session);
      console.log('🧮 Analysis data:', response.data.analysis);
      setCurrentSession(response.data.session);
      setAnalysis(response.data.analysis);
    } catch (err) {
      console.error('❌ Error analyzing session:', err);
      console.error('❌ Error details:', err.response?.data);
      setError('Failed to analyze session');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionAnalysis = async (sessionId) => {
    try {
      setLoading(true);
      console.log('📖 Loading session analysis:', sessionId);
      const response = await api.get(`/api/lactate/sessions/${sessionId}/analysis`);
      console.log('📚 Analysis response:', response.data);
      console.log('📊 Session data:', response.data.session);
      console.log('🧮 Analysis data:', response.data.analysis);
      setCurrentSession(response.data.session);
      setAnalysis(response.data.analysis);
    } catch (err) {
      console.error('❌ Error loading session analysis:', err);
      console.error('❌ Error details:', err.response?.data);
      setError('Failed to load session analysis');
    } finally {
      setLoading(false);
    }
  };

  const trainModel = async () => {
    try {
      setLoading(true);
      console.log('🧠 Training ML model...');
      const response = await api.post(`/api/lactate/train/${currentUserId}`, {
        sport: 'run' // Get from current session or form
      });
      console.log('✅ Model training response:', response.data);
      setError(null);
    } catch (err) {
      console.error('❌ Error training model:', err);
      console.error('❌ Error details:', err.response?.data);
      setError('Failed to train model');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!user || !token) {
    console.log('🔒 User not authenticated:', { user: !!user, token: !!token });
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-gray-400 text-6xl mb-4">🔒</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-gray-600">Please log in to access lactate analysis</p>
        </div>
      </div>
    );
  }

  if (loading) {
    console.log('⏳ Loading state active');
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  console.log('🎯 Rendering main component:', { 
    sessions: sessions.length, 
    currentSession: !!currentSession, 
    analysis: !!analysis,
    showForm,
    error 
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900">Lactate Analysis</h1>
          <p className="mt-2 text-gray-600">
            Create and analyze lactate training sessions with advanced metrics
          </p>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md"
          >
            {error}
          </motion.div>
        )}

        {/* Session List */}
        {!currentSession && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold text-gray-800">Training Sessions</h2>
              <div className="flex space-x-4">
                <button
                  onClick={trainModel}
                  className="bg-purple-500 text-white px-4 py-2 rounded-md hover:bg-purple-600 transition-colors"
                >
                  Train ML Model
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                >
                  Create New Session
                </button>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
                <p className="text-gray-600 mb-4">Create your first lactate training session to get started</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-500 text-white px-6 py-3 rounded-md hover:bg-blue-600 transition-colors"
                >
                  Create Session
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessions.map((session) => (
                  <motion.div
                    key={session._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
                    onClick={() => loadSessionAnalysis(session._id)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                        {session.sport}
                      </span>
                      <span className="text-sm text-gray-500">
                        {session.intervals.length} intervals
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {formatDate(session.startTime)}
                    </h3>
                    
                    <div className="space-y-2 text-sm text-gray-600">
                      {session.envTempC && (
                        <div>Temperature: {session.envTempC}°C</div>
                      )}
                      {session.altitudeM && (
                        <div>Altitude: {session.altitudeM}m</div>
                      )}
                      {session.overallMetrics && (
                        <div className="pt-2 border-t">
                          <div>Avg dLa/dt: {session.overallMetrics.avgDLADt?.toFixed(2)} mmol/L/min</div>
                          <div>Avg t½: {session.overallMetrics.avgTHalf ? 
                            `${Math.floor(session.overallMetrics.avgTHalf / 60)}:${Math.floor(session.overallMetrics.avgTHalf % 60).toString().padStart(2, '0')}` : 'N/A'}</div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          loadSessionAnalysis(session._id);
                        }}
                        className="flex-1 bg-blue-500 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-600 transition-colors"
                      >
                        View Analysis
                      </button>
                      {!session.overallMetrics && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            analyzeSession(session._id);
                          }}
                          className="flex-1 bg-green-500 text-white px-3 py-2 rounded-md text-sm hover:bg-green-600 transition-colors"
                        >
                          Analyze
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Session Form */}
        {showForm && (
          <LactateSessionForm
            onSubmit={createSession}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Analysis Results */}
        {currentSession && analysis && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-800">Session Analysis</h2>
              <button
                onClick={() => {
                  setCurrentSession(null);
                  setAnalysis(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Back to Sessions
              </button>
            </div>
            <LactateAnalysisResults session={currentSession} analysis={analysis} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LactateAnalysisPage;
