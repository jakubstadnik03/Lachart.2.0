import React, { useState, useMemo } from 'react';
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
import TrainingHistory from './components/TrainingHistory';
import AcceptCoachInvitation from './pages/AcceptCoachInvitation';
import TestingWithoutLogin from './pages/TestingWithoutLogin';
import About from './pages/About';
import Documentation from './pages/Documentation';
import { Analytics } from "@vercel/analytics/react"
import './App.css';

function AppRoutes() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  // Memoize the Layout component to prevent unnecessary re-renders
  const LayoutWithProps = useMemo(() => (
    <Layout isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
  ), [isMenuOpen]);

  return (
    <Routes>
      {/* Veřejné routy */}
      <Route path="/" element={<About />} />
      <Route path="/about" element={<About />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/testing-without-login" element={<TestingWithoutLogin />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/complete-registration/:token" element={<CompleteRegistrationPage />} />
      <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />
      <Route path="/accept-coach-invitation/:token" element={<AcceptCoachInvitation />} />
      <Route path="/documentation" element={<Documentation />} />

      {/* Chráněné routy s Layoutem */}
      <Route
        element={
          <ProtectedRoute>
            {LayoutWithProps}
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

      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  // Memoize the GoogleOAuthProvider configuration
  const googleOAuthConfig = useMemo(() => ({
    clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
    onScriptLoadError: () => console.error('Failed to load Google OAuth script'),
    onScriptLoadSuccess: () => console.log('Google OAuth script loaded successfully'),
    auto_select: false,
    cancel_on_tap_outside: true,
    useOneTap: false,
    nonce: crypto.randomUUID()
  }), []);

  return (
    <Router>
      <GoogleOAuthProvider {...googleOAuthConfig}>
        <NotificationProvider>
          <AuthProvider>
            <TrainingProvider>
              <AppRoutes />
              <Analytics />

            </TrainingProvider>
          </AuthProvider>
        </NotificationProvider>
      </GoogleOAuthProvider>
    </Router>
  );
}

export default App; 