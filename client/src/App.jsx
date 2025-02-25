import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthProvider';
import Layout from "./components/Layout";
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/DashboardPage';
import Testing from './pages/TestingPage';
import Training from './pages/TrainingPage';
import Athletes from './pages/AthletesPage';
import Profile from './pages/ProfilePage';
import Settings from './pages/SettingsPage';
import Support from './pages/SupportPage';
import SignUpPage from './pages/SignUpPage';

// Komponenta pro chráněné routy
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
};

// Komponenta pro veřejné routy (např. login)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Přesměrování z root na dashboard nebo login */}
      <Route 
        path="/" 
        element={<Navigate to="/dashboard" replace />} 
      />
      
      {/* Veřejné routy */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
        <Route
            path="/signup"
            element={
              <PublicRoute>
                <SignUpPage />
              </PublicRoute>
            }
          />
      {/* Chráněné routy */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
              <Route path="/dashboard/:athleteId" element={<Dashboard />} />

      <Route
        path="/testing"
        element={
          <ProtectedRoute>
            <Testing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/training"
        element={
          <ProtectedRoute>
            <Training />
          </ProtectedRoute>
        }
      />
      <Route
        path="/athletes"
        element={
          <ProtectedRoute>
            <Athletes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <Support />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App; 