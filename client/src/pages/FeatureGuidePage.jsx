/**
 * "What you can do" — the whole app on one page.
 *
 * Every card ends in a button that opens the actual screen, because a feature
 * tour that leaves you to go find it yourself is a brochure.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { sendContactEmail } from '../services/contactEmail';
import { buildFeatureGuide, countFeatures, isCoachViewer } from '../content/featureGuide';
import { pinShellDuringKeyboard, scrollIntoViewWithin, scrollToTopWithin } from '../utils/scrollWithin';
import { GUIDE_SCROLL_TOP_EVENT } from '../utils/guideEvents';

function FeatureCard({ entry, onOpen }) {
  const Icon = entry.icon;
  const accent = entry.accent || '#6366f1';
  const external = /^https?:\/\//.test(entry.href);

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-gray-200 p-5 h-full">
      <div className="flex items-start gap-3">
        <div
          className="p-2.5 rounded-xl flex-shrink-0"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          {Icon ? <Icon className="w-5 h-5" /> : null}
        </div>
        <div className="min-w-0">
          {entry.label && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{entry.label}</p>
          )}
          <h3 className="font-semibold text-gray-900 leading-snug">{entry.title}</h3>
        </div>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed mt-3">{entry.body}</p>

      {entry.bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {entry.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[13px] text-gray-500 leading-snug">
              <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onOpen(entry)}
        style={{ color: accent, touchAction: 'manipulation' }}
        className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold min-h-[44px] active:opacity-70"
      >
        {entry.cta}
        {external
          ? <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          : <span aria-hidden="true">→</span>}
      </button>
    </div>
  );
}

/**
 * The bottom of the guide, for the thing the guide did not answer.
 *
 * It goes through the EmailJS service the app already uses for its feedback
 * widget, rather than a mailto: link — tapping mailto inside the iOS app hands
 * the athlete to Mail, and most people do not come back.
 */
const QuestionForm = React.forwardRef(function QuestionForm({ user, textareaRef }, ref) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);

  const canSend = message.trim().length > 0 && state !== 'sending';

  const send = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setState('sending');
    setError(null);
    try {
      await sendContactEmail({
        subject: 'Question from the guide',
        message: message.trim(),
        email: email.trim(),
        name: [user?.name, user?.surname].filter(Boolean).join(' '),
        page: '/guide',
      });
      setState('sent');
      setMessage('');
    } catch (err) {
      setState('error');
      setError(err?.text || err?.message || 'Could not send it. Please try again in a moment.');
    }
  };

  if (state === 'sent') {
    return (
      <div ref={ref} className="bg-white rounded-2xl border border-green-200 p-6 text-center">
        <CheckCircleIcon className="w-8 h-8 text-green-500 mx-auto" />
        <p className="font-semibold text-gray-900 mt-2">Sent — thank you.</p>
        <p className="text-sm text-gray-500 mt-1">
          We read every one of these{email.trim() ? ` and will reply to ${email.trim()}` : ''}.
        </p>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="mt-3 text-sm font-semibold text-primary min-h-[44px]"
        >
          Ask something else
        </button>
      </div>
    );
  }

  return (
    <form ref={ref} onSubmit={send} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      <h2 className="text-lg font-bold text-gray-900">Still have a question?</h2>
      <p className="text-sm text-gray-500 mt-1">
        Ask about anything above — or tell us what the app is missing. It lands in our inbox.
      </p>

      <label htmlFor="guide-question" className="sr-only">Your question</label>
      <textarea
        ref={textareaRef}
        onFocus={() => pinShellDuringKeyboard()}
        id="guide-question"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="What would you like to know?"
        className="mt-4 w-full rounded-xl border border-gray-200 p-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50 resize-y"
      />

      <label htmlFor="guide-email" className="block text-xs font-medium text-gray-500 mt-3">
        Where should we reply?
      </label>
      <input
        id="guide-email"
        onFocus={() => pinShellDuringKeyboard()}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="you@example.com"
        className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-gray-200 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
      />

      {state === 'error' && (
        <p className="text-sm text-red-600 mt-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSend}
        style={{ touchAction: 'manipulation' }}
        className="mt-4 w-full min-h-[48px] rounded-xl bg-primary text-white font-semibold disabled:opacity-40 active:opacity-80"
      >
        {state === 'sending' ? 'Sending…' : 'Send question'}
      </button>
    </form>
  );
});

export default function FeatureGuidePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');

  const rootRef = useRef(null);
  const formRef = useRef(null);
  const questionRef = useRef(null);

  const isCoach = isCoachViewer(user);
  const isAdmin = user?.role === 'admin' || user?.admin === true;

  // Tapping the header icon again, while already here, scrolls back to the top
  // — the same thing tapping an active tab does everywhere else on iOS.
  useEffect(() => {
    const onScrollTop = () => scrollToTopWithin(rootRef.current);
    window.addEventListener(GUIDE_SCROLL_TOP_EVENT, onScrollTop);
    return () => window.removeEventListener(GUIDE_SCROLL_TOP_EVENT, onScrollTop);
  }, []);

  const goToForm = () => {
    scrollIntoViewWithin(formRef.current);
    // Focusing mid-scroll fights the animation on iOS; let it land first. The
    // keyboard then scrolls the document to reveal the field, which in the
    // fixed native shell only drags the chrome away — so put it back.
    setTimeout(() => {
      questionRef.current?.focus();
      pinShellDuringKeyboard();
    }, 450);
  };
  // Only the profile's own token proves a connection here; the guide is not
  // worth an API round-trip, and "unknown" simply keeps the card visible.
  const stravaConnected = user?.strava?.accessToken || user?.strava?.athleteId ? true : undefined;

  const sections = useMemo(
    () => buildFeatureGuide({ isCoach, isAdmin, stravaConnected, query }),
    [isCoach, isAdmin, stravaConnected, query],
  );
  const total = useMemo(
    () => countFeatures({ isCoach, isAdmin, stravaConnected }),
    [isCoach, isAdmin, stravaConnected],
  );
  const shown = sections.reduce((n, s) => n + s.items.length, 0);

  const open = (entry) => {
    if (/^https?:\/\//.test(entry.href)) {
      window.open(entry.href, '_blank', 'noopener');
      return;
    }
    navigate(entry.href);
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">What you can do in LaChart</h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              {total} things this app does, each one a tap away. Tap any card to go straight there.
            </p>
          </div>
          {/* Up here as well as at the bottom: someone who cannot find what they
              came for should not have to scroll past thirty cards to ask. */}
          <button
            type="button"
            onClick={goToForm}
            style={{ touchAction: 'manipulation' }}
            className="flex-shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 sm:px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-primary active:opacity-70 hover:border-primary/40"
          >
            <EnvelopeIcon className="w-4 h-4" />
            <span>Contact</span>
          </button>
        </header>

        <div className="relative mt-5">
          <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — lactate, Garmin, races, zones…"
            aria-label="Search features"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full min-h-[48px] pl-11 pr-10 rounded-2xl border border-gray-200 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 active:text-gray-600"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {query && (
          <p className="text-xs text-gray-400 mt-2">
            {shown === 0 ? 'Nothing matches that.' : `${shown} of ${total}`}
          </p>
        )}

        {sections.length === 0 && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-600">
              No feature matches “{query}”. Try a shorter word — or ask us on the support page.
            </p>
            <button
              type="button"
              onClick={() => navigate('/support')}
              className="mt-3 text-sm font-semibold text-primary min-h-[44px]"
            >
              Open support →
            </button>
          </div>
        )}

        <div className="mt-6 space-y-8">
          {sections.map((section) => (
            <section key={section.id}>
              <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{section.blurb}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {section.items.map((entry) => (
                  <FeatureCard key={entry.id} entry={entry} onOpen={open} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 pb-16">
          <QuestionForm ref={formRef} textareaRef={questionRef} user={user} />
        </div>
      </div>
    </div>
  );
}
