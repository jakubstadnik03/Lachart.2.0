/**
 * NativeLayout – iOS native shell
 *
 * Root uses position:fixed / inset:0 — the ONLY reliable full-screen
 * approach in Capacitor WKWebView. 100dvh is broken there.
 *
 * Layout tree:
 *   fixed root (full screen, flex-col)
 *   ├─ NativeTopBar         (shrink-0, paddingTop = safe-area-top)
 *   ├─ NativeAthleteBar?    (shrink-0, coaches only)
 *   ├─ content area         (flex-1, overflow-y-auto, overscroll contain)
 *   └─ NativeBottomTabBar   (shrink-0, paddingBottom = safe-area-bottom)
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useAuth } from '../../context/AuthProvider';
import { getAvatarBySportAndGender } from '../../utils/avatarUtils';
import { getNotifications, markAllNotificationsRead, markNotificationRead, deleteNotification, clearAllNotifications, autoSyncStravaActivities } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import NotifIcon from '../Notifications/NotifIcon';
import ActiveWorkoutBar from '../WorkoutExecution/ActiveWorkoutBar';
import { Skeleton } from '../common/Skeleton';

// Admin sees coach UI only when their role is not 'athlete'.
const isCoachRole = (user) =>
  ['coach', 'tester', 'testing', 'admin'].includes(user?.role) ||
  (user?.admin === true && user?.role !== 'athlete');

const SIX_WEEKS_MS   = 6  * 7 * 24 * 60 * 60 * 1000;
const TWELVE_WEEKS_MS = 12 * 7 * 24 * 60 * 60 * 1000;
function statusColor(lastTest) {
  if (!lastTest) return '#f87171';
  const d = Date.now() - new Date(lastTest).getTime();
  if (d < SIX_WEEKS_MS)    return '#4ade80';
  if (d < TWELVE_WEEKS_MS) return '#facc15';
  return '#f87171';
}

// ─── SVG Icon helper ───────────────────────────────────────────────────────────
const Icon = ({ d, size = 24, stroke = 'currentColor', fill = 'none', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  bell:         'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  planner:      ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', 'M9 12h6m-3-3v6'],
  bellAlert:    ['M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', 'M12 2a1 1 0 011 1v.341'],
  dashboard:    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  testing:      ['M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18'],
  calendar:     ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
  training:     'M13 10V3L4 14h7v7l9-11h-7z',
  athletes:     ['M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'],
  profile:      ['M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'],
  settings:     ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  support:      'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  admin:        ['M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'],
  lactate:      'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  logout:       'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  chevronRight: 'M9 5l7 7-7 7',
};

// ─── Tab definitions ───────────────────────────────────────────────────────────
function getTabsForRole(user, effectiveAthleteId) {
  const isCoach = isCoachRole(user);
  const ap = (base) => effectiveAthleteId ? `/${base}/${effectiveAthleteId}` : `/${base}`;

  if (isCoach) {
    // Coach/Admin tabs: Athletes | Home | Testing | Calendar | Training  (5 tabs)
    return [
      { key: 'athletes', label: 'Athletes', icon: ICONS.athletes,  path: '/athletes' },
      { key: 'dashboard',label: 'Home',     icon: ICONS.dashboard, path: ap('dashboard') },
      { key: 'testing',  label: 'Testing',  icon: ICONS.testing,   path: ap('testing') },
      { key: 'calendar', label: 'Calendar', icon: ICONS.calendar,  path: '/training-calendar' },
      { key: 'training', label: 'Training', icon: ICONS.training,  path: ap('training') },
    ];
  }

  // Athlete tabs: Home | Testing | Calendar | Training  (4 tabs)
  return [
    { key: 'dashboard', label: 'Home',     icon: ICONS.dashboard, path: ap('dashboard') },
    { key: 'testing',   label: 'Testing',  icon: ICONS.testing,   path: ap('testing') },
    { key: 'calendar',  label: 'Calendar', icon: ICONS.calendar,  path: '/training-calendar' },
    { key: 'training',  label: 'Training', icon: ICONS.training,  path: ap('training') },
  ];
}

const fmtNotifTime = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ─── Notifications bottom sheet ────────────────────────────────────────────────
function NativeNotificationsSheet({ open, onClose, notifs, loading, onNotifClick, onDelete, onMarkAllRead, onClearAll }) {
  const unread = notifs.filter(n => !n.read).length;

  // Swipe-to-close
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 300], [1, 0]);
  const startYRef = useRef(null);
  const isDraggingRef = useRef(false);
  const listScrollRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    startYRef.current = e.touches[0].clientY;
    isDraggingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!isDraggingRef.current || startYRef.current == null) return;
    // Only allow swipe-down when list is scrolled to top
    const listEl = listScrollRef.current;
    if (listEl && listEl.scrollTop > 0) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) {
      y.set(dy);
      e.preventDefault();
    }
  }, [y]);

  const onTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (y.get() > 100) {
      animate(y, 500, { duration: 0.2, onComplete: onClose });
    } else {
      animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
    startYRef.current = null;
  }, [y, onClose]);

  // Reset y when sheet opens
  useEffect(() => { if (open) y.set(0); }, [open, y]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50"
          style={{ pointerEvents: 'auto' }}
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => { e.stopPropagation(); }}
          onTouchEnd={e => e.stopPropagation()}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40"
            style={{ pointerEvents: 'auto' }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            style={{
              y, opacity,
              maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
              paddingBottom: 'env(safe-area-inset-bottom)',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
            onTouchStart={e => { e.stopPropagation(); onTouchStart(e); }}
            onTouchMove={e => { e.stopPropagation(); onTouchMove(e); }}
            onTouchEnd={e => { e.stopPropagation(); onTouchEnd(); }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-[5px] rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-semibold text-gray-900">Notifications</span>
                {unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {unread > 0 && (
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={onMarkAllRead}
                    style={{ touchAction: 'manipulation' }}
                    className="text-xs text-primary font-semibold active:opacity-60"
                  >
                    Mark all read
                  </button>
                )}
                {notifs.length > 0 && onClearAll && (
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={onClearAll}
                    style={{ touchAction: 'manipulation' }}
                    className="text-xs text-red-500 font-semibold active:opacity-60"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* List — allow internal scroll; stop touch propagation so swipe only fires at top */}
            <div
              ref={listScrollRef}
              style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              onTouchStart={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {loading && notifs.length === 0 && (
                <div className="px-5 py-4 space-y-4" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loading && notifs.length === 0 && (
                <div className="py-12 text-center flex flex-col items-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <p className="text-sm text-gray-400 font-medium">No notifications yet</p>
                </div>
              )}
              {notifs.map(n => (
                <button
                  key={n._id}
                  onClick={() => onNotifClick(n)}
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                  className={`w-full flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 active:bg-gray-50 text-left ${!n.read ? 'bg-primary/[0.03]' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center ${!n.read ? 'bg-primary/10' : 'bg-gray-100'}`}>
                    <NotifIcon type={n.type} sport={n.sport} size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{n.title}</p>
                    {/* Sport chip + time on a single row beneath the title.
                        The chip shows up only for notifications with a known
                        sport (Strava imports, FIT uploads, training reminders)
                        — gives a fast at-a-glance "Run / Bike / Swim" filter
                        and the colour matches the rest of the calendar UI. */}
                    {n.sport && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            // Sport colours mirror CalendarView's per-sport
                            // tint so the bell + calendar look consistent.
                            backgroundColor:
                              n.sport === 'run' ? '#FEF3C7' :
                              n.sport === 'bike' ? '#DBEAFE' :
                              n.sport === 'swim' ? '#CFFAFE' : '#F3F4F6',
                            color:
                              n.sport === 'run' ? '#92400E' :
                              n.sport === 'bike' ? '#1E40AF' :
                              n.sport === 'swim' ? '#155E75' : '#4B5563',
                          }}
                        >
                          {n.sport}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{n.body}</p>
                    {n.fromName && <p className="text-[11px] text-gray-400 mt-0.5">from {n.fromName}</p>}
                    <p className="text-[11px] text-gray-400 mt-1">{fmtNotifTime(n.createdAt)}</p>
                  </div>
                  {!n.read && <div className="w-2.5 h-2.5 bg-primary rounded-full flex-shrink-0 mt-1.5" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(n._id); }}
                    style={{ touchAction: 'manipulation' }}
                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full active:bg-gray-200 text-gray-300"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Top Bar ───────────────────────────────────────────────────────────────────
function NativeTopBar({ user, onProfileTap, onBellTap, unreadCount }) {
  const avatar = user ? getAvatarBySportAndGender(user) : null;
  return (
    <div
      data-native-bar="top"
      className="nl-top-bar flex-shrink-0 bg-white border-b border-gray-100"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between px-4 h-11">
        {/* Logo */}
        <div className="flex items-center gap-1.5">
          <img src="/images/LaChart.png" alt="LaChart" className="h-6 w-6 object-contain" />
          <span className="text-base font-bold text-primary tracking-tight">LaChart</span>
        </div>

        {/* Right side: bell + avatar */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <button
            onClick={onBellTap}
            style={{ touchAction: 'manipulation' }}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl active:bg-gray-100"
          >
            <Icon
              d={ICONS.bell}
              size={22}
              stroke={unreadCount > 0 ? 'var(--color-primary, #6366f1)' : '#9ca3af'}
              strokeWidth={unreadCount > 0 ? 2.2 : 1.8}
            />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile avatar */}
          <button
            onClick={onProfileTap}
            style={{ touchAction: 'manipulation' }}
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
      </div>
    </div>
  );
}

// ─── Coach Athlete Bar ─────────────────────────────────────────────────────────
function NativeAthleteBar({ coach, athletes, effectiveAthleteId, onSelect, statuses, onNavigateManage }) {
  const hasAthletes = athletes && athletes.length > 0;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('coachAthleteBarCollapsed') === 'true'; } catch { return false; }
  });
  const touchStartY = useRef(null);

  const toggleCollapsed = (val) => {
    const next = val !== undefined ? val : !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('coachAthleteBarCollapsed', String(next)); } catch {}
  };

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (dy > 24) toggleCollapsed(true);
    else if (dy < -24) toggleCollapsed(false);
    touchStartY.current = null;
  };

  /* ── Collapsed: icon-only strip ── */
  if (collapsed) {
    return (
      <div className="flex-shrink-0 bg-white border-b border-gray-100"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex items-center gap-1 px-3 py-1.5">
          {/* Me */}
          {coach && (
            <button onClick={() => onSelect(String(coach._id))}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className={`flex-shrink-0 relative rounded-full ${effectiveAthleteId === String(coach._id) ? 'ring-2 ring-primary/50' : ''}`}>
              <img src={getAvatarBySportAndGender(coach)} alt="Me"
                className={`w-6 h-6 rounded-full border ${effectiveAthleteId === String(coach._id) ? 'border-primary' : 'border-transparent'}`}
                onError={e => { e.currentTarget.src = '/images/coach-avatar.webp'; }} />
            </button>
          )}

          {hasAthletes && <div className="w-px h-4 bg-gray-200 flex-shrink-0 mx-0.5" />}

          {/* Athlete icons */}
          <div className="flex items-center gap-1 flex-1 overflow-hidden"
            style={{ overflowX: 'auto', scrollbarWidth: 'none', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}>
            {hasAthletes && athletes.map(a => {
              const isSelected = effectiveAthleteId === String(a._id);
              const dot = statusColor(statuses?.[a._id]);
              return (
                <button key={a._id} onClick={() => onSelect(String(a._id))}
                  style={{ touchAction: 'manipulation', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}
                  className={`relative rounded-full ${isSelected ? 'ring-2 ring-violet-300' : ''}`}>
                  <img src={getAvatarBySportAndGender(a)} alt={a.name}
                    className={`w-6 h-6 rounded-full border ${isSelected ? 'border-violet-400' : 'border-transparent'}`} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white" style={{ background: dot }} />
                </button>
              );
            })}
          </div>

          {/* Manage + expand chevron */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {onNavigateManage && (
              <button onClick={onNavigateManage}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className="text-[10px] text-gray-400 font-medium whitespace-nowrap">Manage →</button>
            )}
            <button onClick={() => toggleCollapsed(false)}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className="p-0.5 text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Expanded ── */
  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-100"
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Top row: manage + collapse */}
      <div className="flex items-center justify-end px-3 pt-1.5 gap-1">
        {onNavigateManage && (
          <button onClick={onNavigateManage}
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            className="text-xs text-gray-400 font-medium">Manage →</button>
        )}
        <button onClick={() => toggleCollapsed(true)}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className="p-0.5 text-gray-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* Avatar chips row */}
      <div
        className="flex gap-1.5 px-3 pb-2"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          touchAction: 'pan-x',
        }}
      >
        {/* "Me" chip */}
        {coach && (() => {
          const isMeSelected = effectiveAthleteId === String(coach._id);
          return (
            <>
              <button onClick={() => onSelect(String(coach._id))}
                style={{ touchAction: 'manipulation', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${isMeSelected ? 'bg-primary/10' : ''}`}
              >
                <div className="relative">
                  <img src={getAvatarBySportAndGender(coach)} alt="Me"
                    className={`w-9 h-9 rounded-full border-2 ${isMeSelected ? 'border-primary' : 'border-transparent'}`}
                    onError={e => { e.currentTarget.src = '/images/coach-avatar.webp'; }} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary border-2 border-white flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 20 20" fill="white">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
                <span className={`text-[9px] font-semibold truncate max-w-[48px] ${isMeSelected ? 'text-primary' : 'text-gray-600'}`}>
                  {coach.name || 'Me'}
                </span>
              </button>
              {hasAthletes && <div className="w-px self-stretch bg-gray-200 my-1 flex-shrink-0" />}
            </>
          );
        })()}

        {/* Athlete chips */}
        {hasAthletes && athletes.map((a) => {
          const isSelected = effectiveAthleteId === String(a._id);
          const dot = statusColor(statuses?.[a._id]);
          return (
            <button key={a._id} onClick={() => onSelect(String(a._id))}
              style={{ touchAction: 'manipulation', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${isSelected ? 'bg-violet-50' : ''}`}
            >
              <div className="relative">
                <img src={getAvatarBySportAndGender(a)} alt=""
                  className={`w-9 h-9 rounded-full border-2 ${isSelected ? 'border-violet-400' : 'border-transparent'}`} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white" style={{ background: dot }} />
              </div>
              <span className={`text-[9px] font-medium truncate max-w-[48px] ${isSelected ? 'text-violet-700' : 'text-gray-500'}`}>
                {a.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bottom Tab Bar ────────────────────────────────────────────────────────────
function NativeBottomTabBar({ tabs }) {
  const location = useLocation();

  return (
    <div
      data-native-bar="bottom"
      className="nl-bottom-bar flex-shrink-0"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'rgba(255,255,255,.85)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        borderTop: '1px solid rgba(118,126,181,.14)',
      }}
    >
      {/* Local keyframes for the active pill pop-in */}
      <style>{`
        @keyframes ndTabPop {
          from { opacity: 0; transform: scale(.6); }
          60%  { opacity: 1; transform: scale(1.05); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes ndTabIconPop {
          from { transform: translateY(2px) scale(.92); }
          to   { transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="flex" style={{ height: 56, padding: '4px 6px' }}>
        {tabs.map((tab) => {
          const isActive = (() => {
            const p = location.pathname;
            if (tab.key === 'dashboard')       return p === '/' || p.startsWith('/dashboard');
            if (tab.key === 'calendar')        return p.startsWith('/training-calendar');
            if (tab.key === 'athletes')        return p.startsWith('/athletes');
            if (tab.key === 'testing')         return p.startsWith('/testing');
            // Use exact match or /training/ prefix — NOT startsWith('/training') alone
            // because '/training-calendar' also starts with '/training'.
            if (tab.key === 'training')        return p === '/training' || p.startsWith('/training/');
            if (tab.key === 'lactate-testing') return p.startsWith('/lactate-testing');
            if (tab.key === 'admin')           return p.startsWith('/admin');
            return p === tab.path;
          })();
          return (
            <NavLink
              key={tab.key}
              to={tab.path}
              style={{
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
                transition: 'transform .14s ease',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
              onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
              onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
              onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
              onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
              // Re-tapping the active tab dispatches `nl-tab-reclicked` — pages
              // can listen for it (e.g. Calendar scrolls back to today, Dashboard
              // scrolls to top). Without this, React Router swallows the click.
              onClick={() => {
                if (isActive) {
                  window.dispatchEvent(new CustomEvent('nl-tab-reclicked', {
                    detail: { key: tab.key, path: tab.path },
                  }));
                }
              }}
              className="flex-1 flex items-center justify-center"
            >
              {/* Minimal stack: icon + label, with a subtle dot under the label when active */}
              <div
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  position: 'relative',
                }}
              >
                {/* Icon */}
                <span
                  style={{
                    color: isActive ? '#5E6590' : '#9CA3AF',
                    transition: 'color .25s ease',
                  }}
                >
                  <Icon d={tab.icon} size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>

                {/* Label */}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    lineHeight: 1,
                    color: isActive ? '#5E6590' : '#9CA3AF',
                    transition: 'color .25s ease, font-weight .25s ease',
                  }}
                >
                  {tab.label}
                </span>

                {/* Tiny indicator dot below the label — only when active */}
                <span
                  style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: '#5E6590',
                    marginTop: 2,
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? 'scale(1)' : 'scale(0)',
                    transition: 'opacity .2s ease, transform .25s cubic-bezier(.22,1.5,.36,1)',
                  }}
                />
              </div>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

// ─── Profile Sheet ─────────────────────────────────────────────────────────────
function NativeProfileSheet({ open, onClose, user, logout, navigate }) {
  const isAdmin = user?.role === 'admin' || user?.admin === true;
  const go = (path) => { onClose(); navigate(path); };

  const items = [
    { label: 'Profile',  icon: ICONS.profile,  path: '/profile' },
    { label: 'Settings', icon: ICONS.settings, path: '/settings' },
    { label: 'Support',  icon: ICONS.support,  path: '/support' },
    ...(isAdmin ? [
      { label: 'Lactate Testing', icon: ICONS.lactate, path: '/lactate-testing' },
      { label: 'Admin Dashboard', icon: ICONS.admin,   path: '/admin' },
    ] : []),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* User info */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20 flex-shrink-0">
                {user && <img src={getAvatarBySportAndGender(user)} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{user?.name} {user?.surname}</p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                <p className="text-xs text-primary capitalize mt-0.5">{user?.role}{isAdmin ? ' · Admin' : ''}</p>
              </div>
            </div>

            {/* Nav items */}
            <div className="py-2">
              {items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => go(item.path)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-full flex items-center gap-4 px-5 py-3.5 active:bg-gray-50 text-gray-800"
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
                style={{ touchAction: 'manipulation' }}
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
  const { user, logout, isAuthenticated } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  // Routes that take over the entire viewport — top bar, athlete bar, and
  // bottom tab bar all hide. Anything that needs to feel like a dedicated
  // session (live workout execution, future video playback) goes here.
  const isImmersiveRoute = /^\/workout-execution(\/|$)/.test(location.pathname);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs]     = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);

  const unreadCount = notifs.filter(n => !n.read).length;

  // Fetch notifications
  // Track the IDs of strava_import notifications we've already acted on so
  // that the 60-second polling loop doesn't fire stravaSyncComplete repeatedly
  // for the same notification.
  const seenStravaNotifIds = useRef(new Set());
  // true after the first loadNotifs call — prevents treating old notifications as "new"
  const notifsInitialized = useRef(false);

  const loadNotifs = useCallback(async () => {
    if (!isAuthenticated) return;
    setNotifsLoading(true);
    try {
      const r = await getNotifications();
      const fresh = r.data || [];
      setNotifs(fresh);

      if (!notifsInitialized.current) {
        // First load — just seed the seen-set with existing notifications so
        // the next poll can detect truly new ones without false-firing.
        fresh.forEach(n => {
          const rt = String(n.resourceType || '').toLowerCase();
          if (rt === 'strava_import' || rt === 'strava') {
            seenStravaNotifIds.current.add(String(n._id));
          }
        });
        notifsInitialized.current = true;
      } else {
        // Subsequent polls — detect newly-arrived strava_import notifications.
        // This covers the background-webhook path: webhook saved the activity
        // while app was backgrounded, user reopens → poll finds unread notif.
        const newStravaNotif = fresh.find(n => {
          const rt = String(n.resourceType || '').toLowerCase();
          return (rt === 'strava_import' || rt === 'strava') &&
                 !seenStravaNotifIds.current.has(String(n._id));
        });
        if (newStravaNotif) {
          window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: { source: 'notif_poll' } }));
        }
        fresh.forEach(n => {
          const rt = String(n.resourceType || '').toLowerCase();
          if (rt === 'strava_import' || rt === 'strava') {
            seenStravaNotifIds.current.add(String(n._id));
          }
        });
      }
    } catch {}
    setNotifsLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadNotifs();
    const t = setInterval(loadNotifs, 60000);
    const onPush = (e) => {
      loadNotifs();
      // Show in-app toast for foreground push notifications
      const notif = e?.detail;
      const title = notif?.title || notif?.data?.title;
      const body = notif?.body || notif?.data?.body;
      if (body) {
        addNotification(body, 'info');
      } else if (title) {
        addNotification(title, 'info');
      }
      // Strava import push → tell dashboard to reload activities
      const notifType = notif?.data?.type || notif?.type;
      if (notifType === 'strava_import' || notifType === 'strava') {
        window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: { source: 'push' } }));
      }
    };
    window.addEventListener('pushNotificationReceived', onPush);
    return () => { clearInterval(t); window.removeEventListener('pushNotificationReceived', onPush); };
  }, [isAuthenticated, loadNotifs, addNotification]);

  // Auto-mark all read 1.5s after opening the sheet
  const handleBellTap = () => {
    setShowNotifs(true);
    if (unreadCount > 0) {
      setTimeout(async () => {
        try {
          await markAllNotificationsRead();
          setNotifs(prev => prev.map(n => ({ ...n, read: true })));
        } catch {}
      }, 1500);
    }
  };

  const handleNotifClick = async (n) => {
    if (!n.read) {
      try { await markNotificationRead(n._id); } catch {}
      setNotifs(prev => prev.map(x => x._id === n._id ? { ...x, read: true } : x));
    }
    setShowNotifs(false);
    if (!n.resourceId) return; // no resource — just close the sheet
    const rt = String(n.resourceType || '').toLowerCase();
    let target;
    if (rt === 'strava' || rt === 'strava_import') target = `strava-${n.resourceId}`;
    else if (rt === 'fit') target = `fit-${n.resourceId}`;
    else if (rt === 'training') target = `training-${n.resourceId}`;
    else target = String(n.resourceId);
    // Navigate to /dashboard?openActivity=… so the native dashboard opens the
    // activity sheet — avoids pushing the web FitAnalysisPage (which uses the
    // non-native Layout and breaks the native tab bar).
    navigate(`/dashboard?openActivity=${encodeURIComponent(target)}`);
  };

  const handleNotifDelete = async (id) => {
    try {
      await deleteNotification(id);
      setNotifs(prev => prev.filter(n => n._id !== id));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const handleClearAllNotifs = async () => {
    // Optimistic: clear the UI immediately so the empty-state appears
    // even before the network round-trip lands. If the API call fails
    // we restore the list so the user can retry.
    const prevSnapshot = notifs;
    setNotifs([]);
    try {
      await clearAllNotifications();
    } catch (e) {
      console.error('[Notifs] clear-all failed, restoring:', e);
      setNotifs(prevSnapshot);
    }
  };

  // Lock html/body scroll — WKWebView ignores overflow:hidden on a div
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.width = '';
    };
  }, []);

  // ── Strava auto-sync on app open / foreground ──────────────────────────
  // Fires on every new session (login / app launch) using sessionStorage so
  // the 15-min localStorage cooldown doesn't block it after a fresh login.
  // Subsequent foreground events within the same session use 15-min cooldown.
  useEffect(() => {
    if (!user?._id) return undefined;
    const hasStrava = !!(user?.strava?.autoSync && user?.strava?.accessToken);
    if (!hasStrava) return undefined;

    let cancelled = false;

    const runStrava = async (cooldownMs) => {
      const lsKey = `strava_auto_sync_${user._id}`;
      const now   = Date.now();
      const last  = localStorage.getItem(lsKey);
      if (cooldownMs != null && last && now - parseInt(last, 10) < cooldownMs) return;
      try {
        const result = await autoSyncStravaActivities({ force: false });
        localStorage.setItem(lsKey, now.toString());
        if (result?.imported > 0 || result?.updated > 0) {
          console.log(`[Strava] auto-sync: ${result.imported} imported, ${result.updated} updated`);
          window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: result }));
        }
      } catch (err) {
        console.log('[NativeLayout] Strava auto-sync failed:', err?.message || err);
      }
    };

    // On app launch / login: sessionStorage resets each new session so this
    // fires on every login regardless of when the last sync was.
    const sessionKey = `strava_session_synced_${user._id}`;
    const t = setTimeout(() => {
      if (cancelled) return;
      const alreadyThisSession = sessionStorage.getItem(sessionKey);
      sessionStorage.setItem(sessionKey, '1');
      runStrava(alreadyThisSession ? 15 * 60 * 1000 : 2 * 60 * 1000);
    }, 3000);

    // App comes back to foreground:
    //  • Always refresh the calendar from our DB (cheap — no Strava API call)
    //  • Strava API sync uses the 15-min cooldown so we don't burn quota
    let capacitorHandle = null;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || cancelled) return;
        // Reload calendar immediately — server already has any webhook-saved activity
        window.dispatchEvent(new CustomEvent('stravaSyncComplete', { detail: { source: 'foreground' } }));
        // Also run Strava API sync (with cooldown) to catch anything missed
        runStrava(15 * 60 * 1000);
      }).then(h => { capacitorHandle = h; });
    }).catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(t);
      capacitorHandle?.remove?.();
    };
  }, [user?._id, user?.strava?.autoSync, user?.strava?.accessToken]);

  // Create modal portal root as a sibling of the NativeLayout container so it
  // sits in the same stacking context as body and above the bottom tab bar.
  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'app-modal-root';
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '99999',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    return () => { if (el.parentNode) el.parentNode.removeChild(el); };
  }, []);

  const isCoach = isCoachRole(user);
  const tabs = getTabsForRole(user, effectiveAthleteId);

  return (
    // position:fixed + inset:0 is the ONLY reliable full-screen in Capacitor.
    // 100dvh / 100vh / 100% all have WKWebView quirks.
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#f9fafb',
      overflow: 'hidden',
    }}>
      {/* Top bar — hidden on immersive routes so the page can use full height */}
      {!isImmersiveRoute && (
        <NativeTopBar
          user={user}
          onProfileTap={() => setShowProfile(true)}
          onBellTap={handleBellTap}
          unreadCount={unreadCount}
        />
      )}

      {/* Coach athlete selector — hidden on immersive routes */}
      {!isImmersiveRoute && isCoach && (
        <NativeAthleteBar
          coach={user}
          athletes={athletes}
          effectiveAthleteId={effectiveAthleteId}
          onSelect={onAthleteSelect}
          statuses={athleteStatuses}
          onNavigateManage={() => navigate('/athletes')}
        />
      )}

      {/* Active workout banner — appears on any non-execution route while
          a workout session is live. Inline (not fixed) so it shifts the
          content area down naturally inside the fixed shell. */}
      {!isImmersiveRoute && <ActiveWorkoutBar />}

      {/* Scrollable page content — flex-1 fills remaining space exactly.
          On immersive routes, drop overflow so the page can position-fixed
          properly without competing with this scroller. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: isImmersiveRoute ? 'hidden' : 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <Outlet />
      </div>

      {/* Bottom tab bar — hidden on immersive routes (live workout) */}
      {!isImmersiveRoute && <NativeBottomTabBar tabs={tabs} />}

      {/* Profile sheet */}
      <NativeProfileSheet
        open={showProfile}
        onClose={() => setShowProfile(false)}
        user={user}
        logout={logout}
        navigate={navigate}
      />

      {/* Notifications sheet */}
      <NativeNotificationsSheet
        open={showNotifs}
        onClose={() => setShowNotifs(false)}
        notifs={notifs}
        loading={notifsLoading}
        onNotifClick={handleNotifClick}
        onDelete={handleNotifDelete}
        onMarkAllRead={handleMarkAllRead}
        onClearAll={handleClearAllNotifs}
      />

    </div>
  );
};

export default NativeLayout;
