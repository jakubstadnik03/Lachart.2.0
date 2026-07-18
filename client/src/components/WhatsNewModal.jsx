import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  XMarkIcon,
  SparklesIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  PlayCircleIcon,
} from '@heroicons/react/24/outline';
import { getIntegrationStatus } from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { WHATS_NEW_SLIDES, RELEASE_TAG } from '../content/whatsNewSlides';

/**
 * What's New — step-through tour. Screenshots as fallback until you upload
 * MP4s to public/videos/whats-new/ and flip WHATS_NEW_VIDEOS_READY.
 * Recording guide: public/videos/whats-new/NATOČENÍ.md
 */

/** Screenshot or muted loop video inside a 16:10 frame. */
function SlideMedia({ item }) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setVideoFailed(false);
    const v = videoRef.current;
    if (!v || !item.video || videoFailed) return undefined;
    v.load();
    const play = () => { v.play().catch(() => {}); };
    play();
    return () => { v.pause(); };
  }, [item.video, item.title, videoFailed]);

  const showVideo = item.video && !videoFailed;
  const poster = item.image || item.poster;

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-gray-200/80 bg-gray-950 shadow-lg"
      // Height capped to the viewport (not a fixed 16:10 ratio) so the whole
      // slide — media + title + bullets + Next — fits on one screen on a
      // laptop instead of scrolling. object-cover crops the media to fit.
      style={{ height: 'clamp(180px, 32vh, 340px)' }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 20% 20%, ${item.accent}55, transparent 55%), radial-gradient(circle at 80% 80%, ${item.accent}33, transparent 50%)`,
        }}
      />

      {showVideo ? (
        <video
          ref={videoRef}
          key={item.video}
          className="relative z-[1] w-full h-full object-cover object-top"
          src={item.video}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onError={() => setVideoFailed(true)}
        />
      ) : poster ? (
        <img
          src={poster}
          alt=""
          className="relative z-[1] w-full h-full object-cover object-top"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className="relative z-[1] flex h-full w-full items-center justify-center"
          style={{ backgroundColor: `${item.accent}18` }}
        >
          <item.icon className="h-16 w-16 opacity-80" style={{ color: item.accent }} strokeWidth={1.4} />
        </div>
      )}

      {item.video && !videoFailed && (
        <div className="pointer-events-none absolute bottom-2.5 right-2.5 z-[2] flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <PlayCircleIcon className="h-3.5 w-3.5" />
          Demo
        </div>
      )}

      {!item.video && item.videoId && (
        <div className="pointer-events-none absolute top-2.5 right-2.5 z-[2] rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
          Screenshot
        </div>
      )}

      {item.mediaCaption && (
        <div className="absolute bottom-0 left-0 right-0 z-[2] bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
          <p className="text-[11px] font-medium text-white/90">{item.mediaCaption}</p>
        </div>
      )}
    </div>
  );
}

/**
 * mode:
 *   'whatsnew' — release-notes framing, shown once per RELEASE_TAG.
 *   'tour'     — same deck framed as a full feature tour for fresh signups
 *                ("here is everything LaChart can do"), shown once per user.
 */
export default function WhatsNewModal({ open, onClose, userName, mode = 'whatsnew' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCoach = ['coach', 'tester', 'testing'].includes(user?.role);
  const [step, setStep] = useState(0);
  const touchStart = useRef(null);

  const [stravaConnected, setStravaConnected] = useState(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await getIntegrationStatus({ timeout: 6000 });
        if (!cancelled) setStravaConnected(Boolean(status?.stravaConnected));
      } catch {
        if (!cancelled) setStravaConnected(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const visibleItems = WHATS_NEW_SLIDES.filter((it) => {
    if (it.stravaOnly && stravaConnected !== false) return false;
    if (it.coachOnly && !isCoach) return false;
    return true;
  });
  const total = visibleItems.length;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  useEffect(() => {
    if (step >= total) setStep(0);
  }, [total, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(total - 1, s + 1));
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, total]);

  if (!open) return null;
  if (total === 0) return null;

  const current = visibleItems[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const goNext = () => {
    if (isLast) onClose?.();
    else setStep((s) => Math.min(total - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const handleCtaClick = () => {
    const href = current.href;
    onClose?.();
    if (href.startsWith('http')) {
      window.location.href = href;
    } else {
      navigate(href);
    }
  };

  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 48) {
      if (diff > 0) goNext();
      else if (!isFirst) goPrev();
    }
    touchStart.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[11500] flex items-start sm:items-start justify-center pt-[56px] sm:pt-[72px] px-3 sm:px-4 pb-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />

      <div className="relative flex w-full max-w-xl sm:max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[min(92vh,820px)]">
        <div
          className="flex-shrink-0 border-b border-gray-100 px-5 py-4 sm:px-6"
          style={{ background: `linear-gradient(135deg, ${current.accent}12, ${current.accent}04)` }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <SparklesIcon className="h-4 w-4 flex-shrink-0" style={{ color: current.accent }} />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {mode === 'tour'
                    ? `Welcome${userName ? `, ${userName}` : ''} — what LaChart can do`
                    : `What's new${userName ? ` · ${userName}` : ''}`}
                </p>
              </div>
              <p className="text-xs text-gray-400">{step + 1} of {total}</p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 rounded-full bg-white/80 p-1.5 shadow-sm transition-colors hover:bg-white"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div
          key={step}
          className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6 animate-[fadeInUp_.35s_ease]"
        >
          <SlideMedia item={current} />

          <div className="mt-5">
            <span
              className="inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: current.accent,
                borderColor: `${current.accent}35`,
                backgroundColor: `${current.accent}10`,
              }}
            >
              {current.label}
            </span>
          </div>

          <h2 className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
            {current.title}
          </h2>

          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            {current.body}
          </p>

          {Array.isArray(current.bullets) && current.bullets.length > 0 && (
            <ul className="mt-4 space-y-2">
              {current.bullets.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: current.accent }}
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={handleCtaClick}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: current.accent }}
          >
            {current.cta}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-shrink-0 flex items-center gap-3 border-t border-gray-100 px-5 py-4 sm:px-7">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-0"
            aria-label="Previous"
          >
            <ArrowLeftIcon className="h-4 w-4 text-gray-500" />
          </button>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
            {visibleItems.map((it, i) => {
              const active = i === step;
              return (
                <button
                  key={it.id}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: active ? 22 : 6,
                    height: 6,
                    backgroundColor: active ? current.accent : '#E5E7EB',
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={goNext}
            className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: current.accent }}
          >
            {isLast ? 'Got it' : (
              <>
                Next
                <ArrowRightIcon className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** One-time full feature tour for fresh signups — per user, not per release. */
export function featureTourSeenKey(userId) {
  return `featureTour_seen_v1_${userId || 'anon'}`;
}

export function whatsNewSeenKey(userId) {
  return `whatsNew_v${RELEASE_TAG}_seen_${userId}`;
}

export { RELEASE_TAG };
