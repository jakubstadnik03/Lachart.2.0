import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthProvider';
import { NotificationProvider } from './context/NotificationContext';
import { TrainingProvider } from './context/TrainingContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/DashboardPage';
import Testing from './pages/TestingPage';
import Training from './pages/TrainingPage';
import Athletes from './pages/AthletesPage';
import Profile from './pages/ProfilePage';
import Settings from './pages/SettingsPage';
import Support from './pages/SupportPage';
import SignUpPage from './pages/SignUpPage';
import ProtectedRoute from './components/ProtectedRoute';
import AthleteProfile from './components/AthleteProfile';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import CompleteRegistrationPage from './pages/CompleteRegistrationPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import TrainingDetailPage from './pages/TrainingDetailPage';
import { useAuth } from './context/AuthProvider';
import TrainingHistory from './components/TrainingHistory';
import './App.css';

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  return (
    <Router>
      <GoogleOAuthProvider 
        clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}
        onScriptLoadError={() => console.error('Failed to load Google OAuth script')}
        onScriptLoadSuccess={() => console.log('Google OAuth script loaded successfully')}
        auto_select={false}
        cancel_on_tap_outside={true}
        useOneTap={false}
        nonce={crypto.randomUUID()}
      >
        <NotificationProvider>
          <AuthProvider>
            <TrainingProvider>
              <Routes>
                {/* Veřejné routy */}
                <Route path="/" element={<LoginPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                <Route path="/complete-registration/:token" element={<CompleteRegistrationPage />} />
                <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />

                {/* Chráněné routy s Layoutem */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/:athleteId" element={<Profile />} />
                  <Route path="/training-comparison/:title" element={<TrainingDetailPage />} />
                  <Route path="/training" element={<Training />} />
                  <Route path="/testing" element={<Testing />} />
                  <Route path="/athletes" element={<Athletes />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/athlete-profile/:id" element={<Profile />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard/:athleteId?" element={<Dashboard />} />
                  <Route path="/training/:athleteId?" element={<Training />} />
                  <Route path="/testing/:athleteId?" element={<Testing />} />
                  <Route 
                    path="/athlete/:athleteId" 
                    element={
                      <ProtectedRoute allowedRoles={['coach']}>
                        <AthleteProfile />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/training-history/:title" element={<TrainingHistory />} />
                </Route>
              </Routes>
            </TrainingProvider>
          </AuthProvider>
        </NotificationProvider>
      </GoogleOAuthProvider>
    </Router>
  );
}

export default App; 