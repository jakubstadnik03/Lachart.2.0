import React, { useState, useEffect, useRef, useCallback } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatarBySportAndGender } from '../utils/avatarUtils';
import { LAYOUT_DESKTOP_MIN_PX } from '../constants/layoutBreakpoints';
import { isCapacitorNative } from '../utils/isNativeApp';

const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;
const TWELVE_WEEKS_MS = 12 * 7 * 24 * 60 * 60 * 1000;
function getStatusDot(lastTestDate) {
  if (!lastTestDate) return 'bg-red-400';
  const diff = Date.now() - new Date(lastTestDate).getTime();
  if (diff < SIX_WEEKS_MS) return 'bg-green-400';
  if (diff < TWELVE_WEEKS_MS) return 'bg-yellow-400';
  return 'bg-red-400';
}

const Menu = ({ isMenuOpen, setIsMenuOpen, user: propUser, token: propToken }) => {
  // FIRST: all hooks
  const { user: authUser, token: authToken, logout, loading } = useAuth();
  const { selectedAthleteId: globalSelectedAthleteId, setSelectedAthleteId: setGlobalAthleteId } = useAthleteSelection();
  const [athletes, setAthletes] = useState([]);
  const [athleteStatuses, setAthleteStatuses] = useState({});
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= LAYOUT_DESKTOP_MIN_PX);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.split('/')[1];
  const currentAthleteIdFromUrl = location.pathname.split('/')[2];

  // Use prop user/token if provided, otherwise use auth values
  const user = propUser || authUser;
  const token = propToken || authToken;
  // For avatar/name in sidebar always show logged-in user (coach sees own face, not athlete's)
  const displayUser = authUser || propUser;

  // All useEffects - move all up here
  // Note: Auto-opening menu is now handled by parent components (like TestingWithoutLogin)
  // This allows parent to control menu state, especially on mobile

  const loadAthletes = useCallback(async () => {
    if (!["coach", "tester", "testing"].includes(user?.role) || !token) {
      setLoadingAthletes(false);
      return;
    }
    try {
      setLoadingAthletes(true);
      const response = await api.get('/user/coach/athletes');
      const list = response.data || [];
      setAthletes(list);
      // Load test statuses in background (non-blocking, best-effort)
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
    } catch (error) {
      console.error('Error loading athletes:', error);
    } finally {
      setLoadingAthletes(false);
    }
  }, [user?.role, token]); // Only re-run if role/token changes

  useEffect(() => {
    loadAthletes();
  }, [loadAthletes]);

  useEffect(() => {
    const handleAthletesUpdated = () => {
      loadAthletes();
    };
    window.addEventListener('coachAthletesUpdated', handleAthletesUpdated);
    window.addEventListener('athleteListUpdated', handleAthletesUpdated);
    return () => {
      window.removeEventListener('coachAthletesUpdated', handleAthletesUpdated);
      window.removeEventListener('athleteListUpdated', handleAthletesUpdated);
    };
  }, [loadAthletes]);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= LAYOUT_DESKTOP_MIN_PX);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Close menu on mobile when pathname changes
    if (window.innerWidth < LAYOUT_DESKTOP_MIN_PX && typeof setIsMenuOpen === 'function') {
      // Use setTimeout to ensure menu closes after navigation
      const timer = setTimeout(() => {
      setIsMenuOpen(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, setIsMenuOpen]);

  // THEN: run loading check
  // Only hide menu if loading AND no user (to prevent flickering when user is already loaded)
  if (loading && !user) return null;

  // Pro trenéra: efektivně vybraný atlet — single source of truth from context
  let effectiveAthleteId = null;
  if (["coach", "tester", "testing"].includes(user?.role)) {
    // URL takes highest priority (so direct-link navigation is reflected immediately),
    // then fall back to the globally selected ID from context.
    effectiveAthleteId = (currentAthleteIdFromUrl && /^[a-f0-9]{24}$/.test(currentAthleteIdFromUrl))
      ? currentAthleteIdFromUrl
      : (globalSelectedAthleteId || user?._id || null);
  } else {
    effectiveAthleteId = currentAthleteIdFromUrl || null;
  }

  const handleMenuItemClick = (e) => {
    // Close menu immediately on mobile when clicking any link
    if (window.innerWidth < LAYOUT_DESKTOP_MIN_PX && typeof setIsMenuOpen === 'function') {
      setIsMenuOpen(false);
    }
  };

  const handleAthleteClick = async (athleteId) => {
    try {
      if (window.innerWidth < LAYOUT_DESKTOP_MIN_PX) {
        setIsMenuOpen(false);
      }

      // Globální volba atleta – sdílená napříč stránkami (context writes to localStorage + broadcasts)
      setGlobalAthleteId(athleteId);

      // Pokud jsme na stránce athletes nebo profile, přesměrujeme na profil atleta
      if (currentPath === 'athletes' || currentPath === 'profile') {
        navigate(`/athlete/${athleteId}`, { replace: true });
        return;
      }

      // Pro training-calendar: zůstaň na stránce, jen pošli event a ulož výběr
      if (currentPath === 'training-calendar') {
        localStorage.setItem('trainingCalendar_selectedAthleteId', athleteId);
        window.dispatchEvent(new CustomEvent('athleteSelected', { detail: { athleteId } }));
        // navigate to training-calendar with athlete context (without redirecting away)
        navigate(`/training-calendar`, { replace: true });
        return;
      }

      // Pokud klikneme na stejného atleta, zrušíme výběr
      if (currentAthleteIdFromUrl === athleteId) {
        navigate(`/${currentPath}`, { replace: true });
        return;
      }

      // Pro ostatní stránky přidáme ID atleta do URL — pages re-load via their selectedAthleteId useEffect
      navigate(`/${currentPath}/${athleteId}`, { replace: true });
    } catch (error) {
      console.error('Error changing athlete:', error);
    }
  };

  const handleLogout = async () => {
    try {
      // AuthProvider.logout už řeší volání API i přesměrování
      await logout();
      if (typeof setIsMenuOpen === 'function') {
      setIsMenuOpen(false);
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Funkce pro určení avataru podle role a sportu
  const getAvatar = (user) => {
    // Default avatar for demo mode or when user data is empty
    if (!user || !user.role) {
      return '/images/triathlete-avatar.jpg';
    }

    // Use the new utility function
    return getAvatarBySportAndGender(user);
  };

  // Definice položek menu s dynamickými cestami pro trenéra
  const menuItems = [
    {
      name: "Dashboard",
      getPath: (athleteId) =>
        ["coach", "tester", "testing"].includes(user?.role) && athleteId
          ? `/dashboard/${athleteId}`
          : "/dashboard",
      icon: "/icon/dashboard.svg",
      iconWhite: "/icon/dashboard-white.svg",
      showFor: ["coach", "athlete", "tester", "testing"]
    },
    {
      name: "Testing",
      getPath: (athleteId) =>
        ["coach", "tester", "testing"].includes(user?.role) && athleteId
          ? `/testing/${athleteId}`
          : "/testing",
      icon: "/icon/testing.svg",
      iconWhite: "/icon/testing-white.svg",
      showFor: ["coach", "athlete", "tester", "testing"]
    },
    {
      name: "Training Calendar",
      path: "/training-calendar",
      icon: "/icon/calendar.svg",
      iconWhite: "/icon/calendar-white.svg",
      showFor: ["coach", "athlete"]
     },
    {
      name: "Workout Planner",
      path: "/workout-planner",
      icon: "/icon/calendar.svg",
      iconWhite: "/icon/calendar-white.svg",
      showFor: ["coach", "tester", "testing"]
    },
    // {
    //   name: "Lactate Statistics",
    //   path: "/lactate-statistics",
    //   icon: "/icon/testing.svg",
    //   iconWhite: "/icon/testing-white.svg",
    //   showFor: ["coach", "athlete"]
    // },
    {
      name: "Training",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/training/${athleteId}` : "/training",
      icon: "/icon/training.svg",
      iconWhite: "/icon/training-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Lactate Testing",
      path: "/lactate-testing",
      icon: "/icon/lactate-testing.svg",
      iconWhite: "/icon/lactate-testing-white.svg",
      showFor: ["admin"]
    },
    {
      name: "Athletes",
      path: "/athletes",
      icon: "/icon/athletes.svg",
      iconWhite: "/icon/athletes-white.svg",
      showFor: ["coach", "testing", "tester"]
    },
    {
      name: "Profile",
      path: "/profile",
      icon: "/icon/profile.svg",
      iconWhite: "/icon/profile-white.svg",
      showFor: ["coach", "athlete", "tester", "testing"]
    },
    {
      name: "Admin Dashboard",
      path: "/admin",
      icon: "/icon/dashboard.svg",
      iconWhite: "/icon/dashboard-white.svg",
      showFor: ["admin"]
    },
  ];

  return (
    <>
      <motion.div 
        ref={menuRef}
        initial={isDesktop ? false : { x: -300, opacity: 0 }}
        animate={{ 
          x: isDesktop ? 0 : (isMenuOpen ? 0 : -300),
          opacity: isDesktop ? 1 : (isMenuOpen ? 1 : 0)
        }}
        transition={isDesktop ? { duration: 0 } : { 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          opacity: { duration: 0.2 }
        }}
        className={`safe-top fixed left-0 top-0 z-40 flex h-dvh max-h-dvh w-64 min-w-[16rem] flex-col overflow-hidden bg-white font-sans shadow-md lg:sticky ${!isDesktop && !isMenuOpen ? "pointer-events-none" : ""}`}
      >
        <div 
          className="flex items-center justify-center h-14 border-b border-gray-200 flex-shrink-0"
        >
          <img src="/images/LaChart.png" alt="LaChart Logo" className="h-8 w-auto mr-2 object-contain" />
          <h1 className="text-xl font-bold text-primary">LaChart</h1>
        </div>

        <div 
          className="p-4 flex items-center border-b border-gray-200 flex-shrink-0"
        >
          <img
            src={getAvatar(displayUser)}
            alt="User Avatar"
            className="w-12 h-12 rounded-full"
            key={displayUser?._id}
          />
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-800">
              {displayUser?.name || 'Demo'} {displayUser?.surname || 'User'}
            </p>
            <p className="text-xs text-gray-500">{displayUser?.email || 'demo@example.com'}</p>
          </div>
        </div>

        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0 }}
          className="p-3 pt-0 sm:p-4 sm:pt-0 flex-1 lg:flex-[3] overflow-y-auto min-h-0 [touch-action:pan-y] scrollbar-thin"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            scrollbarWidth: 'thin',
            scrollbarColor: '#D1D5DB transparent',
          }}
        >
          <h2 className="mb-2 pt-2 text-base text-gray-700 sm:mb-3 sm:pt-4 sm:text-lg">Menu</h2>
          {!user?.role ? (
            <ul className="space-y-2 pb-2">
              {[
                { name: 'Lactate Curve Calculator', path: '/lactate-curve-calculator', icon: '/icon/testing.svg', variant: 'default' },
                { name: 'FTP Calculator', path: '/ftp-calculator', icon: '/icon/training.svg', variant: 'default' },
                { name: 'TSS Calculator', path: '/tss-calculator', icon: '/icon/dashboard.svg', variant: 'default' },
                { name: 'Zone 2 Helper', path: '/zone2-calculator', icon: '/icon/training.svg', variant: 'default' },
                { name: 'Training Zones Calculator', path: '/training-zones-calculator', icon: '/icon/testing.svg', variant: 'default' },
                ...(!isCapacitorNative() ? [{ name: 'About LaChart', path: '/about', icon: '/icon/info.svg', variant: 'ghost' }] : []),
                { name: 'Lactate Guide', path: '/lactate-guide', icon: '/icon/testing.svg', variant: 'ghost' },
                { name: 'Sign up for free', path: '/signup', icon: '/icon/register-white.svg', variant: 'primary' },
              ].map((item) => (
                <li
                  key={item.name}
              >
                <NavLink
                    to={item.path}
                    onClick={handleMenuItemClick}
                    className={({ isActive }) => {
                      const base =
                        'flex items-center text-sm font-medium py-3 px-3 sm:p-3 rounded-lg transition-colors duration-150 touch-manipulation';
                      if (item.variant === 'primary') {
                        return `${base} ${
                          isActive
                            ? 'bg-gradient-to-r from-primary to-pink-500 text-white shadow-md'
                            : 'bg-gradient-to-r from-primary to-pink-500 text-white shadow hover:shadow-md'
                        }`;
                      }
                      if (item.variant === 'ghost') {
                        return `${base} ${
                          isActive
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`;
                      }
                      // default variant
                      return `${base} ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`;
                    }}
                >
                  <img
                      src={item.icon}
                      alt={item.name}
                    className="w-5 h-5 mr-3"
                  />
                    {item.name}
                </NavLink>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2 pb-2">
              {menuItems
                .filter(item => {
                  // Check if user has required role
                  if (item.showFor.includes(user.role)) return true;
                  // Check if item is admin-only and user is admin
                  if (item.showFor.includes("admin") && user?.admin === true) return true;
                  return false;
                })
                .map((item) => (
                  <li
                    key={item.name}
                    data-tour={item.name === 'Testing' ? 'tour-menu-testing' : undefined}
                  >
                    <NavLink
                      to={item.getPath ? item.getPath(effectiveAthleteId) : item.path}
                      onClick={handleMenuItemClick}
                      className={({ isActive }) =>
                        `flex items-center text-sm font-medium py-3 px-3 sm:p-3 rounded-lg touch-manipulation ${
                          isActive
                            ? "bg-primary text-white"
                            : "text-gray-700 hover:bg-gray-100"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <img
                            src={isActive ? item.iconWhite : item.icon}
                            alt={item.name}
                            className="w-5 h-5 mr-2 sm:mr-3 flex-shrink-0"
                          />
                          {item.name}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
            </ul>
          )}
        </motion.div>

        {["coach", "tester", "testing"].includes(user?.role) && (
          <div
            data-tour="tour-athletes-sidebar"
            className="p-3 pt-0 sm:p-4 border-t border-gray-200 max-lg:max-h-[min(32vh,14rem)] max-lg:flex-none lg:flex-1 lg:flex-[2] overflow-y-auto min-h-0 lg:max-h-none [touch-action:pan-y] scrollbar-thin"
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              scrollbarWidth: 'thin',
              scrollbarColor: '#D1D5DB transparent',
            }}
          >
            <h2 className="mb-3 pt-4 text-sm font-bold text-gray-700">Athletes</h2>
            {loadingAthletes ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 pb-2">
                <span className="inline-block w-3 h-3 border-2 border-primary border-r-transparent rounded-full animate-spin flex-shrink-0" />
                Loading athletes…
              </div>
            ) : athletes.length > 0 ? (
              <ul className="space-y-1 pb-2">
                {athletes.map((athlete) => {
                  const isSelected = effectiveAthleteId === athlete._id && currentPath !== 'athletes';
                  const lastTest = athleteStatuses[athlete._id]; // undefined = loading, null = no test
                  const isPending = athlete.invitationPending || athlete.coachLinkStatus === 'pending';
                  return (
                    <li key={athlete._id}>
                      <button
                        onClick={() => handleAthleteClick(athlete._id)}
                        className={`w-full text-left flex items-center gap-2 py-2 px-2 rounded-lg text-sm font-medium transition-colors duration-150 touch-manipulation ${
                          isSelected
                            ? "bg-violet-100 text-violet-700"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <img
                            src={getAvatar(athlete)}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                          {/* Status dot — only if we have status data */}
                          {!isPending && lastTest !== undefined && (
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${getStatusDot(lastTest)}`}
                            />
                          )}
                          {isPending && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white bg-amber-400" />
                          )}
                        </div>
                        <span className="truncate min-w-0 flex-1">
                          {athlete.name} {athlete.surname}
                        </span>
                        {isPending && (
                          <span className="text-[9px] bg-amber-100 text-amber-600 rounded px-1 py-0.5 shrink-0">pending</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-xs text-gray-400 pb-2">
                No athletes yet.{' '}
                <button
                  onClick={() => { navigate('/athletes'); if (window.innerWidth < LAYOUT_DESKTOP_MIN_PX) setIsMenuOpen(false); }}
                  className="text-primary underline"
                >
                  Add one
                </button>
              </div>
            )}
          </div>
        )}

        <div
          className="mt-auto flex-shrink-0 border-t border-gray-200 bg-white lg:bg-transparent"
        >
          {!user?.role ? (
            <div className="p-3 sm:p-4">
              <div className="text-center text-xs sm:text-sm text-gray-500">
                <p>© 2026 LaChart</p>
                <p className="mt-0.5 sm:mt-1">All rights reserved</p>
              </div>
            </div>
          ) : (
            <div className="px-2 py-2 sm:p-4 sm:pt-3">
              <ul className="grid max-lg:grid-cols-2 max-lg:gap-1 lg:space-y-2">
                <li data-tour="tour-menu-settings" className="min-w-0">
                  <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                      `flex items-center justify-center gap-1.5 sm:justify-start text-xs sm:text-sm font-medium min-h-[44px] px-3 sm:p-3 rounded-lg touch-manipulation ${
                        isActive
                          ? "bg-primary text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <img
                          src={isActive ? "/icon/settings-white.svg" : "/icon/settings.svg"}
                          alt=""
                          className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-3 flex-shrink-0"
                        />
                        <span className="truncate">Settings</span>
                      </>
                    )}
                  </NavLink>
                </li>
                <li className="min-w-0">
                  <NavLink
                    to="/support"
                    className={({ isActive }) =>
                      `flex items-center justify-center gap-1.5 sm:justify-start text-xs sm:text-sm font-medium min-h-[44px] px-3 sm:p-3 rounded-lg touch-manipulation ${
                        isActive
                          ? "bg-primary text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <img
                          src={isActive ? "/icon/support-white.svg" : "/icon/support.svg"}
                          alt=""
                          className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-3 flex-shrink-0"
                        />
                        <span className="truncate">Support</span>
                      </>
                    )}
                  </NavLink>
                </li>
              </ul>
            </div>
          )}

          <div 
            className="border-t border-gray-100 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-0 sm:border-t-0 sm:p-4 sm:pb-4 sm:pt-1"
          >
            {!user?.role ? (
              <div
                className="flex items-center w-full text-xs sm:text-sm font-medium min-h-[44px] px-3 sm:p-3 rounded-lg text-gray-400 cursor-not-allowed"
              >
                <img
                  src="/icon/logout.svg"
                  alt=""
                  className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 opacity-50 flex-shrink-0"
                />
                Log out
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center w-full text-xs sm:text-sm font-medium min-h-[44px] px-3 sm:p-3 rounded-lg text-red-600 hover:bg-red-50 active:bg-red-100 touch-manipulation"
              >
                <img
                  src="/icon/logout.svg"
                  alt=""
                  className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 flex-shrink-0"
                />
                Log out
              </button>
            )}
          </div>
        </div>
      </motion.div>
      
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-30 backdrop-blur-sm"
            onTouchStart={(e) => {
              // Record touch start position to distinguish tap from scroll
              e.currentTarget._touchStartX = e.touches[0]?.clientX ?? 0;
              e.currentTarget._touchStartY = e.touches[0]?.clientY ?? 0;
            }}
            onTouchEnd={(e) => {
              // Only close if the touch didn't move much (it was a tap, not a scroll)
              const dx = Math.abs((e.changedTouches[0]?.clientX ?? 0) - (e.currentTarget._touchStartX ?? 0));
              const dy = Math.abs((e.changedTouches[0]?.clientY ?? 0) - (e.currentTarget._touchStartY ?? 0));
              if (dx < 10 && dy < 10) setIsMenuOpen(false);
            }}
            onClick={() => setIsMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// Memoized: only re-renders if isMenuOpen, user identity, or token changes
export default React.memo(Menu, (prev, next) =>
  prev.isMenuOpen === next.isMenuOpen &&
  prev.token === next.token &&
  prev.user?._id === next.user?._id &&
  prev.user?.role === next.user?.role
);
