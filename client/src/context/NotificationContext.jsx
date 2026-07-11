import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '../styles/theme';

const NotificationContext = createContext();

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
        className="fixed right-4 z-[10000] flex flex-col gap-2 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 16 }}
      >
        <AnimatePresence>
          {notifications.map((notification) => {
            let styleObj = {};
            if (notification.type === 'success') {
              styleObj = {
                background: COLORS.primary.main,
                border: `2px solid ${COLORS.primary.dark}`,
                color: '#fff',
              };
            } else if (notification.type === 'error') {
              styleObj = {
                background: '#f87171',
                border: '2px solid #dc2626',
                color: '#fff',
              };
            } else if (notification.type === 'warning') {
              styleObj = {
                background: '#fb923c',
                border: '2px solid #ea580c',
                color: '#fff',
              };
            } else {
              styleObj = {
                background: COLORS.primary.light,
                border: `2px solid ${COLORS.primary.main}`,
                color: COLORS.primary.main,
              };
            }
            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.2 }}
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
                style={{
                  ...styleObj,
                  borderRadius: '0.75rem', // rounded-lg
                  padding: '1rem', // p-4
                  fontWeight: 500, // font-medium
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  pointerEvents: 'auto',
                  fontFamily: 'inherit',
                  cursor: (notification.openActivity || notification.openPlanned) ? 'pointer' : 'default',
                }}
              >
                {notification.message}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}; 