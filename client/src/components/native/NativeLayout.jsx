/**
 * NativeLayout – iOS/Android native shell
 *
 * Replaces the web sidebar + header with:
 *   • Thin top bar (logo + profile icon)
 *   • Coach athlete picker (horizontal scroll, coaches only)
 *   • Full-screen scrollable content
 *   • Bottom tab bar (iOS-style)
 *   • Profile sheet (slides up from bottom)
 */

import React, { useState, useCallback } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../context/AuthProvider';
import { getAvatarBySportAndGender } from '../../utils/avatarUtils';

const SIX_WEEKS_MS  = 6  * 7 * 24 * 60 * 60 * 1000;
const TWELVE_WEEKS_MS = 12 * 7 * 24 * 60 * 60 * 1000;
function statusColor(lastTest) {
  if (!lastTest) return '#f87171';
  const d = Date.now() - new Date(lastTest).getTime();
  if (d < SIX_WEEKS_MS)    return '#4ade80';
  if (d < TWELVE_WEEKS_MS) return '#facc15';
  return '#f87171';
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 24, stroke = 'currentColor', fill = 'none', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  dashboard:  'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  testing:    ['M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18'],
  calendar:   ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
  training:   'M13 10V3L4 14h7v7l9-11h-7z',
  athletes:   ['M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'],
  profile:    ['M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'],
  settings:   ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  support:    'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  admin:      ['M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'],
  logout:     'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  chevronRight: 'M9 5l7 7-7 7',
};

// ─── Tab definitions ───────────────────────────────────────────────────────────
function getTabsForRole(user, effectiveAthleteId) {
  const isCoach = ['coach', 'tester', 'testing'].includes(user?.role);
  const athletePath = (base) => isCoach && effectiveAthleteId ? `/${base}/${effectiveAthleteId}` : `/${base}`;

  if (user?.role === 'admin') {
    return [
      { key: 'dashboard',  label: 'Dashboard',  icon: ICONS.dashboard,  path: '/dashboard' },
      { key: 'admin',      label: 'Admin',       icon: ICONS.admin,      path: '/admin' },
    ];
  }

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard, path: athletePath('dashboard') },
    { key: 'testing',   label: 'Testing',   icon: ICONS.testing,   path: athletePath('testing') },
    { key: 'calendar',  label: 'Calendar',  icon: ICONS.calendar,  path: '/training-calendar' },
    { key: 'training',  label: 'Training',  icon: ICONS.training,  path: athletePath('training') },
  ];

  if (isCoach) {
    tabs.unshift({ key: 'athletes', label: 'Athletes', icon: ICONS.athletes, path: '/athletes' });
    // Remove one tab to keep 4 total → drop Training Calendar (coach uses athlete bar instead)
    const calIdx = tabs.findIndex(t => t.key === 'calendar');
    if (calIdx !== -1 && tabs.length > 4) tabs.splice(calIdx, 1);
  }

  return tabs;
}

// ─── Bottom Tab Bar ────────────────────────────────────────────────────────────
function NativeBottomTabBar({ tabs }) {
  const location = useLocation();

  return (
    <div
      className="flex-shrink-0 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = location.pathname.startsWith('/' + tab.key) ||
            (tab.key === 'dashboard' && location.pathname === '/') ||
            location.pathname === tab.path;
          return (
            <NavLink
              key={tab.key}
              to={tab.path}
              className="flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5"
              style={{ minHeight: '46px' }}
            >
              <span className={isActive ? 'text-primary' : 'text-gray-400'}>
                <Icon d={tab.icon} size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

// ─── Top Bar ───────────────────────────────────────────────────────────────────
function NativeTopBar({ user, onProfileTap }) {
  const avatar = user ? getAvatarBySportAndGender(user) : null;
  return (
    <div
      className="flex-shrink-0 flex items-end justify-between px-4 pb-2.5 bg-white border-b border-gray-100"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <img src="/images/LaChart.png" alt="LaChart" className="h-6 w-6 object-contain" />
        <span className="text-base font-bold text-primary tracking-tight">LaChart</span>
      </div>

      {/* Profile avatar button */}
      <button
        onClick={onProfileTap}
        className="w-8 h-8 rounded-full overflow-hidden border-2 border-primary/20 active:opacity-70"
      >
        {avatar
          ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              {(user?.name?.[0] || 'U').toUpperCase()}
            </div>
        }
      </button>
    </div>
  );
}

// ─── Coach Athlete Bar ─────────────────────────────────────────────────────────
function NativeAthleteBar({ athletes, effectiveAthleteId, onSelect, statuses }) {
  if (!athletes || athletes.length === 0) return null;

  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-100">
      <div
        className="flex gap-2 px-4 py-2 overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {athletes.map((a) => {
          const isSelected = effectiveAthleteId === a._id;
          const dot = statusColor(statuses?.[a._id]);
          return (
            <button
              key={a._id}
              onClick={() => onSelect(a._id)}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
                isSelected ? 'bg-primary/10' : ''
              }`}
            >
              <div className="relative">
                <img
                  src={getAvatarBySportAndGender(a)}
                  alt=""
                  className={`w-9 h-9 rounded-full border-2 ${isSelected ? 'border-primary' : 'border-transparent'}`}
                />
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                  style={{ background: dot }}
                />
              </div>
              <span className={`text-[9px] font-medium truncate max-w-[48px] ${isSelected ? 'text-primary' : 'text-gray-500'}`}>
                {a.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Profile Sheet ─────────────────────────────────────────────────────────────
function NativeProfileSheet({ open, onClose, user, logout, navigate }) {
  const isAdmin = user?.admin;
  const isCoach = ['coach', 'tester', 'testing'].includes(user?.role);

  const go = (path) => { onClose(); navigate(path); };

  const items = [
    { label: 'Profile',   icon: ICONS.profile,  path: '/profile',  color: 'text-gray-800' },
    { label: 'Settings',  icon: ICONS.settings, path: '/settings', color: 'text-gray-800' },
    { label: 'Support',   icon: ICONS.support,  path: '/support',  color: 'text-gray-800' },
    ...(isAdmin ? [{ label: 'Admin Dashboard', icon: ICONS.admin, path: '/admin', color: 'text-gray-800' }] : []),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* User info */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20">
                {user && <img src={getAvatarBySportAndGender(user)} alt="" className="w-full h-full object-cover" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user?.name} {user?.surname}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                <p className="text-xs text-primary capitalize mt-0.5">{user?.role}{isAdmin ? ' · Admin' : ''}</p>
              </div>
            </div>

            {/* Navigation items */}
            <div className="py-2">
              {items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => go(item.path)}
                  className={`w-full flex items-center gap-4 px-5 py-3.5 active:bg-gray-50 ${item.color}`}
                >
                  <span className="text-gray-500"><Icon d={item.icon} size={20} /></span>
                  <span className="flex-1 text-left text-base font-medium">{item.label}</span>
                  <span className="text-gray-300"><Icon d={ICONS.chevronRight} size={18} /></span>
                </button>
              ))}
            </div>

            {/* Logout */}
            <div className="border-t border-gray-100 py-2">
              <button
                onClick={async () => { onClose(); await logout(); }}
                className="w-full flex items-center gap-4 px-5 py-3.5 active:bg-red-50 text-red-500"
              >
                <Icon d={ICONS.logout} size={20} />
                <span className="text-base font-medium">Sign Out</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main NativeLayout ─────────────────────────────────────────────────────────
const NativeLayout = ({ athletes = [], athleteStatuses = {}, effectiveAthleteId, onAthleteSelect }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);

  const isCoach = ['coach', 'tester', 'testing'].includes(user?.role);
  const tabs = getTabsForRole(user, effectiveAthleteId);

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: '100dvh', maxHeight: '100dvh' }}>
      {/* Top bar */}
      <NativeTopBar user={user} onProfileTap={() => setShowProfile(true)} />

      {/* Coach athlete selector */}
      {isCoach && (
        <NativeAthleteBar
          athletes={athletes}
          effectiveAthleteId={effectiveAthleteId}
          onSelect={onAthleteSelect}
          statuses={athleteStatuses}
        />
      )}

      {/* Page content – this is the ONLY scrollable area */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <Outlet />
      </div>

      {/* Bottom tab bar */}
      <NativeBottomTabBar tabs={tabs} />

      {/* Profile sheet */}
      <NativeProfileSheet
        open={showProfile}
        onClose={() => setShowProfile(false)}
        user={user}
        logout={logout}
        navigate={navigate}
      />
    </div>
  );
};

export default NativeLayout;
