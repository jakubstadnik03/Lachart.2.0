import React, { useEffect, useState, useMemo, memo, lazy, Suspense, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthProvider";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";
import api, { autoSyncGarminActivities, autoSyncStravaActivities } from "../services/api";
import { useNotification } from "../context/NotificationContext";
import { LAYOUT_DESKTOP_MIN_PX } from "../constants/layoutBreakpoints";
import CoachAthleteBar from "./CoachAthleteBar";
import { isCapacitorNative } from "../utils/isNativeApp";
import { useAthleteSelection } from "../context/AthleteSelectionContext";
import NativeLayout from "./native/NativeLayout";
import { shouldShowOnboarding } from "./Onboarding/OnboardingFlow";

// Admin sees coach UI only when their role is not 'athlete'.
const isCoachRole = (user) =>
  ['coach', 'tester', 'testing', 'admin'].includes(user?.role) ||
  (user?.admin === true && user?.role !== 'athlete');

const WALKTHROUGH_DISMISSED_KEY = 'lachart:walkthroughDismissed';

const BasicProfileModal = lazy(() => import("./Profile/BasicProfileModal"));
const UnitsPreferencesModal = lazy(() => import("./Profile/UnitsPreferencesModal"));
const TrainingZonesModal = lazy(() => import("./Profile/TrainingZonesModal"));
const StravaConnectModal = lazy(() => import("./Onboarding/StravaConnectModal"));
const ProductWalkthrough = lazy(() => import("./Onboarding/ProductWalkthrough"));
const TestingWithoutLogin = lazy(() => import("../pages/TestingWithoutLogin"));
const OnboardingFlow = lazy(() => import("./Onboarding/OnboardingFlow"));

// Memoize heavy components to prevent unnecessary re-renders
const MemoizedMenu = memo(Menu);
const MemoizedHeader = memo(Header);
const MemoizedFooter = memo(Footer);

const Layout = ({ isMenuOpen, setIsMenuOpen }) => {
  const { user, premiumPreviewNoAccess } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBasicProfileModal, setShowBasicProfileModal] = useState(false);
  const [showUnitsPreferencesModal, setShowUnitsPreferencesModal] = useState(false);
  const [showTrainingZonesModal, setShowTrainingZonesModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const walkthroughTimerRef = useRef(null);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [profileForModal, setProfileForModal] = useState(null); // fresh profile when showing BasicProfileModal
  const { addNotification } = useNotification();

  // ── Native: athletes for coach athlete bar ──────────────────────────────────
  const [athletes, setAthletes] = useState([]);
  const [athleteStatuses, setAthleteStatuses] = useState({});

  const loadNativeAthletes = useCallback(async () => {
    if (!isCoachRole(user)) return;
    try {
      const response = await api.get('/user/coach/athletes');
      const list = response.data || [];
      setAthletes(list);
      if (list.length > 0) {
        Promise.allSettled(
          list.slice(0, 15).map(a =>
            api.get(`/test/list/${a._id}`).then(r => ({ id: a._id, tests: r.data || [] }))
          )
        ).then(results => {
          const statuses = {};
          results.forEach(r => {
            if (r.status === 'fulfilled') {
              const { id, tests } = r.value;
              const sorted = [...tests].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
              statuses[id] = sorted[0]?.date || sorted[0]?.createdAt || null;
            }
          });
          setAthleteStatuses(statuses);
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Native: Error loading athletes:', err);
    }
  }, [user]);

  useEffect(() => {
    if (isCapacitorNative() && user) loadNativeAthletes();
  }, [loadNativeAthletes, user]);

  useEffect(() => {
    if (!isCapacitorNative()) return;
    const refresh = () => loadNativeAthletes();
    window.addEventListener('coachAthletesUpdated', refresh);
    window.addEventListener('athleteListUpdated', refresh);
    return () => {
      window.removeEventListener('coachAthletesUpdated', refresh);
      window.removeEventListener('athleteListUpdated', refresh);
    };
  }, [loadNativeAthletes]);

  // effectiveAthleteId for native coach view — use global context as source of truth
  const { selectedAthleteId: _globalAthleteId, setSelectedAthleteId: setGlobalAthleteId } = useAthleteSelection();
  const isCoachNative = isCoachRole(user);
  const nativeEffectiveAthleteId = isCoachNative ? (_globalAthleteId || user?._id || null) : null;

  // On fresh app open or login: reset stored athleteId to own ID whenever the
  // logged-in user changes. This prevents leftover athlete IDs from a previous
  // session showing the wrong avatar / data on startup.
  const prevUserIdRef = React.useRef(null);
  React.useEffect(() => {
    if (!user?._id) return;
    const uid = String(user._id);
    if (prevUserIdRef.current !== uid) {
      prevUserIdRef.current = uid;
      // Always start viewing your own data after (re-)login or cold start
      setGlobalAthleteId(uid);
      try { localStorage.setItem('trainingCalendar_selectedAthleteId', uid); } catch {}
    }
  }, [user?._id, setGlobalAthleteId]);

  const handleNativeAthleteSelect = useCallback((athleteId) => {
    setGlobalAthleteId(athleteId);  // context writes localStorage + broadcasts event
    // Also update trainingCalendar_selectedAthleteId so FitAnalysisPage reacts
    try { localStorage.setItem('trainingCalendar_selectedAthleteId', athleteId); } catch {}

    // Navigate so page re-renders with new athlete URL param (useParams() in each page)
    const path = location.pathname;
    const athleteRoutes = ['dashboard', 'testing', 'training', 'fit-analysis', 'training-calendar'];
    for (const base of athleteRoutes) {
      if (path === `/${base}` || path.startsWith(`/${base}/`)) {
        navigate(`/${base}/${athleteId}`, { replace: true });
        return;
      }
    }
    // For calendar / athletes / other routes the event + localStorage is enough
  }, [navigate, location.pathname, setGlobalAthleteId]);
  // ────────────────────────────────────────────────────────────────────────────

  // Memoize menu and header props to prevent unnecessary re-renders
  // Must be called before any early returns (React hooks rules)
  const menuProps = useMemo(() => ({ isMenuOpen, setIsMenuOpen }), [isMenuOpen, setIsMenuOpen]);
  const headerProps = useMemo(() => ({ isMenuOpen, setIsMenuOpen }), [isMenuOpen, setIsMenuOpen]);

  // Ensure menu is open when component mounts (only on desktop, not on mobile)
  useEffect(() => {
    if (user && window.innerWidth >= LAYOUT_DESKTOP_MIN_PX) {
      setIsMenuOpen(true);
    } else if (user && window.innerWidth < LAYOUT_DESKTOP_MIN_PX) {
      // On mobile / tablet portrait, keep menu closed by default (hamburger)
      setIsMenuOpen(false);
    }
  }, [user, setIsMenuOpen]);

  // ── New Onboarding Flow (replaces the old individual modals for new users) ───
  useEffect(() => {
    if (!user?._id) return;
    if (location.pathname === '/lactate-guide') return;
    // Small delay so the rest of the UI loads first
    const t = setTimeout(() => {
      if (shouldShowOnboarding(user)) {
        setShowOnboarding(true);
      }
    }, 1200);
    return () => clearTimeout(t);
  // Re-check only when the user object identity or key onboarding fields change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, user?.onboarding?.basicProfileDone, user?.onboarding?.unitsDone]);

  // Check if user profile is incomplete or Strava is not connected
  // Only for athletes, not coaches
  // Show modals progressively: Basic Profile -> Training Zones -> Strava
  useEffect(() => {
    if (!user || location.pathname === '/lactate-guide') {
      return;
    }

    // Reset hasCheckedProfile when user changes
    if (hasCheckedProfile && user._id) {
      // Check if this is a different user
      const lastCheckedUserId = localStorage.getItem('lastCheckedUserId');
      if (lastCheckedUserId !== user._id) {
        setHasCheckedProfile(false);
        localStorage.setItem('lastCheckedUserId', user._id);
      }
    }

    if (hasCheckedProfile) {
      return;
    }

    // Only show old onboarding modals for athletes who are NOT going through the new flow
    if (isCoachRole(user) || shouldShowOnboarding(user)) {
      setHasCheckedProfile(true);
      if (user._id) {
        localStorage.setItem('lastCheckedUserId', user._id);
      }
      return;
    }

    // Check immediately if user object is complete, otherwise wait briefly
    const checkProfile = () => {
      if (!user._id) {
        setHasCheckedProfile(true);
        return;
      }

      // Check user data from already loaded user object (avoid unnecessary API call)
      const verifyUserData = async () => {
        try {
          // Use existing user data first to avoid blocking page load
          const isBasicProfileIncomplete = !user.dateOfBirth || !user.height || !user.weight || !user.sport;
          const hasNoTrainingZones = !user.powerZones?.cycling?.lt1 && !user.powerZones?.running?.lt1 && !user.powerZones?.swimming?.lt1;
          const isStravaNotConnected = !user.strava?.athleteId;
          const stravaSkipped = localStorage.getItem(`stravaConnectModalDone_${user._id}`) === 'true';
          const unitsAlreadyDone = user.onboarding?.unitsDone || localStorage.getItem(`unitsPreferencesModalDone_${user._id}`) === 'true';
          const basicProfileDone = user.onboarding?.basicProfileDone || localStorage.getItem(`basicProfileModalDone_${user._id}`) === 'true';
          const trainingZonesDone = user.onboarding?.trainingZonesDone || localStorage.getItem(`trainingZonesModalDone_${user._id}`) === 'true';
          // IMPORTANT: If Units Preferences was already dismissed, never show it again
          const needsUnitsPreferences = !unitsAlreadyDone;
      
          // Check if we've already shown the modal (use localStorage for persistence)
          // Only show once per day to avoid annoying users
          const lastShown = localStorage.getItem('profileModalLastShown');
          const now = Date.now();
          // 7-day throttle (was 24h) — onboarding modals are pushy. The per-modal
          // *Done flag (above) handles the "already saw it" case; this just
          // prevents the second modal from popping in the same session window.
          const oneDayAgo = now - (7 * 24 * 60 * 60 * 1000);
          
          // Only show modal if:
          // 1. Something is incomplete (basic profile, units, zones, Strava) and not already done/skipped
          // 2. We haven't shown it in the last 24 hours
          // IMPORTANT: Units Preferences modal should NEVER show if it was already dismissed
          const needsBasicProfile = isBasicProfileIncomplete && !basicProfileDone;
          const needsZones = hasNoTrainingZones && !trainingZonesDone;
          const needsStrava = isStravaNotConnected && !stravaSkipped;
          if ((needsBasicProfile || needsUnitsPreferences || needsZones || needsStrava) && (!lastShown || parseInt(lastShown) < oneDayAgo)) {
            // Delay before showing modal (3 seconds after login)
            setTimeout(() => {
              // Only fetch fresh data if we need to show modal (single API call instead of multiple)
              api.get('/user/profile', { cacheTtlMs: 60000 }).then((finalResponse) => {
                const finalUser = finalResponse.data;
                const stillBasicIncomplete = !finalUser.dateOfBirth || !finalUser.height || !finalUser.weight || !finalUser.sport;
                const stillNoZones = !finalUser.powerZones?.cycling?.lt1 && !finalUser.powerZones?.running?.lt1 && !finalUser.powerZones?.swimming?.lt1;
                const stillNotConnected = !finalUser.strava?.athleteId;
                const finalStravaSkipped = localStorage.getItem(`stravaConnectModalDone_${finalUser._id}`) === 'true';
                const finalUnitsDone = finalUser.onboarding?.unitsDone || localStorage.getItem(`unitsPreferencesModalDone_${finalUser._id}`) === 'true';
                const finalBasicDone = finalUser.onboarding?.basicProfileDone || localStorage.getItem(`basicProfileModalDone_${finalUser._id}`) === 'true';
                const finalZonesDone = finalUser.onboarding?.trainingZonesDone || localStorage.getItem(`trainingZonesModalDone_${finalUser._id}`) === 'true';
                const stillNeedsUnits = !finalUnitsDone;
                const stillNeedsBasic = stillBasicIncomplete && !finalBasicDone;
                const stillNeedsZones = stillNoZones && !finalZonesDone;
                const stillNeedsStrava = stillNotConnected && !finalStravaSkipped;
                
                // SAFETY: set the *Done flag in localStorage IMMEDIATELY when
                // we decide to open a modal. If anything in the modal breaks
                // (JS error, broken backdrop, network failure on save), the
                // user just refreshes and won't see it again — instead of being
                // permanently locked out like Andrea was.
                // The flag re-opens only if the user explicitly clears it.
                const markShown = (key) => {
                  if (finalUser?._id) localStorage.setItem(`${key}_${finalUser._id}`, 'true');
                };
                if (stillNeedsBasic) {
                  markShown('basicProfileModalDone');
                  setProfileForModal(finalUser);
                  setShowBasicProfileModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                } else if (stillNeedsUnits) {
                  markShown('unitsPreferencesModalDone');
                  setShowUnitsPreferencesModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                } else if (stillNeedsZones) {
                  markShown('trainingZonesModalDone');
                  setShowTrainingZonesModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                } else if (stillNeedsStrava) {
                  markShown('stravaConnectModalDone');
                  setShowStravaModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                }
              }).catch(() => {
                // If final check fails, don't show modal
              });
            }, 3000); // 3 seconds delay after login
          }
        } catch (error) {
          console.error('Error verifying user data:', error);
          // If check fails, don't show modal
        }
      };
      
      verifyUserData();
      setHasCheckedProfile(true);
      if (user._id) {
        localStorage.setItem('lastCheckedUserId', user._id);
      }
    };

    // If user data is already complete, check immediately
    // Otherwise wait briefly
    if (user._id && user.dateOfBirth !== undefined) {
      checkProfile();
    } else {
      const timeoutId = setTimeout(checkProfile, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [user, hasCheckedProfile, location.pathname]);

  // ── Strava: webhook-only sync ─────────────────────────────────────────────
  // Strava delivers new activities to /api/integrations/strava/webhook the
  // moment the athlete saves them. The backend fetches exactly that one
  // activity and stores it in the DB. The frontend never needs to poll Strava.
  //
  // The server-side scheduler (stravaAutoSyncScheduler) runs every hour as a
  // safety net for missed webhooks (server restart, Strava delivery failure).
  //
  // No frontend polling = no wasted Strava API quota.

  // ── Garmin: frontend polling (no webhook support) ─────────────────────────
  useEffect(() => {
    if (!user?._id) return undefined;
    const hasGarmin = !!(user?.garmin?.autoSync && user?.garmin?.accessToken);
    if (!hasGarmin) return undefined;

    let cancelled = false;

    const runGarmin = async (cooldownMs = 30 * 60 * 1000) => {
      const syncKey = `garmin_auto_sync_${user._id}`;
      const now = Date.now();
      const lastSync = localStorage.getItem(syncKey);
      if (lastSync && now - parseInt(lastSync, 10) < cooldownMs) return;
      try {
        const result = await autoSyncGarminActivities();
        localStorage.setItem(syncKey, now.toString());
        if (result.imported > 0 || result.updated > 0) {
          console.log(`Garmin auto-sync completed: ${result.imported} imported, ${result.updated} updated`);
          window.dispatchEvent(new CustomEvent('garminSyncComplete', { detail: result }));
        }
      } catch (error) {
        console.log('Garmin auto-sync failed:', error);
      }
    };

    const run = async () => {
      await new Promise((r) => setTimeout(r, 3500));
      if (cancelled) return;
      await runGarmin(30 * 60 * 1000);
    };

    const onForeground = async () => {
      if (cancelled) return;
      await runGarmin(15 * 60 * 1000);
    };

    let capacitorCleanup = null;
    if (isCapacitorNative()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) onForeground();
        }).then((handle) => { capacitorCleanup = handle; });
      }).catch(() => {});
    } else {
      const onVisible = () => { if (document.visibilityState === 'visible') onForeground(); };
      document.addEventListener('visibilitychange', onVisible);
      capacitorCleanup = { remove: () => document.removeEventListener('visibilitychange', onVisible) };
    }

    run();
    return () => {
      cancelled = true;
      capacitorCleanup?.remove?.();
    };
  }, [
    user?._id,
    user?.garmin?.autoSync,
    user?.garmin?.accessToken,
  ]);

  // ── Strava: frontend polling fallback ────────────────────────────────────
  // Webhooks deliver new activities in real-time, but they can go stale
  // (missing SERVER_PUBLIC_URL, Strava delivery failure, dev environment).
  // Strava auto-sync — fires on every login/session start, then on tab focus.
  // sessionStorage key → syncs on every new login/page load regardless of when
  // the last localStorage sync happened.  Within the same session visibility
  // events use a 15-min cooldown so quota isn't burned on rapid tab switches.
  useEffect(() => {
    if (!user?._id) return undefined;
    const hasStrava = !!(user?.strava?.autoSync && user?.strava?.accessToken);
    if (!hasStrava) return undefined;

    let cancelled = false;

    const runStrava = async (cooldownMs) => {
      const lsKey  = `strava_auto_sync_${user._id}`;
      const now    = Date.now();
      const last   = localStorage.getItem(lsKey);
      if (cooldownMs != null && last && now - parseInt(last, 10) < cooldownMs) return;
      try {
        const result = await autoSyncStravaActivities({ force: false });
        localStorage.setItem(lsKey, now.toString());
        if (result?.imported > 0 || result?.updated > 0) {
          console.log(`[Strava] auto-sync: ${result.imported} imported, ${result.updated} updated`);
          window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: result }));
        }
      } catch (err) {
        console.log('[Strava] auto-sync failed:', err?.message || err);
      }
    };

    // On login / session start: sync immediately (only 2-min safety guard so a
    // hard-refresh doesn't double-fire; sessionStorage resets on every new login).
    const sessionKey = `strava_session_synced_${user._id}`;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 3000));
      if (cancelled) return;
      const alreadyThisSession = sessionStorage.getItem(sessionKey);
      sessionStorage.setItem(sessionKey, '1');
      // First mount this session → 2-min cooldown; subsequent mounts → 15-min
      await runStrava(alreadyThisSession ? 15 * 60 * 1000 : 2 * 60 * 1000);
    };

    // Tab becomes visible again — use 15-min cooldown to avoid hammering
    const onForeground = async () => {
      if (cancelled) return;
      await runStrava(15 * 60 * 1000);
    };

    let capacitorCleanup = null;
    if (isCapacitorNative()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) onForeground();
        }).then((handle) => { capacitorCleanup = handle; });
      }).catch(() => {});
    } else {
      const onVisible = () => { if (document.visibilityState === 'visible') onForeground(); };
      document.addEventListener('visibilitychange', onVisible);
      capacitorCleanup = { remove: () => document.removeEventListener('visibilitychange', onVisible) };
    }

    run();
    return () => {
      cancelled = true;
      capacitorCleanup?.remove?.();
    };
  }, [
    user?._id,
    user?.strava?.autoSync,
    user?.strava?.accessToken,
  ]);

  // First-time product tour (after onboarding modals — delay so they don't stack)
  useEffect(() => {
    if (walkthroughTimerRef.current) {
      clearTimeout(walkthroughTimerRef.current);
      walkthroughTimerRef.current = null;
    }
    if (!user?._id) return undefined;
    if (user.admin || user.role === 'admin') return undefined;
    try {
      if (localStorage.getItem(WALKTHROUGH_DISMISSED_KEY) === 'true') return undefined;
    } catch {
      // Ignore storage errors.
    }
    // Only when walkthroughDone is explicitly false (set on new email/Google signup).
    // Legacy users: field missing → undefined → no tour.
    if (user.onboarding?.walkthroughDone !== false) return undefined;
    const role = String(user.role || '').toLowerCase();
    if (!['athlete', 'coach', 'tester', 'testing'].includes(role)) return undefined;

    walkthroughTimerRef.current = setTimeout(() => {
      setShowWalkthrough(true);
      walkthroughTimerRef.current = null;
    }, 20000);

    return () => {
      if (walkthroughTimerRef.current) {
        clearTimeout(walkthroughTimerRef.current);
        walkthroughTimerRef.current = null;
      }
    };
  }, [user?._id, user?.onboarding?.walkthroughDone, user?.role, user?.admin]);

  // Open product tour from Settings (or anywhere): window.dispatchEvent(new CustomEvent('lachart:openWalkthrough'))
  useEffect(() => {
    const openWalkthrough = () => setShowWalkthrough(true);
    window.addEventListener('lachart:openWalkthrough', openWalkthrough);
    return () => window.removeEventListener('lachart:openWalkthrough', openWalkthrough);
  }, []);

  // Allow access to lactate-guide and admin without login - render them directly
  if (location.pathname === '/lactate-guide') {
    return <Outlet />;
  }

  // If user is not logged in, show TestingWithoutLogin
  if (!user) {
    return (
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }>
        <TestingWithoutLogin />
      </Suspense>
    );
  }

  // ── Native iOS/Android shell ─────────────────────────────────────────────────
  if (isCapacitorNative()) {
    return (
      <>
        <NativeLayout
          athletes={athletes}
          athleteStatuses={athleteStatuses}
          effectiveAthleteId={nativeEffectiveAthleteId}
          onAthleteSelect={handleNativeAthleteSelect}
        />
        {/* Onboarding modals still work on native */}
        <Suspense fallback={null}>
          {/* New guided onboarding flow */}
          {user && showOnboarding && (
            <OnboardingFlow onDismiss={() => setShowOnboarding(false)} />
          )}

          {user && !showOnboarding && (
            <BasicProfileModal
              isOpen={showBasicProfileModal}
              onClose={() => {
                if (user?._id) {
                  localStorage.setItem(`basicProfileModalDone_${user._id}`, 'true');
                  api.put('/user/edit-profile', { onboarding: { basicProfileDone: true } })
                    .then(res => res.data && window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data })))
                    .catch(() => {});
                }
                setProfileForModal(null);
                setShowBasicProfileModal(false);
              }}
              onSubmit={async (formData) => {
                try {
                  const response = await api.put('/user/edit-profile', { ...formData, onboarding: { basicProfileDone: true } });
                  if (response.data) {
                    if (response.data._id) localStorage.setItem(`basicProfileModalDone_${response.data._id}`, 'true');
                    setProfileForModal(null);
                    window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                    setShowBasicProfileModal(false);
                    addNotification('Profile updated successfully', 'success');
                  }
                } catch {
                  addNotification('Error updating profile', 'error');
                }
              }}
              userData={profileForModal || user}
            />
          )}
          {user && (
            <UnitsPreferencesModal
              isOpen={showUnitsPreferencesModal}
              onClose={() => {
                if (user?._id) {
                  localStorage.setItem(`unitsPreferencesModalDone_${user._id}`, 'true');
                  api.put('/user/edit-profile', { onboarding: { unitsDone: true } })
                    .then(res => res.data && window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data })))
                    .catch(() => {});
                }
                setShowUnitsPreferencesModal(false);
              }}
              onSubmit={async (formData) => {
                try {
                  const response = await api.put('/user/edit-profile', { ...formData, onboarding: { unitsDone: true } });
                  if (response.data) {
                    localStorage.setItem(`unitsPreferencesModalDone_${response.data._id}`, 'true');
                    window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                    setShowUnitsPreferencesModal(false);
                    addNotification('Units saved', 'success');
                  }
                } catch {
                  addNotification('Error updating units', 'error');
                }
              }}
              userData={user}
            />
          )}
          {user && (
            <TrainingZonesModal
              isOpen={showTrainingZonesModal}
              onClose={() => {
                if (user?._id) {
                  localStorage.setItem(`trainingZonesModalDone_${user._id}`, 'true');
                  api.put('/user/edit-profile', { onboarding: { trainingZonesDone: true } })
                    .then(res => res.data && window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data })))
                    .catch(() => {});
                }
                setShowTrainingZonesModal(false);
              }}
              onSubmit={async (formData) => {
                try {
                  const response = await api.put('/user/edit-profile', { ...formData, onboarding: { trainingZonesDone: true } });
                  if (response.data) {
                    window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                    setShowTrainingZonesModal(false);
                    addNotification('Training zones updated successfully', 'success');
                  }
                } catch {
                  addNotification('Error updating training zones', 'error');
                }
              }}
              userData={user}
            />
          )}
          {user && !isCoachRole(user) && (
            <StravaConnectModal
              isOpen={showStravaModal}
              onClose={() => {
                setShowStravaModal(false);
                if (user?._id) localStorage.setItem(`stravaConnectModalDone_${user._id}`, 'true');
              }}
              onSuccess={() => {
                setShowStravaModal(false);
                if (user?._id) localStorage.setItem(`stravaConnectModalDone_${user._id}`, 'true');
                addNotification('Strava connected successfully', 'success');
              }}
            />
          )}
          {user && (
            <ProductWalkthrough
              open={showWalkthrough}
              onClose={() => setShowWalkthrough(false)}
              userRole={user.role}
            />
          )}
        </Suspense>
      </>
    );
  }
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full overflow-hidden bg-gray-100">
      {/* Menu na levé straně */}
      <MemoizedMenu {...menuProps} />

      {/* Hlavní obsah včetně header, main content a footer */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <MemoizedHeader {...headerProps} />

        {/* Premium preview banner removed — all features are free */}

        {/* Coach: "Viewing athlete" banner */}
        <CoachAthleteBar />

        {/* Hlavní obsah s footerem */}
        {/* On mobile the header is position:fixed. For athletes the main needs pt to clear it.
            For coaches the CoachAthleteBar already carries that mt offset, so main needs pt-0. */}
        <main
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] lg:pb-0 lg:pt-0 ${isCoachRole(user) ? 'pt-0' : 'pt-14'}`}
        >
          <div className="mx-auto w-full max-w-[1600px] flex flex-col flex-1">
            <Outlet /> {/* Zde se renderuje obsah vnořených rout */}
          </div>
          {/* Footer scrolls with content and spans the full layout width (hidden on training-calendar) */}
          {!location.pathname.startsWith('/training-calendar') && (
            <div className="mt-auto w-full pt-4">
              <MemoizedFooter />
            </div>
          )}
        </main>
      </div>
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-30"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <Suspense fallback={null}>
      {/* New guided onboarding flow — shown to new users before the old modal chain */}
      {user && showOnboarding && (
        <OnboardingFlow
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* Basic Profile Modal - first step */}
      {user && !showOnboarding && (
        <BasicProfileModal
          isOpen={showBasicProfileModal}
          onClose={() => {
            const persistBasicDone = () => {
              if (user?._id) {
                localStorage.setItem(`basicProfileModalDone_${user._id}`, 'true');
                api.put('/user/edit-profile', { onboarding: { basicProfileDone: true } })
                  .then((res) => res.data && window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data })))
                  .catch(() => {});
              }
            };
            persistBasicDone();
            setProfileForModal(null);
            setShowBasicProfileModal(false);
            const zonesDone = user?.onboarding?.trainingZonesDone || (user?._id && localStorage.getItem(`trainingZonesModalDone_${user._id}`) === 'true');
            const hasNoZones = !zonesDone && !user.powerZones?.cycling?.lt1 && !user.powerZones?.running?.lt1 && !user.powerZones?.swimming?.lt1;
            if (hasNoZones) {
              setShowTrainingZonesModal(true);
            } else if (!user.strava?.athleteId && localStorage.getItem(`stravaConnectModalDone_${user._id}`) !== 'true') {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', { ...formData, onboarding: { basicProfileDone: true } });
              if (response.data) {
                if (response.data._id) localStorage.setItem(`basicProfileModalDone_${response.data._id}`, 'true');
                setProfileForModal(null);
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                setShowBasicProfileModal(false);
                const unitsAlreadyDone = response.data.onboarding?.unitsDone || localStorage.getItem(`unitsPreferencesModalDone_${response.data._id}`) === 'true';
                if (unitsAlreadyDone) {
                  const zonesDone = response.data.onboarding?.trainingZonesDone || localStorage.getItem(`trainingZonesModalDone_${response.data._id}`) === 'true';
                  const hasNoZones = !zonesDone && !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                  if (hasNoZones) setShowTrainingZonesModal(true);
                  else if (!response.data.strava?.athleteId && localStorage.getItem(`stravaConnectModalDone_${response.data._id}`) !== 'true') setShowStravaModal(true);
                } else {
                  setShowUnitsPreferencesModal(true);
                }
                addNotification('Profile updated successfully', 'success');
              }
            } catch (error) {
              console.error('Error updating profile:', error);
              addNotification('Error updating profile', 'error');
            }
          }}
          userData={profileForModal || user}
        />
      )}

      {/* Units Preferences Modal - after basic profile (only once per user) */}
      {user && (
        <UnitsPreferencesModal
          isOpen={showUnitsPreferencesModal}
          onClose={() => {
            if (user?._id) {
              localStorage.setItem(`unitsPreferencesModalDone_${user._id}`, 'true');
              api.put('/user/edit-profile', { onboarding: { unitsDone: true } })
                .then((res) => res.data && window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data })))
                .catch(() => {});
            }
            setShowUnitsPreferencesModal(false);
            const zonesDone = user?.onboarding?.trainingZonesDone || (user?._id && localStorage.getItem(`trainingZonesModalDone_${user._id}`) === 'true');
            const hasNoZones = !zonesDone && !user.powerZones?.cycling?.lt1 && !user.powerZones?.running?.lt1 && !user.powerZones?.swimming?.lt1;
            if (hasNoZones) {
              setShowTrainingZonesModal(true);
            } else if (!user.strava?.athleteId && localStorage.getItem(`stravaConnectModalDone_${user._id}`) !== 'true') {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', { ...formData, onboarding: { unitsDone: true } });
              if (response.data) {
                localStorage.setItem(`unitsPreferencesModalDone_${response.data._id}`, 'true');
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                setShowUnitsPreferencesModal(false);
                const hasNoZones = !response.data.powerZones?.cycling?.lt1 && !response.data.powerZones?.running?.lt1 && !response.data.powerZones?.swimming?.lt1;
                if (hasNoZones) {
                  setShowTrainingZonesModal(true);
                } else if (!response.data.strava?.athleteId && localStorage.getItem(`stravaConnectModalDone_${response.data._id}`) !== 'true') {
                  setShowStravaModal(true);
                }
                addNotification('Units saved', 'success');
              }
            } catch (error) {
              console.error('Error updating units:', error);
              addNotification('Error updating units', 'error');
            }
          }}
          userData={user}
        />
      )}

      {/* Training Zones Modal - after units */}
      {user && (
        <TrainingZonesModal
          isOpen={showTrainingZonesModal}
          onClose={() => {
            if (user?._id) {
              localStorage.setItem(`trainingZonesModalDone_${user._id}`, 'true');
              api.put('/user/edit-profile', { onboarding: { trainingZonesDone: true } })
                .then((res) => res.data && window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data })))
                .catch(() => {});
            }
            setShowTrainingZonesModal(false);
            if (!user.strava?.athleteId && localStorage.getItem(`stravaConnectModalDone_${user._id}`) !== 'true') {
              setShowStravaModal(true);
            }
          }}
          onSubmit={async (formData) => {
            try {
              const response = await api.put('/user/edit-profile', { ...formData, onboarding: { trainingZonesDone: true } });
              if (response.data) {
                window.dispatchEvent(new CustomEvent('userUpdated', { detail: response.data }));
                setShowTrainingZonesModal(false);
                if (!response.data.strava?.athleteId && localStorage.getItem(`stravaConnectModalDone_${response.data._id}`) !== 'true') {
                  setShowStravaModal(true);
                }
                addNotification('Training zones updated successfully', 'success');
              }
            } catch (error) {
              console.error('Error updating training zones:', error);
              addNotification('Error updating training zones', 'error');
            }
          }}
          userData={user}
        />
      )}

      {/* Strava Connect Modal - third step (athletes only, not coaches) */}
      {user && !isCoachRole(user) && (
        <StravaConnectModal
          isOpen={showStravaModal}
          onClose={() => {
            setShowStravaModal(false);
            if (user?._id) localStorage.setItem(`stravaConnectModalDone_${user._id}`, 'true');
          }}
          onSuccess={() => {
            setShowStravaModal(false);
            if (user?._id) localStorage.setItem(`stravaConnectModalDone_${user._id}`, 'true');
            addNotification('Strava connected successfully', 'success');
          }}
        />
      )}

      {user && (
        <ProductWalkthrough
          open={showWalkthrough}
          onClose={() => setShowWalkthrough(false)}
          userRole={user.role}
        />
      )}
      </Suspense>
    </div>
  );
};

export default Layout;
