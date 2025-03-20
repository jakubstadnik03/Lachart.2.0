import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
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

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Veřejné routy */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

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
            <Route path="/training" element={<Training />} />
            <Route path="/testing" element={<Testing />} />
            <Route path="/athletes" element={<Athletes />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support" element={<Support />} />
            <Route path="/athlete-profile/:id" element={<Profile />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route 
            path="/athlete/:athleteId" 
            element={
              <ProtectedRoute allowedRoles={['coach']}>
                <AthleteProfile />
              </ProtectedRoute>
            } 
          />
          <Route path="/dashboard/:athleteId?" element={<Dashboard />} />
          <Route path="/training/:athleteId?" element={<Training />} />
          <Route path="/testing/:athleteId?" element={<Testing />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App; 