import React, { useState, useMemo, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthProvider';
import { NotificationProvider } from './context/NotificationContext';
import { TrainingProvider } from './context/TrainingContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { Analytics } from "@vercel/analytics/react"
import { useLocation } from 'react-router-dom';
import { initAnalytics, trackPageView, trackAdsConversionKontakt } from './utils/analytics';
import './App.css';
import BuyMeACoffeeWidget from './components/BuyMeACoffeeWidget';

// Lazy load all pages for code splitting and faster initial load
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Dashboard = lazy(() => import('./pages/DashboardPage'));
const Testing = lazy(() => import('./pages/TestingPage'));
const Training = lazy(() => import('./pages/TrainingPage'));
const Athletes = lazy(() => import('./pages/AthletesPage'));
const Profile = lazy(() => import('./pages/ProfilePage'));
const Settings = lazy(() => import('./pages/SettingsPage'));
const Support = lazy(() => import('./pages/SupportPage'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const AthleteProfile = lazy(() => import('./components/AthleteProfile'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const CompleteRegistrationPage = lazy(() => import('./pages/CompleteRegistrationPage'));
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'));
const TrainingDetailPage = lazy(() => import('./pages/TrainingDetailPage'));
const TrainingHistory = lazy(() => import('./components/TrainingHistory'));
const AcceptCoachInvitation = lazy(() => import('./pages/AcceptCoachInvitation'));
const TestingWithoutLogin = lazy(() => import('./pages/TestingWithoutLogin'));
const About = lazy(() => import('./pages/About'));
const Documentation = lazy(() => import('./pages/Documentation'));
const LactateGuide = lazy(() => import('./pages/LactateGuide'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const FitAnalysisPage = lazy(() => import('./pages/FitAnalysisPage'));
const LactateTestingPage = lazy(() => import('./pages/LactateTestingPage'));
const LactateStatisticsPage = lazy(() => import('./pages/LactateStatisticsPage'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Zone2CalculatorPage = lazy(() => import('./pages/Zone2CalculatorPage'));
const FtpCalculatorPage = lazy(() => import('./pages/FtpCalculatorPage'));
const TssCalculatorPage = lazy(() => import('./pages/TssCalculatorPage'));
const TrainingZonesCalculatorPage = lazy(() => import('./pages/TrainingZonesCalculatorPage'));

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-100">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);
function AppRoutes() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const location = useLocation();

  // Memoize the Layout component to prevent unnecessary re-renders
  const LayoutWithProps = useMemo(() => (
    <Layout isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
  ), [isMenuOpen]);

  // Track page views on route change
  React.useEffect(() => {
    trackPageView(location.pathname + location.search);
    // Example: fire Google Ads conversion when user reaches key pages.
    // Here: when user opens Training, Testing or Dashboard (can be adjusted).
    if (
      location.pathname.startsWith('/training') ||
      location.pathname.startsWith('/testing') ||
      location.pathname.startsWith('/dashboard')
    ) {
      trackAdsConversionKontakt();
    }
  }, [location.pathname, location.search]);

  // Save current route to localStorage (only for protected routes)
  React.useEffect(() => {
    const publicRoutes = [
      '/',
      '/about',
      '/privacy',
      '/login',
      '/signup',
      '/lactate-curve-calculator',
      '/forgot-password',
      '/documentation',
      '/lactate-guide'
    ];
    
    const isPublicRoute = publicRoutes.some(route => 
      location.pathname === route || 
      location.pathname.startsWith('/reset-password/') ||
      location.pathname.startsWith('/complete-registration/') ||
      location.pathname.startsWith('/accept-invitation/') ||
      location.pathname.startsWith('/accept-coach-invitation/')
    );

    // Only save protected routes
    if (!isPublicRoute) {
      const routeToSave = location.pathname + location.search;
      localStorage.setItem('lastRoute', routeToSave);
    }
  }, [location.pathname, location.search]);


  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Veřejné routy */}
        <Route path="/" element={<About />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/lactate-curve-calculator" element={<TestingWithoutLogin />} />
        <Route path="/zone2-calculator" element={<Zone2CalculatorPage />} />
        <Route path="/ftp-calculator" element={<FtpCalculatorPage />} />
        <Route path="/tss-calculator" element={<TssCalculatorPage />} />
        <Route path="/training-zones-calculator" element={<TrainingZonesCalculatorPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/complete-registration/:token" element={<CompleteRegistrationPage />} />
        <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />
        <Route path="/accept-coach-invitation/:token" element={<AcceptCoachInvitation />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/lactate-guide" element={<LactateGuide />} />

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
          <Route 
            path="/lactate-testing" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <LactateTestingPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/training-calendar/:activityId?" 
            element={<FitAnalysisPage />}
          />
          <Route 
            path="/lactate-statistics" 
            element={<LactateStatisticsPage />}
          />
          <Route path="/athletes" element={<Athletes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/support" element={<Support />} />
          <Route path="/admin" element={<AdminDashboard />} />
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
    </Suspense>
  );
}

function App() {
  const isProd = process.env.NODE_ENV === 'production';
  // Memoize the GoogleOAuthProvider configuration
  const googleOAuthConfig = useMemo(() => ({
    clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
    onScriptLoadError: () => console.error('Failed to load Google OAuth script'),
    // Don't log success every time to keep console clean
    onScriptLoadSuccess: () => {},
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
              {/* Only initialize analytics & Vercel tracking in production to avoid noisy dev logs */}
              {isProd && initAnalytics('G-HNHPQH30BL')}
              <AppRoutes />
              {isProd && <Analytics />}
              <BuyMeACoffeeWidget />
            </TrainingProvider>
          </AuthProvider>
        </NotificationProvider>
      </GoogleOAuthProvider>
    </Router>
  );
}

export default App; 