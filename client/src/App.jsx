import React, { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthProvider';
import { NotificationProvider } from './context/NotificationContext';
import { WorkoutSessionProvider } from './context/WorkoutSessionContext';
import WorkoutResumeBanner from './components/WorkoutExecution/WorkoutResumeBanner';
import { TrainingProvider } from './context/TrainingContext';
import { CategoryProvider } from './context/CategoryContext';
import { AthleteSelectionProvider } from './context/AthleteSelectionContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { useLocation, useNavigate } from 'react-router-dom';
import { initAnalytics, trackPageView, trackAdsConversionKontakt } from './utils/analytics';
import { isCapacitorNative } from './utils/isNativeApp';
import './App.css';

/** Nativní Capacitor (iOS/Android) — `/` = login. Ve webovém prohlížeči zůstává About. */

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
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ResendVerificationPage = lazy(() => import('./pages/ResendVerificationPage'));
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'));
const TrainingDetailPage = lazy(() => import('./pages/TrainingDetailPage'));
const TrainingHistory = lazy(() => import('./components/TrainingHistory'));
const AcceptCoachInvitation = lazy(() => import('./pages/AcceptCoachInvitation'));
const TestingWithoutLogin = lazy(() => import('./pages/TestingWithoutLogin'));
const About = lazy(() => import('./pages/About'));
const Tutorials = lazy(() => import('./pages/Tutorials'));
const Documentation = lazy(() => import('./pages/Documentation'));
const LactateGuide = lazy(() => import('./pages/LactateGuide'));
const BlogIndex = lazy(() => import('./pages/blog/BlogIndex'));
const HowLaChartCalculates = lazy(() => import('./pages/blog/HowLaChartCalculates'));
const LactateTestingProtocolGuide = lazy(() => import('./pages/blog/LactateTestingProtocolGuide'));
const Lt1VsLt2TrainingZones = lazy(() => import('./pages/blog/Lt1VsLt2TrainingZones'));
const OblaDmaxIatMethodsCompared = lazy(() => import('./pages/blog/OblaDmaxIatMethodsCompared'));
const LactateTestAtHome = lazy(() => import('./pages/blog/LactateTestAtHome'));
const LactateTestInterpretation = lazy(() => import('./pages/blog/LactateTestInterpretation'));
const FtpVsLt2 = lazy(() => import('./pages/blog/FtpVsLt2'));
const BestLactateAnalyzer2026 = lazy(() => import('./pages/blog/BestLactateAnalyzer2026'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const WorkoutPlannerPage = lazy(() => import('./pages/WorkoutPlannerPage'));
const WorkoutExecutionPage = lazy(() => import('./pages/WorkoutExecutionPage'));
const FitAnalysisPage = lazy(() => import('./pages/FitAnalysisPage'));
const LactateTestingPage = lazy(() => import('./pages/LactateTestingPage'));
const LactateStatisticsPage = lazy(() => import('./pages/LactateStatisticsPage'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-100">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

/** Load Vercel trackers after idle so they do not compete with first paint / main bundle parse. */
function DeferredVercelTrackers() {
  const [mods, setMods] = useState(null);

  useEffect(() => {
    if (isCapacitorNative() || process.env.NODE_ENV !== 'production') return undefined;
    let cancelled = false;
    let idleId;
    let timeoutId;
    const load = () => {
      Promise.all([
        import('@vercel/analytics/react'),
        import('@vercel/speed-insights/react')
      ])
        .then(([a, s]) => {
          if (cancelled) return;
          setMods({ Analytics: a.Analytics, SpeedInsights: s.SpeedInsights });
        })
        .catch(() => {});
    };
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(() => load(), { timeout: 8000 });
    } else {
      timeoutId = setTimeout(load, 4000);
    }
    return () => {
      cancelled = true;
      if (idleId != null) cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  if (isCapacitorNative() || !mods) return null;
  const { Analytics, SpeedInsights } = mods;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}

/** Defer third-party BuyMeACoffee widget until idle. */
function DeferredBuyMeACoffeeWidget() {
  const [Widget, setWidget] = useState(null);

  useEffect(() => {
    if (isCapacitorNative() || process.env.NODE_ENV !== 'production') return undefined;
    let cancelled = false;
    let idleId;
    let timeoutId;
    const load = () => {
      import('./components/BuyMeACoffeeWidget')
        .then((m) => {
          if (!cancelled) setWidget(() => m.default);
        })
        .catch(() => {});
    };

    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(() => load(), { timeout: 12000 });
    } else {
      timeoutId = setTimeout(load, 7000);
    }
    return () => {
      cancelled = true;
      if (idleId != null) cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  if (!Widget) return null;
  return <Widget />;
}

// Root route ("/"). On web this is the marketing About page. In the native app
// "/" used to be the LoginPage unconditionally — so opening the app from the
// widget (which routes to "/?openActivity=…") briefly flashed the login screen
// even when signed in. This guards it: while the session is still hydrating we
// show the loader, when signed in we go straight to the dashboard (preserving
// any ?openActivity deep-link), and only show the login when truly logged out.
function RootRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (!isCapacitorNative()) return <About />;
  if (loading) return <PageLoader />;
  if (isAuthenticated) {
    if (location.search.includes('openActivity')) {
      return <Navigate to={`/dashboard${location.search}`} replace />;
    }
    let last = null;
    try { last = localStorage.getItem('lastRoute'); } catch { /* ignore */ }
    const target = last && !['/', '/login', '/signup'].includes(last) ? last : '/dashboard';
    return <Navigate to={target} replace />;
  }
  return <LoginPage />;
}

function AppRoutes() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    // App Store 3.1.1: on iOS native we don't surface the subscription tab,
    // so swallow the premium-required event there instead of navigating
    // to a page that no longer exists.
    const goSettings = () => {
      if (isCapacitorNative()) return;
      navigate('/settings?tab=subscription');
    };
    window.addEventListener('app:premium-required', goSettings);
    return () => window.removeEventListener('app:premium-required', goSettings);
  }, [navigate]);

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

  // Browser-style scroll-to-top on route change. Without this, clicking
  // "Sign up" from the bottom of /about lands /signup pre-scrolled to the
  // same Y offset, which reads as "the page didn't load". Skip when the URL
  // includes a `#hash` — those navigations are explicitly targeting an
  // anchor on the same page (e.g. About's "App", "Pricing" nav links).
  React.useEffect(() => {
    if (location.hash) return;
    // RAF so the scroll happens after React has committed the new route's
    // DOM — otherwise the browser scrolls the OUTGOING page right before
    // it unmounts, which is invisible to the user.
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [location.pathname, location.hash]);

  // Save current route to localStorage (only for protected routes)
  React.useEffect(() => {
    const publicRoutes = [
      '/',
      '/about',
      '/privacy',
      '/login',
      '/signup',
      '/lactate-curve-calculator',
      '/ftp-calculator',
      '/vo2max-calculator',
      '/race-predictor',
      '/tss-calculator',
      '/training-zones-calculator',
      '/zone2-calculator',
      '/heat-altitude-calculator',
      '/weight-calculator',
      '/forgot-password',
      '/documentation',
      '/lactate-guide',
    ];
    
    const isPublicRoute = publicRoutes.some(route => 
      location.pathname === route || 
      location.pathname.startsWith('/reset-password/') ||
      location.pathname.startsWith('/blog/') ||
      location.pathname.startsWith('/verify-email/') ||
      location.pathname === '/resend-verification' ||
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
    <Suspense 
      fallback={<PageLoader />}
    >
      <Routes>
        {/* Veřejné routy */}
        <Route path="/" element={<RootRoute />} />
        <Route path="/about" element={<About />} />
        <Route path="/how-to-use" element={<Tutorials />} />
        <Route path="/tutorials" element={<Tutorials />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/lactate-curve-calculator" element={<TestingWithoutLogin />} />
        <Route path="/ftp-calculator" element={<TestingWithoutLogin />} />
        <Route path="/vo2max-calculator" element={<TestingWithoutLogin />} />
        <Route path="/race-predictor" element={<TestingWithoutLogin />} />
        <Route path="/tss-calculator" element={<TestingWithoutLogin />} />
        <Route path="/training-zones-calculator" element={<TestingWithoutLogin />} />
        <Route path="/zone2-calculator" element={<TestingWithoutLogin />} />
        <Route path="/heat-altitude-calculator" element={<TestingWithoutLogin />} />
        <Route path="/weight-calculator" element={<TestingWithoutLogin />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/resend-verification" element={<ResendVerificationPage />} />
        <Route path="/complete-registration/:token" element={<CompleteRegistrationPage />} />
        <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />
        <Route path="/accept-coach-invitation/:token" element={<AcceptCoachInvitation />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/lactate-guide" element={<BlogIndex />} />
        <Route path="/lactate-guide/classic" element={<LactateGuide />} />
        <Route path="/blog/how-lachart-calculates-lt1-lt2" element={<HowLaChartCalculates />} />
        <Route path="/blog/lactate-testing-protocol-guide" element={<LactateTestingProtocolGuide />} />
        <Route path="/blog/lt1-vs-lt2-training-zones" element={<Lt1VsLt2TrainingZones />} />
        <Route path="/blog/obla-dmax-iat-methods-compared" element={<OblaDmaxIatMethodsCompared />} />
        <Route path="/blog/lactate-test-at-home" element={<LactateTestAtHome />} />
        <Route path="/blog/lactate-test-interpretation" element={<LactateTestInterpretation />} />
        <Route path="/blog/ftp-vs-lt2" element={<FtpVsLt2 />} />
        <Route path="/blog/best-lactate-analyzer-2026" element={<BestLactateAnalyzer2026 />} />

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
          <Route 
            path="/training-comparison/:title" 
            element={
              <ProtectedRoute allowedRoles={['coach', 'athlete']}>
                <TrainingDetailPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/training" 
            element={
              <ProtectedRoute allowedRoles={['coach', 'athlete', 'tester', 'testing']}>
                <Training />
              </ProtectedRoute>
            } 
          />
          <Route path="/testing" element={<Testing />} />
          <Route 
            path="/lactate-testing" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <LactateTestingPage />
              </ProtectedRoute>
            } 
          />
          {/* Coach viewing athlete: /training-calendar/:athleteId/:activityId — must be before single-param route */}
          <Route
            path="/training-calendar/:athleteId/:activityId"
            element={
              <ProtectedRoute allowedRoles={['coach', 'athlete', 'tester', 'testing']}>
                <FitAnalysisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/training-calendar/:activityId?"
            element={
              <ProtectedRoute allowedRoles={['coach', 'athlete', 'tester', 'testing']}>
                <FitAnalysisPage />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/lactate-statistics" 
            element={<LactateStatisticsPage />}
          />
          <Route path="/workout-planner" element={<WorkoutPlannerPage />} />
          <Route path="/workout-execution/:plannedWorkoutId" element={<WorkoutExecutionPage />} />
          <Route path="/athletes" element={<Athletes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/support" element={<Support />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/athlete-profile/:id" element={<Profile />} />
          <Route path="/dashboard/:athleteId?" element={<Dashboard />} />
          <Route 
            path="/training/:athleteId?" 
            element={
              <ProtectedRoute allowedRoles={['coach', 'athlete', 'tester', 'testing']}>
                <Training />
              </ProtectedRoute>
            } 
          />
          <Route path="/testing/:athleteId?" element={<Testing />} />
          <Route 
            path="/athlete/:athleteId" 
            element={
              <ProtectedRoute allowedRoles={['coach', 'testing', 'tester']}>
                <AthleteProfile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/training-history/:title" 
            element={
              <ProtectedRoute allowedRoles={['coach', 'athlete']}>
                <TrainingHistory />
              </ProtectedRoute>
            } 
          />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const isProd = process.env.NODE_ENV === 'production';

  useEffect(() => {
    let cancelled = false;
    if (!isCapacitorNative()) return undefined;
    document.documentElement.classList.add('capacitor-native');
    import('./native/initCapacitorShell')
      .then((m) => {
        if (!cancelled) return m.initCapacitorShell();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  const coreApp = (
    <CategoryProvider>
      <NotificationProvider>
        <AuthProvider>
          <AthleteSelectionProvider>
          <TrainingProvider>
            <WorkoutSessionProvider>
              {isProd && !isCapacitorNative() && initAnalytics('G-HNHPQH30BL')}
              <AppRoutes />
              {/* Floating "return to active workout" pill — renders only when
                  a session is live and the user is on a non-execution route.
                  Lives at app root so it shows above every page including
                  the native shell layout. */}
              <WorkoutResumeBanner />
              {isProd && <DeferredVercelTrackers />}
              {isProd && <DeferredBuyMeACoffeeWidget />}
            </WorkoutSessionProvider>
          </TrainingProvider>
          </AthleteSelectionProvider>
        </AuthProvider>
      </NotificationProvider>
    </CategoryProvider>
  );

  return (
    <Router>
      {isCapacitorNative() ? (
        coreApp
      ) : (
        <GoogleOAuthProvider {...googleOAuthConfig}>{coreApp}</GoogleOAuthProvider>
      )}
    </Router>
  );
}

export default App; 