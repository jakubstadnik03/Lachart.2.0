import React, { useEffect, useState, useMemo, memo, lazy, Suspense } from "react";
import { useAuth } from "../context/AuthProvider";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header/Header";
import Menu from "./Menu";
import Footer from "./Footer";
import BasicProfileModal from "./Profile/BasicProfileModal";
import UnitsPreferencesModal from "./Profile/UnitsPreferencesModal";
import TrainingZonesModal from "./Profile/TrainingZonesModal";
import StravaConnectModal from "./Onboarding/StravaConnectModal";
import api from "../services/api";
import { useNotification } from "../context/NotificationContext";
import { autoSyncStravaActivities, autoSyncGarminActivities } from "../services/api";

// Lazy load TestingWithoutLogin to reduce initial bundle size
const TestingWithoutLogin = lazy(() => import("../pages/TestingWithoutLogin"));

// Memoize heavy components to prevent unnecessary re-renders
const MemoizedMenu = memo(Menu);
const MemoizedHeader = memo(Header);
const MemoizedFooter = memo(Footer);

const Layout = ({ isMenuOpen, setIsMenuOpen }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [showBasicProfileModal, setShowBasicProfileModal] = useState(false);
  const [showUnitsPreferencesModal, setShowUnitsPreferencesModal] = useState(false);
  const [showTrainingZonesModal, setShowTrainingZonesModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [profileForModal, setProfileForModal] = useState(null); // fresh profile when showing BasicProfileModal
  const { addNotification } = useNotification();

  // Memoize menu and header props to prevent unnecessary re-renders
  // Must be called before any early returns (React hooks rules)
  const menuProps = useMemo(() => ({ isMenuOpen, setIsMenuOpen }), [isMenuOpen, setIsMenuOpen]);
  const headerProps = useMemo(() => ({ isMenuOpen, setIsMenuOpen }), [isMenuOpen, setIsMenuOpen]);

  // Ensure menu is open when component mounts (only on desktop, not on mobile)
  useEffect(() => {
    if (user && window.innerWidth >= 768) {
      setIsMenuOpen(true);
    } else if (user && window.innerWidth < 768) {
      // On mobile, keep menu closed by default
      setIsMenuOpen(false);
    }
  }, [user, setIsMenuOpen]);

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

    // Only show onboarding modals for athletes, not coaches
    if (user.role === 'coach' || user.role === 'admin') {
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
          const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours
          
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
                
                if (stillNeedsBasic) {
                  setProfileForModal(finalUser);
                  setShowBasicProfileModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                } else if (stillNeedsUnits) {
                  setShowUnitsPreferencesModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                } else if (stillNeedsZones) {
                  setShowTrainingZonesModal(true);
                  localStorage.setItem('profileModalLastShown', now.toString());
                } else if (stillNeedsStrava) {
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

  // Auto-sync Strava activities if enabled (runs on app load)
  // Only sync once per session to avoid rate limiting
  useEffect(() => {
    if (!user?._id || !user?.strava?.autoSync || !user?.strava?.athleteId) {
      return;
    }

    // Only auto-sync for the current user (not for coach viewing athlete)
    if (user?.role === 'coach') {
      return; // Coaches sync is handled in DashboardPage
    }

    // Check if we've already synced in this session
    const syncKey = `strava_auto_sync_${user._id}`;
    const lastSync = sessionStorage.getItem(syncKey);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync)) < 60000) { // Don't sync more than once per minute
      return;
    }

    // Auto-sync on mount with a delay to avoid blocking page load
    const performAutoSync = async () => {
      try {
        const result = await autoSyncStravaActivities();
        sessionStorage.setItem(syncKey, now.toString());
        if (result.imported > 0 || result.updated > 0) {
          console.log(`Auto-sync completed on app load: ${result.imported} imported, ${result.updated} updated`);
          // Dispatch event to reload data in other components
          window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: result }));
        }
      } catch (error) {
        // 429 errors are already handled in autoSyncStravaActivities
        console.log('Auto-sync failed on app load:', error);
        // Silent fail - don't show errors to user
      }
    };

    // Delay auto-sync slightly to avoid blocking page load (reduced from 3000ms to 2000ms)
    const timeoutId = setTimeout(performAutoSync, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [user?._id, user?.strava?.autoSync, user?.strava?.athleteId, user?.role]);

  // Auto-sync Garmin activities if enabled (runs on app load)
  // Only sync once per session to avoid rate limiting
  useEffect(() => {
    if (!user?._id || !user?.garmin?.autoSync || !user?.garmin?.accessToken) {
      return;
    }

    // Only auto-sync for the current user (not for coach viewing athlete)
    if (user?.role === 'coach') {
      return; // Coaches sync is handled in DashboardPage
    }

    // Check if we've already synced in this session
    const syncKey = `garmin_auto_sync_${user._id}`;
    const lastSync = sessionStorage.getItem(syncKey);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync)) < 60000) { // Don't sync more than once per minute
      return;
    }

    // Auto-sync on mount with a delay to avoid blocking page load
    const performAutoSync = async () => {
      try {
        const result = await autoSyncGarminActivities();
        sessionStorage.setItem(syncKey, now.toString());
        if (result.imported > 0 || result.updated > 0) {
          console.log(`Garmin auto-sync completed on app load: ${result.imported} imported, ${result.updated} updated`);
          // Dispatch event to reload data in other components
          window.dispatchEvent(new CustomEvent('garminSyncComplete', { detail: result }));
        }
      } catch (error) {
        // 429 errors are already handled in autoSyncGarminActivities
        console.log('Garmin auto-sync failed on app load:', error);
        // Silent fail - don't show errors to user
      }
    };

    // Delay auto-sync slightly to avoid blocking page load (reduced from 4000ms to 2500ms)
    const timeoutId = setTimeout(performAutoSync, 2500);
    
    return () => clearTimeout(timeoutId);
  }, [user?._id, user?.garmin?.autoSync, user?.garmin?.accessToken, user?.role]);

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

  return (
    <div className="h-screen bg-gray-100 flex overflow-hidden">
      {/* Menu na levé straně */}
      <MemoizedMenu {...menuProps} />

      {/* Hlavní obsah včetně header, main content a footer */}
      <div className="flex-1 flex flex-col h-full ml-0 overflow-hidden">
        {/* Header */}
        <MemoizedHeader {...headerProps} />

        {/* Hlavní obsah s footerem uvnitř na mobilu */}
        <main className="flex-1 px-3 sm:px-3 md:px-4 pt-16 md:pt-0 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto flex flex-col min-h-full">
            <div className="flex-1">
            <Outlet /> {/* Zde se renderuje obsah vnořených rout */}
            </div>
            {/* Footer na mobilu - na konci obsahu */}
            <div className="md:hidden">
              <MemoizedFooter />
            </div>
          </div>
        </main>

        {/* Footer na desktopu - sticky */}
        <div className="hidden md:block">
        <MemoizedFooter />
        </div>
      </div>
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Basic Profile Modal - first step */}
      {user && (
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

      {/* Strava Connect Modal - third step */}
      {user && (
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
    </div>
  );
};

export default Layout;
