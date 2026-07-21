import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';

const NotificationContext = createContext();

// Per-type accent used for the leading icon chip. The card itself stays a
// clean white surface so the message is always readable and never looks like
// a heavy colored block over the header.
const TYPE_STYLES = {
  success: { icon: CheckCircleIcon, accent: '#10b981', tint: '#ecfdf5' },
  error: { icon: XCircleIcon, accent: '#f43f5e', tint: '#fef2f2' },
  warning: { icon: ExclamationTriangleIcon, accent: '#f59e0b', tint: '#fffbeb' },
  info: { icon: InformationCircleIcon, accent: '#2196F3', tint: '#eff6ff' },
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

/** Deduplicate window: same message shown within this many ms → suppressed */
const DEDUP_MS = 5000;

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  // Track last-shown timestamp per message for deduplication
  const recentRef = useRef(new Map());

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((message, type = 'success', options = null) => {
    const now = Date.now();
    const last = recentRef.current.get(message);
    // Suppress identical messages shown within DEDUP_MS
    if (last && now - last < DEDUP_MS) return;
    recentRef.current.set(message, now);

    const id = now + Math.random();
    const openActivity = options?.openActivity ? String(options.openActivity) : null;
    const openPlanned = options?.openPlanned ? String(options.openPlanned) : null;
    setNotifications((prev) => [...prev, { id, message, type, openActivity, openPlanned }]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 4000);
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{ addNotification, removeNotification }}>
      {children}
      <div
        className="fixed inset-x-0 z-[10000] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <AnimatePresence>
          {notifications.map((notification) => {
            const cfg = TYPE_STYLES[notification.type] || TYPE_STYLES.info;
            const Icon = cfg.icon;
            const clickable = Boolean(notification.openActivity || notification.openPlanned);
            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: -24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                onClick={() => {
                  if (notification.openPlanned) {
                    try {
                      window.dispatchEvent(new CustomEvent('openPlannedRequest', {
                        detail: { id: notification.openPlanned },
                      }));
                    } catch { /* ignore */ }
                  } else if (notification.openActivity) {
                    try {
                      window.dispatchEvent(new CustomEvent('openActivityRequest', {
                        detail: { id: notification.openActivity },
                      }));
                    } catch { /* ignore */ }
                  }
                  removeNotification(notification.id);
                }}
                className="pointer-events-auto flex items-center gap-3 w-full max-w-sm"
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(12px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 14,
                  padding: '10px 14px 10px 10px',
                  boxShadow: '0 8px 24px -8px rgba(10,14,26,0.18), 0 2px 6px -2px rgba(10,14,26,0.10)',
                  cursor: clickable ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 30, height: 30, borderRadius: 9, background: cfg.tint }}
                >
                  <Icon style={{ width: 19, height: 19, color: cfg.accent }} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', lineHeight: 1.35, flex: 1 }}>
                  {notification.message}
                </span>
                {clickable && (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}>
                    <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}; 