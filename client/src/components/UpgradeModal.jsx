import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { isCapacitorNative } from '../utils/isNativeApp';
import { trackCheckoutStarted } from '../utils/analytics';
import {
  ATHLETE_PLAN_PRICE_LABEL,
  COACH_PLAN_PRICE_LABEL,
} from '../constants/planPricing';
import { createCheckoutSession } from '../services/api';
import { useAuth } from '../context/AuthProvider';

const SWIPE_THRESHOLD = 80;
const SWIPE_VEL_THRESHOLD = 400;

const PLAN_DETAILS = {
  pro: {
    name: 'Athlete',
    price: ATHLETE_PLAN_PRICE_LABEL,
    color: 'from-primary to-primary/80',
    features: [
      'Unlimited lactate tests',
      'Plan workouts in the calendar',
      'Start trainings from the app',
      'Connect to your smart trainer',
      'Advanced analytics & charts',
      'PDF export of test reports',
      'Priority support',
    ],
  },
  coach: {
    name: 'Coach',
    price: COACH_PLAN_PRICE_LABEL,
    color: 'from-purple-600 to-purple-500',
    features: [
      'Unlimited athletes',
      'Plan workouts for your athletes',
      'Unlimited PDF report generation',
      'PDF branding — your logo, title & address',
      'Coach dashboard & overview',
      'Everything in Athlete',
    ],
  },
};

function useNativeModalScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const scrollEl = document.getElementById('nl-content-scroll');
    const prevScroll = scrollEl?.style.overflow;
    if (scrollEl) scrollEl.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      if (scrollEl) scrollEl.style.overflow = prevScroll ?? '';
    };
  }, [active]);
}

function useSwipeDismiss(onClose) {
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);

  const triggerClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setDragY(0);
    setTimeout(() => {
      setClosing(false);
      onClose?.();
    }, 280);
  }, [closing, onClose]);

  const reset = useCallback(() => {
    setClosing(false);
    setDragY(0);
  }, []);

  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setDragY(0);
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    if (dy > 0) {
      setDragY(dy);
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dt = (Date.now() - touchStartTimeRef.current) / 1000;
    const vel = dt > 0 ? dragY / dt : 0;
    if (dragY > SWIPE_THRESHOLD || vel > SWIPE_VEL_THRESHOLD) {
      triggerClose();
    } else {
      setDragY(0);
    }
  };

  return {
    dragY,
    closing,
    triggerClose,
    reset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

/**
 * UpgradeModal
 *
 * Props:
 *   isOpen       — boolean
 *   onClose      — () => void
 *   feature      — string  e.g. "FIT Training Analysis"
 *   requiredPlan — 'pro' | 'coach'  (default 'pro')
 */
export default function UpgradeModal({ isOpen, onClose, feature = 'This feature', requiredPlan = 'pro' }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const plan = PLAN_DETAILS[requiredPlan] || PLAN_DETAILS.pro;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isNative = isCapacitorNative();

  const swipe = useSwipeDismiss(onClose);
  useNativeModalScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) swipe.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when sheet opens
  }, [isOpen]);

  if (!isOpen && !swipe.closing) return null;

  const handleUpgrade = async () => {
    if (!isAuthenticated) {
      onClose();
      navigate(`/signup?plan=${encodeURIComponent(requiredPlan)}`);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      trackCheckoutStarted(requiredPlan, 'upgrade_modal');
      const { url } = await createCheckoutSession(requiredPlan);
      if (url) {
        window.location.href = url;
        return;
      }
      onClose();
      navigate('/settings?tab=subscription');
    } catch (err) {
      console.error('UpgradeModal checkout error:', err);
      const debug = err?.response?.data?.debug;
      const msg = debug?.hint || debug?.message || err?.response?.data?.message ||
                  err?.response?.data?.error || err?.message || 'Checkout failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const modalRoot = (typeof document !== 'undefined' && document.getElementById('app-modal-root'))
    || (typeof document !== 'undefined' ? document.body : null);
  if (!modalRoot) return null;

  if (isNative) {
    const sheetTransform = swipe.dragY > 0
      ? `translateY(${swipe.dragY}px)`
      : swipe.closing
        ? 'translateY(100%)'
        : 'translateY(0)';

    return ReactDOM.createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483646,
          pointerEvents: 'auto',
        }}
      >
        <div
          onClick={swipe.triggerClose}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `rgba(0,0,0,${swipe.dragY > 0 ? Math.max(0.12, 0.45 - swipe.dragY / 400).toFixed(2) : '0.45'})`,
            WebkitBackdropFilter: 'blur(4px)',
            backdropFilter: 'blur(4px)',
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            inset: 0,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            transform: sheetTransform,
            transition: swipe.dragY > 0 ? 'none' : 'transform .28s cubic-bezier(.4,0,.2,1)',
            fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          }}
        >
          <div
            onTouchStart={swipe.handleTouchStart}
            onTouchMove={swipe.handleTouchMove}
            onTouchEnd={swipe.handleTouchEnd}
            style={{ padding: '10px 0 4px', touchAction: 'none', flexShrink: 0 }}
          >
            <div style={{ width: 44, height: 5, borderRadius: 999, background: '#d1d5db', margin: '0 auto' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(59,130,246,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <LockClosedIcon style={{ width: 18, height: 18, color: '#2563eb' }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Premium feature
                </p>
                <h2 id="upgrade-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>
                  {feature}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={swipe.triggerClose}
              aria-label="Close"
              style={{
                width: 32, height: 32, borderRadius: 999, border: 'none',
                background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <XMarkIcon style={{ width: 18, height: 18, color: '#6b7280' }} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 20px' }}>
            <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, color: '#4b5563' }}>
              This is included with <strong style={{ color: '#111827' }}>LaChart {plan.name}</strong>.
              If you already have access from your account on lachart.net, make sure you&apos;re signed in here with the same email.
            </p>

            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              What&apos;s included
            </p>
            <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none' }}>
              {plan.features.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, fontSize: 14, color: '#374151' }}>
                  <SparklesIcon style={{ width: 16, height: 16, color: '#2563eb', flexShrink: 0, marginTop: 2 }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#9ca3af' }}>
              Subscriptions are managed outside the iOS app. Apple In-App Purchase is not used for LaChart plans.
            </p>
          </div>

          <div style={{ padding: '12px 20px 16px', flexShrink: 0, borderTop: '1px solid #f3f4f6' }}>
            <button
              type="button"
              onClick={swipe.triggerClose}
              className="w-full py-3 rounded-xl text-sm font-semibold text-gray-700"
              style={{ background: '#f3f4f6' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      modalRoot
    );
  }

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ pointerEvents: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[min(90vh,640px)] flex flex-col">

        <div className={`bg-gradient-to-br ${plan.color} px-6 pt-6 pb-5 text-white shrink-0`}>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <XMarkIcon className="w-4 h-4 text-white" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <LockClosedIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Premium feature</p>
              <h2 className="text-lg font-bold leading-tight">{feature}</h2>
            </div>
          </div>

          <p className="text-white/80 text-sm">
            Unlock this with <span className="font-semibold text-white">LaChart {plan.name}</span> — start with 2 months free, no charge today.
          </p>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <div className="flex items-end gap-1 mb-3">
            <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
            <span className="text-gray-400 text-sm mb-1">/ month after 2-month free trial</span>
          </div>

          <ul className="space-y-1.5 mb-5">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                <SparklesIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-wait"
          >
            {loading ? 'Redirecting to checkout…' : `🎁 Try ${plan.name} free for 2 months`}
          </button>
          {error && (
            <p className="mt-2 text-xs text-red-600 text-center">
              {error}{' '}
              <button
                type="button"
                onClick={() => { onClose(); navigate('/settings?tab=subscription'); }}
                className="underline hover:text-red-700"
              >
                Go to subscription settings
              </button>
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
}
