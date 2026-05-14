import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';
import { BellAlertIcon } from '@heroicons/react/24/solid';
import { getNotifications, markAllNotificationsRead, markNotificationRead, deleteNotification } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import NotifIcon from '../Notifications/NotifIcon';

export default function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef(null);
  const navigate = useNavigate();

  const unreadCount = notifs.filter(n => !n.read).length;

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const r = await getNotifications();
      setNotifs(r.data || []);
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
    const t = setInterval(load, 60000);
    // Reload when a push notification arrives in foreground (dispatched by initCapacitorShell)
    const onPush = () => load();
    window.addEventListener('pushNotificationReceived', onPush);
    return () => {
      clearInterval(t);
      window.removeEventListener('pushNotificationReceived', onPush);
    };
  }, [isAuthenticated, load]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (!open && unreadCount > 0) {
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
    setOpen(false);
    // Route by resourceType so the calendar route resolver opens the right
    // modal: strava-<id> → ActivityFullModal for Strava, fit-<id> for FIT,
    // training-<id> for Training collection records. The bare id form is
    // kept as a final fallback in case older notifications still arrive
    // without an explicit type.
    if (!n.resourceId) {
      navigate('/training-calendar');
      return;
    }
    const rt = String(n.resourceType || '').toLowerCase();
    let target;
    if (rt === 'strava' || rt === 'strava_import') {
      target = `strava-${n.resourceId}`;
    } else if (rt === 'fit') {
      target = `fit-${n.resourceId}`;
    } else if (rt === 'training') {
      target = `training-${n.resourceId}`;
    } else {
      target = String(n.resourceId);
    }
    navigate(`/training-calendar/${encodeURIComponent(target)}`);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifs(prev => prev.filter(n => n._id !== id));
    } catch {}
  };

  const fmtTime = (d) => {
    const now = Date.now();
    const diff = now - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={handleOpen}
        className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        {unreadCount > 0
          ? <BellAlertIcon className="h-6 w-6 text-primary" />
          : <BellIcon className="h-6 w-6 text-gray-500" />
        }
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[9999] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {notifs.length > 0 && (
              <button
                onClick={async () => {
                  try { await markAllNotificationsRead(); setNotifs(prev => prev.map(n => ({ ...n, read: true }))); } catch {}
                }}
                className="text-[11px] text-primary hover:text-primary-dark font-medium"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {loading && notifs.length === 0 && (
              <div className="py-8 text-center text-xs text-gray-400">Loading…</div>
            )}
            {!loading && notifs.length === 0 && (
              <div className="py-8 text-center text-xs text-gray-400">No notifications</div>
            )}
            {notifs.map(n => (
              <div
                key={n._id}
                onClick={() => handleNotifClick(n)}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors group ${!n.read ? 'bg-primary/5' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${!n.read ? 'bg-primary/10' : 'bg-gray-100'}`}>
                  <NotifIcon type={n.type} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{n.title}</p>
                  <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">{n.body}</p>
                  {n.fromName && <p className="text-[10px] text-gray-400 mt-0.5">from {n.fromName}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{fmtTime(n.createdAt)}</p>
                </div>
                {!n.read && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />}
                <button
                  onClick={(e) => handleDelete(e, n._id)}
                  className="hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 flex-shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
